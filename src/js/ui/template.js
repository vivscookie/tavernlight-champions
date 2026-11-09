// Binder de <template>: o markup fica no HTML (designer edita), os dados vêm da API.
// Tudo é inserido com textContent/setAttribute, então dado da API nunca vira HTML (sem XSS).
//
//   data-text="campo.sub|pipe"       texto do elemento
//   data-attr="atributo:campo|pipe;outro:campo"   atributos (id, data-*, aria-*, href…)
//   data-src="campo"                 src de <img> (só http(s)/relativo); sem valor, remove o elemento
//   data-if="campo" / data-unless="campo"   remove o elemento se falso / verdadeiro
//   <template data-each="lista">     repete o conteúdo para cada item (o item vira o contexto)
import { PIPES, safeImageUrl, safeUrl } from './format.js';

// Atributos que carregam URL: o valor vindo da API é validado (http/https/relativo) antes de gravar
const URL_ATTRS = new Set(['href', 'src', 'action', 'formaction', 'poster', 'xlink:href']);
function setAttr(el, name, value) {
  if (URL_ATTRS.has(name.toLowerCase())) {
    const safe = safeUrl(value);
    if (safe) el.setAttribute(name, safe);
    else el.removeAttribute(name);
    return;
  }
  el.setAttribute(name, value);
}

const get = (obj, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);

function resolve(expr, ctx) {
  const [path, ...pipes] = expr.split('|').map((s) => s.trim());
  let v = get(ctx, path);
  for (const name of pipes) {
    const fn = PIPES[name];
    if (!fn) throw new Error(`[template] pipe desconhecido "${name}" em "${expr}"`);
    if (v != null) v = fn(v);
  }
  return v;
}

function bind(root, ctx, keep = false) {
  // keep=true: atualiza elementos que ficam na página (mantém os data-*, esconde em vez de remover)
  if (keep) return bindInPlace(root, ctx);
  // 1) condicionais primeiro: não vale a pena preencher o que vai sair
  for (const el of [...root.querySelectorAll('[data-if],[data-unless]')]) {
    const keep = el.hasAttribute('data-if') ? Boolean(resolve(el.dataset.if, ctx)) : !resolve(el.dataset.unless, ctx);
    if (!keep) el.remove();
    else {
      el.removeAttribute('data-if');
      el.removeAttribute('data-unless');
    }
  }
  // 2) listas aninhadas
  for (const tpl of [...root.querySelectorAll('template[data-each]')]) {
    const items = resolve(tpl.dataset.each, ctx) ?? [];
    const frag = document.createDocumentFragment();
    for (const item of items) frag.append(renderTemplate(tpl, { ...ctx, ...item, $parent: ctx }));
    tpl.replaceWith(frag);
  }
  // 3) texto, imagem e atributos
  for (const el of root.querySelectorAll('[data-text]')) {
    const v = resolve(el.dataset.text, ctx);
    el.textContent = v == null ? '' : String(v);
    el.removeAttribute('data-text');
  }
  for (const el of root.querySelectorAll('[data-src]')) {
    const url = safeImageUrl(resolve(el.dataset.src, ctx));
    if (url) el.setAttribute('src', url);
    else el.remove();
    el.removeAttribute('data-src');
  }
  for (const el of root.querySelectorAll('[data-attr]')) {
    for (const pair of el.dataset.attr.split(';').map((s) => s.trim()).filter(Boolean)) {
      const i = pair.indexOf(':');
      const v = resolve(pair.slice(i + 1), ctx);
      if (v != null) setAttr(el, pair.slice(0, i).trim(), String(v));
    }
    el.removeAttribute('data-attr');
  }
  return root;
}

function bindInPlace(root, ctx) {
  // Campo que o contexto não conhece (undefined) fica como está: dá para atualizar só uma parte da tela
  // sem apagar o resto. Para limpar de propósito, passe null.
  for (const el of root.querySelectorAll('[data-text]')) {
    const v = resolve(el.dataset.text, ctx);
    if (v === undefined) continue;
    el.textContent = v === null ? '' : String(v);
  }
  for (const el of root.querySelectorAll('[data-src]')) {
    const raw = resolve(el.dataset.src, ctx);
    if (raw === undefined) continue;
    const url = safeImageUrl(raw);
    if (url) {
      el.setAttribute('src', url);
      el.hidden = false;
    } else {
      el.removeAttribute('src');
      el.hidden = true;
    }
  }
  for (const el of root.querySelectorAll('[data-attr]')) {
    for (const pair of el.dataset.attr.split(';').map((x) => x.trim()).filter(Boolean)) {
      const i = pair.indexOf(':');
      const v = resolve(pair.slice(i + 1), ctx);
      if (v != null) setAttr(el, pair.slice(0, i).trim(), String(v));
    }
  }
  return root;
}

/** Clona um <template> e preenche com `ctx`. Retorna um DocumentFragment. */
export function renderTemplate(tpl, ctx) {
  const frag = tpl.content.cloneNode(true);
  bind(frag, ctx);
  return frag;
}

/** Atualiza elementos que já estão na página (data-text/data-src/data-attr). Pode ser chamado de novo a cada mudança. */
export const bindElement = (root, ctx) => bind(root, ctx, true);

/** Esvazia `container` e o preenche com um item por elemento de `items`. `toCtx(item, índice)` monta o contexto. */
export function renderList(container, tpl, items, toCtx = (x) => x) {
  const frag = document.createDocumentFragment();
  items.forEach((item, i) => frag.append(renderTemplate(tpl, toCtx(item, i))));
  container.replaceChildren(frag);
}
