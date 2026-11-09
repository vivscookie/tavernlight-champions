// Plugin do Vite: monta as páginas a partir de partials, sem framework e sem JS em runtime.
//
//   <include src="partials/header.html" active="dashboard"></include>
//
// - Cada atributo do <include> vira uma variável {{nome}} dentro do partial.
// - {{site.a.b}} lê de src/data/site.json (escapado).
// - {{{nav}}}, {{{steps}}}, {{{footerLinks}}} são blocos HTML gerados aqui.
// - src="img:slug" vira o arquivo local em public/img/ (ou a URL remota do manifesto,
//   enquanto `npm run assets:fetch` não tiver sido executado).
import fs from 'node:fs';
import path from 'node:path';
import { PIPES } from '../src/js/ui/format.js';

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const lookup = (obj, dotted) => dotted.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);

const NAV_ON =
  'px-space-md py-space-xs font-title-ui text-title-ui transition-colors bg-primary-container text-on-primary-container font-bold rounded-full shadow-[0_0_12px_rgba(229,169,60,0.25)]';
const NAV_OFF =
  'px-space-md py-space-xs rounded-full font-title-ui text-title-ui text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors';

const MNAV_ON =
  'block px-space-md py-space-sm rounded-lg bg-primary-container text-on-primary-container font-bold font-title-ui text-title-ui';
const MNAV_OFF =
  'block px-space-md py-space-sm rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high font-title-ui text-title-ui transition-colors';

const STEP_ON =
  'flex items-center justify-center gap-space-xs py-space-xs px-space-sm rounded-full bg-primary-container text-on-primary-container shadow-md';
const STEP_DONE =
  'flex items-center justify-center gap-space-xs py-space-xs px-space-sm rounded-full bg-surface-container-low text-primary hover:text-on-surface transition-colors';
const STEP_OFF =
  'flex items-center justify-center gap-space-xs py-space-xs px-space-sm rounded-full bg-surface-container-low text-on-surface-variant';

