// Confere a configuração de deploy na Vercel (vercel.json) contra o build REAL, nos dois modos de API.
// Não há navegador aqui: a CSP é verificada por análise do que o build gera (sem inline, sem eval, hosts permitidos).
// Uso: npm run test:deploy   (faz 2 builds em pasta temporária, ~6 s)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { createPreviewServer } from '../scripts/preview-vercel.mjs';

const P = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const read = (...p) => fs.readFileSync(path.join(P, ...p), 'utf8');

// ---------------------------------------------------------------- vercel.json
const cfg = JSON.parse(read('vercel.json'));
ok(cfg.framework === 'vite' && cfg.outputDirectory === 'dist' && /outDir: path\.join\(root, 'dist'\)/.test(read('vite.config.js')), 'vercel.json: framework vite e outputDirectory "dist" iguais ao outDir do vite.config.js');
ok(cfg.installCommand === 'npm ci' && fs.existsSync(path.join(P, 'package-lock.json')), 'vercel.json: npm ci com package-lock.json presente (instalação reproduzível)');
ok(cfg.cleanUrls === false && cfg.trailingSlash === false, 'vercel.json: URLs como no HTML (name.html), sem redirecionamento 308 a cada navegação');
ok(JSON.parse(read('package.json')).engines?.node === '>=20', 'package.json: engines.node >=20 (a Vercel escolhe o Node por aqui)');

// o buildCommand é um comando de shell: o padrão é MOCK (primeiro deploy funciona sem backend); live quando a variável é definida
// (o comando final roda num sh filho: é assim que o `npm run build` enxerga as variáveis de prefixo; expandir "$VAR" no mesmo shell leria vazio)
const probe = (env) =>
  execFileSync('sh', ['-c', cfg.buildCommand.replace(/npm run build$/, `sh -c 'printf "%s|%s" "$VITE_BASE" "$VITE_API_MODE"'`)], { env: { PATH: process.env.PATH, ...env }, encoding: 'utf8' });
ok(/npm run build$/.test(cfg.buildCommand), 'buildCommand termina em "npm run build"');
ok(probe({}) === '/|mock', 'buildCommand sem VITE_API_MODE no projeto -> base "/" e modo mock (deploy inicial funciona sem backend)');
ok(probe({ VITE_API_MODE: 'live' }) === '/|live', 'buildCommand com VITE_API_MODE=live definido na Vercel -> modo live');

const headers = Object.fromEntries((cfg.headers.find((h) => h.source === '/(.*)')?.headers ?? []).map((h) => [h.key, h.value]));
for (const k of ['Content-Security-Policy', 'X-Content-Type-Options', 'X-Frame-Options', 'Referrer-Policy', 'Permissions-Policy', 'Strict-Transport-Security', 'X-Robots-Tag']) ok(Boolean(headers[k]), `cabeçalho ${k} presente`);
ok(headers['X-Content-Type-Options'] === 'nosniff' && headers['X-Frame-Options'] === 'DENY' && /noindex/.test(headers['X-Robots-Tag']), 'nosniff, X-Frame-Options DENY e noindex (ferramenta interna)');
ok(/max-age=\d{7,}/.test(headers['Strict-Transport-Security']) && !/preload/.test(headers['Strict-Transport-Security']), 'HSTS com validade longa e SEM preload (preload é um compromisso difícil de desfazer)');
const cache = Object.fromEntries(cfg.headers.filter((h) => h.source !== '/(.*)').map((h) => [h.source, h.headers[0].value]));
ok(/immutable/.test(cache['/assets/(.*)']) && /max-age=31536000/.test(cache['/assets/(.*)']), 'assets com hash: cache de 1 ano, immutable');
ok(!/immutable/.test(cache['/img/(.*)']), 'imagens sem hash no nome: cache curto (1 dia), nunca immutable');

