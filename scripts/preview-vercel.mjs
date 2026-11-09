// Serve o dist/ do jeito que a Vercel serve: aplica os cabeçalhos do vercel.json e responde 404.html (status 404)
// para o que não existe. Para conferir o deploy ANTES de publicar:   npm run build:vercel && npm run preview:vercel
// Não replica reescritas/funções da Vercel; só arquivos estáticos + cabeçalhos + 404.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

// "source" do vercel.json -> RegExp (só o subconjunto que usamos: "(.*)" e prefixos)
const toRegex = (source) => new RegExp(`^${source.replace(/\(\.\*\)/g, '.*')}$`);

export function createPreviewServer(distDir, vercelJsonPath) {
  const cfg = JSON.parse(fs.readFileSync(vercelJsonPath, 'utf8'));
  const rules = (cfg.headers ?? []).map((h) => ({ re: toRegex(h.source), headers: h.headers }));
  const send = (res, status, file, urlPath) => {
    const body = fs.readFileSync(file);
    const headers = { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream' };
    for (const r of rules) if (r.re.test(urlPath)) for (const h of r.headers) headers[h.key] = h.value;
    res.writeHead(status, headers);
    res.end(body);
  };
  return http.createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = path.join(distDir, urlPath === '/' ? 'index.html' : urlPath);
    if (!file.startsWith(distDir)) file = path.join(distDir, '404.html'); // sem sair da pasta
    if (fs.existsSync(file) && fs.statSync(file).isFile()) return send(res, 200, file, urlPath);
    const nf = path.join(distDir, '404.html');
    if (fs.existsSync(nf)) return send(res, 404, nf, urlPath);
    res.writeHead(404).end('Not found');
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const port = Number(process.env.PORT ?? 4173);
  createPreviewServer(path.join(root, 'dist'), path.join(root, 'vercel.json')).listen(port, () => console.log(`[preview-vercel] http://localhost:${port}  (dist/ + cabeçalhos do vercel.json + 404.html)`));
}