export default function htmlPartials({ srcDir, imgDir, site, assets }) {
  let base = '/';
  let isBuild = false;
  const warned = new Set();

  const read = (rel) => fs.readFileSync(path.join(srcDir, rel), 'utf8');

  function renderNav(active) {
    return site.nav
      .map((n) => {
        const on = n.id === active;
        return `<a class="${on ? NAV_ON : NAV_OFF}" href="${esc(n.href)}"${on ? ' aria-current="page"' : ''}>${esc(n.label)}</a>`;
      })
      .join('');
  }

  function renderNavMobile(active) {
    return site.nav
      .map((n) => {
        const on = n.id === active;
        return `<li><a class="${on ? MNAV_ON : MNAV_OFF}" href="${esc(n.href)}"${on ? ' aria-current="page"' : ''}>${esc(n.label)}</a></li>`;
      })
      .join('');
  }

  function renderSteps(current) {
    const cur = Number(current);
    return site.steps
      .map((s) => {
        const state = s.n === cur ? 'on' : s.n < cur ? 'done' : 'off';
        const badge =
          state === 'done'
            ? '<span class="material-symbols-outlined text-[16px]" aria-hidden="true">check_circle</span>'
            : `<span class="flex items-center justify-center w-5 h-5 rounded-full ${
                state === 'on' ? 'bg-on-primary-container text-primary' : 'bg-surface-variant text-outline'
              } font-title-ui text-body-sm leading-none" aria-hidden="true">${s.n}</span>`;
        const label = `<span class="font-title-ui text-title-ui tracking-wider uppercase truncate">${esc(s.label)}</span>`;
        const inner = `${badge}${label}`;
        const cls = state === 'on' ? STEP_ON : state === 'done' ? STEP_DONE : STEP_OFF;
        const content = state === 'done' ? `<a class="${cls}" href="${esc(s.href)}">${inner}</a>` : `<span class="${cls}">${inner}</span>`;
        return `<li${state === 'on' ? ' aria-current="step"' : ''}>${content}</li>`;
      })
      .join('');
  }

  function renderFooterLinks() {
    return site.footerLinks
      .map((l) =>
        l.href
          ? `<a class="hover:text-primary transition-colors" href="${esc(l.href)}">${esc(l.label)}</a>`
          : // destino ainda não existe: texto desabilitado, nunca um link morto (href="#")
            `<span class="cursor-not-allowed opacity-60" aria-disabled="true" title="Coming soon">${esc(l.label)}<span class="sr-only"> (coming soon)</span></span>`,
      )
      .join('');
  }

  // Falha o build (ou avisa, no dev) quando o HTML gerado viola regras de semântica
  function lint(html, where) {
    const problems = [];
    const tags = (re) => [...html.matchAll(re)].map((m) => m[0]);
    for (const t of tags(/<button\b[^>]*>/g)) if (!/\stype="/.test(t)) problems.push(`<button> sem type: ${t.slice(0, 90)}`);
    for (const t of tags(/<a\b[^>]*\shref="#"[^>]*>/g)) problems.push(`link morto href="#": ${t.slice(0, 90)}`);
    for (const t of tags(/<a\b[^>]*\starget="_blank"[^>]*>/g)) if (!/\srel="[^"]*noopener/.test(t)) problems.push(`target="_blank" sem rel="noopener": ${t.slice(0, 90)}`);
    const ids = {};
    for (const m of html.matchAll(/\sid="([^"]+)"/g)) ids[m[1]] = (ids[m[1]] || 0) + 1;
    for (const [id, n] of Object.entries(ids)) if (n > 1) problems.push(`id duplicado "${id}" (${n}x)`);
    for (const m of html.matchAll(/\sform="([^"]+)"/g)) if (!new RegExp(`<form\\b[^>]*\\sid="${m[1]}"`).test(html)) problems.push(`form="${m[1]}" aponta para um <form> inexistente`);
    for (const m of html.matchAll(/<label\b[^>]*\sfor="([^"]+)"/g)) if (!ids[m[1]]) problems.push(`<label for="${m[1]}"> sem controle com esse id`);
    // Botões e links precisam de nome acessível (texto visível, sr-only, alt de imagem ou aria-label)
    const nameOf = (open, inner) => {
      if (/\saria-label="[^"]+"|\saria-labelledby="[^"]+"/.test(open)) return true;
      if (/<img\b[^>]*\salt="[^"]+"/.test(inner)) return true;
      const text = inner.replace(/<span\b[^>]*material-symbols-outlined[^>]*>.*?<\/span>/gs, '').replace(/<[^>]+>/g, '').replace(/&nbsp;|\s+/g, '');
      return text.length > 0;
    };
    for (const m of html.matchAll(/<button\b([^>]*)>(.*?)<\/button>/gs)) if (!nameOf(m[1], m[2])) problems.push(`<button> sem nome acessível: ${m[0].replace(/\s+/g, ' ').slice(0, 100)}`);
    for (const m of html.matchAll(/<a\b([^>]*\shref="[^"]+"[^>]*)>(.*?)<\/a>/gs)) if (!nameOf(m[1], m[2])) problems.push(`<a> sem nome acessível: ${m[0].replace(/\s+/g, ' ').slice(0, 100)}`);
    if (/<main\b/.test(html) && !/<main\b[^>]*\sid="main-content"/.test(html)) problems.push('<main> sem id="main-content" (alvo do skip link)');
    // Templates: todo pipe usado em data-text / data-attr precisa existir em src/js/ui/format.js (PIPES)
    const exprs = [...html.matchAll(/\sdata-text="([^"]+)"/g)].map((m) => m[1]);
    for (const m of html.matchAll(/\sdata-attr="([^"]+)"/g)) for (const pair of m[1].split(';')) exprs.push(pair.slice(pair.indexOf(':') + 1));
    for (const e of exprs) for (const pipe of e.split('|').slice(1).map((x) => x.trim())) if (!(pipe in PIPES)) problems.push(`pipe desconhecido "${pipe}" em "${e}"`);
    for (const m of html.matchAll(/<(\w+)\b[^>]*\sdata-each="[^"]+"/g)) if (m[1] !== 'template') problems.push(`data-each só vale em <template> (achei <${m[1]}>)`);
    if (problems.length) {
      const msg = `[html-partials] ${where}:\n  - ${problems.join('\n  - ')}`;
      if (isBuild) throw new Error(msg);
      console.warn(msg);
    }
  }

  function fill(tpl, attrs, where) {
    const raw = { nav: () => renderNav(attrs.active), navMobile: () => renderNavMobile(attrs.active), steps: () => renderSteps(attrs.current), footerLinks: renderFooterLinks };
    tpl = tpl.replace(/\{\{\{\s*(\w+)\s*\}\}\}/g, (_, k) => {
      if (!raw[k]) throw new Error(`[html-partials] bloco desconhecido {{{${k}}}} em ${where}`);
      return raw[k]();
    });
    return tpl.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => {
      const v = k.startsWith('site.') ? lookup({ site }, k) : attrs[k];
      if (v === undefined) throw new Error(`[html-partials] variável {{${k}}} sem valor em ${where}`);
      return esc(v);
    });
  }

  // Resolve um slug para o arquivo local (public/img) ou, na falta dele, a URL remota do manifesto
  function urlFor(slug) {
    const entry = assets[slug];
    if (!entry) throw new Error(`[html-partials] imagem "${slug}" não existe em src/data/assets.json`);
    const local = fs.existsSync(imgDir) ? fs.readdirSync(imgDir).find((f) => f.startsWith(`${slug}.`)) : undefined;
    if (local) return `${base}img/${local}`;
    if (!warned.has(slug)) {
      warned.add(slug);
      console.warn(`[html-partials] "${slug}" ainda não foi baixada: usando a URL remota. Rode: npm run assets:fetch`);
    }
    return entry.url;
  }

  // Ícones Material Symbols são decorativos: o texto da ligatura ("check", "arrow_back") não deve ser lido
  function hideIcons(html) {
    return html.replace(/<span\b([^>]*\bclass="[^"]*material-symbols-outlined[^"]*"[^>]*)>/g, (tag, attrs) =>
      /\saria-hidden=/.test(attrs) ? tag : `<span${attrs} aria-hidden="true">`,
    );
  }

  function resolveImages(html) {
    // background-image: url('img:slug') em estilos inline
    html = html.replace(/url\((['"]?)img:([\w-]+)\1\)/g, (_, q, slug) => `url('${urlFor(slug)}')`);
    return html.replace(/<img\b[^>]*>/g, (tag) => {
      const m = tag.match(/\ssrc="img:([\w-]+)"/);
      if (!m) return tag;
      const slug = m[1];
      const url = urlFor(slug);
      let out = tag.replace(m[0], ` src="${url}"`);
      // Imagens fora do cabeçalho carregam sob demanda
      if (!/\sloading=/.test(out) && !['crest', 'avatar-user'].includes(slug)) out = out.replace('<img', '<img loading="lazy" decoding="async"');
      return out;
    });
  }

  return {
    name: 'html-partials',
    configResolved(cfg) {
      base = cfg.base.endsWith('/') ? cfg.base : `${cfg.base}/`;
      isBuild = cfg.command === 'build';
    },
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        const where = ctx?.filename ? path.basename(ctx.filename) : 'página';
        const includeRe = /<include\s+([^>]*?)\s*(?:\/>|>\s*<\/include>)/g;
        for (let depth = 0; depth < 3 && includeRe.test(html); depth++) {
          includeRe.lastIndex = 0;
          html = html.replace(includeRe, (_, attrStr) => {
            const attrs = {};
            for (const a of attrStr.matchAll(/([\w-]+)="([^"]*)"/g)) attrs[a[1]] = a[2];
            if (!attrs.src) throw new Error(`[html-partials] <include> sem src em ${where}`);
            return fill(read(attrs.src), attrs, attrs.src);
          });
          includeRe.lastIndex = 0;
        }
        // Tokens soltos na própria página (ex.: {{site.season.name}})
        html = fill(html, {}, where);
        html = hideIcons(html);
        lint(html, where);
        return resolveImages(html);
      },
    },
  };
}