// CSP -> diretivas
const csp = Object.fromEntries(headers['Content-Security-Policy'].split(';').map((d) => d.trim()).filter(Boolean).map((d) => { const [n, ...v] = d.split(/\s+/); return [n, v]; }));
ok(csp['default-src']?.join() === "'self'" && csp['script-src']?.join() === "'self'", "CSP: default-src e script-src só 'self' (sem inline, sem eval, sem CDN)");
ok(!JSON.stringify(csp).includes("'unsafe-eval'") && !(csp['script-src'] ?? []).includes("'unsafe-inline'"), "CSP: sem 'unsafe-eval' e sem 'unsafe-inline' em scripts");
ok(csp['style-src'].join() === "'self',https://fonts.googleapis.com" && csp['style-src-attr']?.join() === "'unsafe-inline'", "CSP: estilos só do próprio site e do Google Fonts; a exceção 'unsafe-inline' vale só para atributos style=");
ok(csp['connect-src'].join() === "'self'" && csp['object-src'].join() === "'none'" && csp['frame-ancestors'].join() === "'none'" && csp['base-uri'].join() === "'self'" && csp['form-action'].join() === "'self'", "CSP: API só na mesma origem, sem plugins, sem ser embutido em iframe");
ok('upgrade-insecure-requests' in csp, 'CSP: upgrade-insecure-requests');

// ---------------------------------------------------------------- builds reais
async function buildTo(mode) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), `tl-deploy-${mode}-`));
  const prev = { ...process.env };
  process.env.VITE_BASE = '/'; process.env.VITE_API_MODE = mode; // o mesmo que o buildCommand faz
  const warn = console.warn; console.warn = () => {};
  try { await build({ configFile: path.join(P, 'vite.config.js'), logLevel: 'silent', build: { outDir: out, emptyOutDir: true } }); }
  finally { console.warn = warn; process.env = prev; }
  return out;
}
const hostOf = (u) => { try { return new URL(u).origin; } catch { return null; } };
const allowed = (directive, url) => { const origin = hostOf(url); return origin ? (csp[directive] ?? csp['default-src']).includes(origin) : true; };

