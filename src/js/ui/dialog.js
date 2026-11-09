// Diálogo modal baseado em <dialog> nativo (foco preso, Esc fecha, backdrop).
// Substitui alert() quando a mensagem precisa de resumo e de ações.

// <dialog>.close() não existe em todos os ambientes (ex.: jsdom, navegadores muito antigos): cai no equivalente manual
function closeDialog(dialog) {
  if (typeof dialog.close === 'function') dialog.close();
  else {
    dialog.removeAttribute('open');
    dialog.dispatchEvent(new Event('close'));
  }
}

/**
 * @param {{ title: string, message?: string, details?: Array<[string,string]>,
 *           actions?: Array<{ id?: string, label: string, href?: string, primary?: boolean }> }} opts
 * @returns {Promise<string>} id da ação escolhida ('dismiss' se fechado com Esc)
 */
export function showDialog({ title, message = '', details = [], actions = [{ id: 'ok', label: 'OK', primary: true }] } = {}) {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    const titleId = `dlg-${Math.random().toString(36).slice(2, 8)}`;
    dialog.setAttribute('aria-labelledby', titleId);
    dialog.className =
      'w-[calc(100%-2rem)] max-w-md p-0 rounded-xl bg-surface-container text-on-surface shadow-2xl border border-outline-variant/30 backdrop:bg-black/60';

    const box = document.createElement('div');
    box.className = 'flex flex-col gap-space-md p-space-lg';

    const h = document.createElement('h2');
    h.id = titleId;
    h.className = 'font-headline-sm text-headline-sm';
    h.textContent = title;
    box.append(h);

    if (message) {
      const p = document.createElement('p');
      p.className = 'font-body-md text-body-md text-on-surface-variant';
      p.textContent = message;
      box.append(p);
    }

    if (details.length) {
      const dl = document.createElement('dl');
      dl.className = 'grid grid-cols-[auto_1fr] gap-x-space-md gap-y-space-xs p-space-md rounded-lg bg-surface-container-low font-body-sm text-body-sm';
      for (const [k, v] of details) {
        const dt = document.createElement('dt');
        dt.className = 'text-outline';
        dt.textContent = k;
        const dd = document.createElement('dd');
        dd.className = 'text-on-surface text-right';
        dd.textContent = v;
        dl.append(dt, dd);
      }
      box.append(dl);
    }

    const bar = document.createElement('div');
    bar.className = 'flex flex-col-reverse sm:flex-row sm:justify-end gap-space-sm pt-space-xs';
    let result = 'dismiss';

    actions.forEach((a, i) => {
      const cls = a.primary
        ? 'px-space-lg py-space-sm rounded-full bg-primary-container text-on-primary-container font-title-ui text-title-ui font-bold text-center hover:bg-primary transition-colors'
        : 'px-space-lg py-space-sm rounded-full bg-surface-container-high text-on-surface font-title-ui text-title-ui text-center hover:bg-surface-bright transition-colors';
      let el;
      if (a.href) {
        el = document.createElement('a');
        el.href = a.href;
      } else {
        el = document.createElement('button');
        el.type = 'button';
        el.addEventListener('click', () => {
          result = a.id ?? String(i);
          closeDialog(dialog);
        });
      }
      el.className = `${cls} focus-visible:ring-2 focus-visible:ring-primary`;
      el.textContent = a.label;
      if (a.primary) el.setAttribute('autofocus', '');
      bar.append(el);
    });

    box.append(bar);
    dialog.append(box);
    dialog.addEventListener('close', () => {
      dialog.remove();
      resolve(result);
    });
    document.body.append(dialog);

    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', ''); // navegadores/ambientes sem suporte
  });
}