for (const mode of ['live', 'mock']) {
  const out = await buildTo(mode);
  const htmls = fs.readdirSync(out).filter((f) => f.endsWith('.html'));
  const files = (ext) => fs.readdirSync(path.join(out, 'assets')).filter((f) => f.endsWith(ext)).map((f) => fs.readFileSync(path.join(out, 'assets', f), 'utf8'));
  const js = files('.js').join('\n');
  const tag = `[${mode}]`;

  ok(htmls.length === 9 && htmls.includes('404.html') && htmls.includes('index.html'), `${tag} dist tem as 8 telas + 404.html`);
  ok(fs.existsSync(path.join(out, 'robots.txt')) && /Disallow: \//.test(fs.readFileSync(path.join(out, 'robots.txt'), 'utf8')), `${tag} robots.txt bloqueia indexação`);

  let inline = 0, handlers = 0, relative = 0, scriptHosts = [], styleHosts = [], noindex = 0;
  for (const f of htmls) {
    const h = fs.readFileSync(path.join(out, f), 'utf8');
    inline += [...h.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>/g)].length;
    handlers += [...h.matchAll(/\son(?:click|change|input|submit|load|error)=/g)].length;
    for (const m of h.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)) { if (!m[1].startsWith('/')) relative++; if (/^https?:/.test(m[1])) scriptHosts.push(m[1]); }
    for (const m of h.matchAll(/<link\b[^>]*\bhref="([^"]+)"[^>]*>/g)) { if (/rel="(modulepreload|stylesheet)"/.test(m[0]) && !/^https?:/.test(m[1]) && !m[1].startsWith('/')) relative++; if (/rel="stylesheet"/.test(m[0]) && /^https?:/.test(m[1])) styleHosts.push(m[1]); }
    if (/<meta name="robots" content="noindex, nofollow">/.test(h)) noindex++;
  }
  ok(inline === 0 && handlers === 0, `${tag} nenhum <script> inline nem onclick=… em ${htmls.length} páginas (a CSP script-src 'self' não bloqueia nada)`);
  ok(relative === 0, `${tag} todos os scripts/estilos usam caminho absoluto (/assets/…): funcionam na 404 em qualquer URL`);
  ok(scriptHosts.length === 0 && styleHosts.every((u) => allowed('style-src', u)), `${tag} sem script externo; folhas de estilo externas só do Google Fonts (${[...new Set(styleHosts.map(hostOf))].join(', ')})`);
  ok(noindex === htmls.length, `${tag} <meta robots noindex> em todas as páginas`);
  ok(!/\beval\(/.test(js) && !/new Function\(/.test(js), `${tag} JS publicado sem eval() nem new Function()`);
  ok(!/fetch\(\s*["'`]https?:/.test(js), `${tag} nenhum fetch() para outra origem (connect-src 'self')`);

  const h404 = fs.readFileSync(path.join(out, '404.html'), 'utf8');
  ok(/<base href="\/">/.test(h404) && /href="index\.html"/.test(h404), `${tag} 404.html usa <base href="/"> (links relativos partem da raiz mesmo em /a/b/c)`);
  ok(htmls.every((f) => !/(?:src|href)="\.\/assets\//.test(fs.readFileSync(path.join(out, f), 'utf8'))), `${tag} base "/" aplicada (nenhum ./assets/…)`);

  if (mode === 'live') {
    ok(!/Demo mode/.test(js) && !/createBackend|dev_dan|Casual Smash/.test(js), `${tag} SEM banner de demo, SEM backend de referência e SEM fixtures no bundle`);
  } else {
    ok(/Demo mode · sample data, nothing is saved/.test(js) && /createBackend/.test(js), `${tag} COM banner "Demo mode" e backend de referência (é o que o primeiro deploy mostra)`);
    ok(/\[api\] modo MOCK/.test(js), `${tag} modo mock avisa no console`);
  }

  if (mode === 'live') {
    // ---- teste de fumaça: o artefato servido como a Vercel serve (cabeçalhos do vercel.json + 404.html)
    const srv = createPreviewServer(out, path.join(P, 'vercel.json'));
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${srv.address().port}`;
    const get = async (p) => { const r = await fetch(base + p); return { status: r.status, headers: r.headers, text: await r.text() }; };
    const idx = await get('/');
    ok(idx.status === 200 && /text\/html/.test(idx.headers.get('content-type')) && /<title>Dashboard/.test(idx.text), `${tag} GET / -> 200 com o index (Dashboard)`);
    ok(idx.headers.get('content-security-policy') === headers['Content-Security-Policy'] && idx.headers.get('x-frame-options') === 'DENY' && /noindex/.test(idx.headers.get('x-robots-tag')), `${tag} as páginas saem com CSP, X-Frame-Options e X-Robots-Tag do vercel.json`);
    ok((await get('/name.html')).status === 200 && (await get('/teammanager.html')).status === 200, `${tag} URLs do HTML (/name.html, /teammanager.html) respondem 200 sem redirecionar`);
    const deep = await get('/algo/que/nao/existe');
    ok(deep.status === 404 && /Page not found/.test(deep.text) && /<base href="\/">/.test(deep.text) && deep.headers.get('content-security-policy'), `${tag} URL inexistente e profunda -> 404 real com a página 404 (e com CSP)`);
    // todo asset referenciado por qualquer página existe e é servido com o cache certo
    const refs = new Set();
    for (const f of htmls) for (const m of fs.readFileSync(path.join(out, f), 'utf8').matchAll(/(?:src|href)="(\/(?:assets|img)\/[^"]+)"/g)) refs.add(m[1]);
    const res = await Promise.all([...refs].map(async (u) => [u, await fetch(base + u)]));
    ok(refs.size >= 10 && [...refs].every((u) => fs.existsSync(path.join(out, u))) && res.every(([, r]) => r.status === 200), `${tag} ${refs.size} arquivos /assets/… referenciados pelas páginas: todos existem (200)`);
    ok(res.filter(([u]) => u.startsWith('/assets/')).every(([, r]) => /immutable/.test(r.headers.get('cache-control') ?? '')), `${tag} /assets/… saem com "Cache-Control: immutable"`);
    ok(res.filter(([u]) => u.endsWith('.js')).every(([, r]) => /javascript/.test(r.headers.get('content-type'))) && res.filter(([u]) => u.endsWith('.css')).every(([, r]) => /text\/css/.test(r.headers.get('content-type'))), `${tag} JS e CSS com Content-Type correto (nosniff não bloqueia módulos)`);
    ok((await get('/robots.txt')).status === 200, `${tag} /robots.txt servido`);
    ok((await get('/api/teams/mine')).status === 404, `${tag} /api/* sem backend responde 404 (por isso o primeiro deploy usa o modo demo)`);
    srv.close();
  }
  fs.rmSync(out, { recursive: true, force: true });
}

console.log(fails ? `\n${fails} FALHAS` : '\nA CONFIGURAÇÃO DE DEPLOY ESTÁ CONSISTENTE COM O BUILD');
process.exit(fails ? 1 : 0);
