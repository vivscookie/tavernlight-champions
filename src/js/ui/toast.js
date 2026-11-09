// Notificações não bloqueantes (substituem alert()).
// Sucesso/info usam role="status" (leitura educada); erro usa role="alert" (leitura imediata).
const TONES = {
  success: { icon: 'check_circle', iconClass: 'text-primary' },
  error: { icon: 'error', iconClass: 'text-error' },
  info: { icon: 'info', iconClass: 'text-tertiary' },
};

let region = null;

function getRegion() {
  if (region?.isConnected) return region;
  region = document.createElement('div');
  region.className =
    'fixed bottom-space-md left-space-md right-space-md sm:left-auto z-[100] flex flex-col items-stretch sm:items-end gap-space-xs pointer-events-none';
  region.dataset.role = 'toast-region';
  document.body.append(region);
  return region;
}

/**
 * @param {{ title: string, message?: string, tone?: 'success'|'error'|'info', duration?: number }} opts
 * @returns {() => void} função que fecha o toast
 */
export function showToast({ title, message = '', tone = 'info', duration } = {}) {
  const t = TONES[tone] ?? TONES.info;
  const ms = duration ?? (tone === 'error' ? 8000 : 5000);

  const el = document.createElement('div');
  el.setAttribute('role', tone === 'error' ? 'alert' : 'status');
  el.className =
    'pointer-events-auto flex items-start gap-space-sm w-full sm:w-96 p-space-md rounded-xl bg-surface-container-highest text-on-surface shadow-2xl border border-outline-variant/30 opacity-0 translate-y-2 transition duration-200 motion-reduce:transition-none';

  const icon = document.createElement('span');
  icon.className = `material-symbols-outlined shrink-0 ${t.iconClass}`;
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = t.icon;

  const body = document.createElement('div');
  body.className = 'flex flex-col gap-1 min-w-0 flex-1';
  const titleEl = document.createElement('span');
  titleEl.className = 'font-title-ui text-title-ui';
  titleEl.textContent = title;
  body.append(titleEl);
  if (message) {
    const msgEl = document.createElement('span');
    msgEl.className = 'font-body-sm text-body-sm text-on-surface-variant';
    msgEl.textContent = message;
    body.append(msgEl);
  }

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'shrink-0 text-on-surface-variant hover:text-on-surface focus-visible:ring-2 focus-visible:ring-primary rounded';
  close.setAttribute('aria-label', 'Dismiss notification');
  close.innerHTML = '<span class="material-symbols-outlined text-[20px]" aria-hidden="true">close</span>';

  el.append(icon, body, close);
  getRegion().append(el);
  requestAnimationFrame(() => el.classList.remove('opacity-0', 'translate-y-2'));

  let timer = null;
  let gone = false;
  const dismiss = () => {
    if (gone) return;
    gone = true;
    clearTimeout(timer);
    el.classList.add('opacity-0');
    setTimeout(() => el.remove(), 200);
  };
  const arm = () => {
    clearTimeout(timer);
    if (ms > 0) timer = setTimeout(dismiss, ms);
  };
  close.addEventListener('click', dismiss);
  // Pausa o fechamento automático enquanto o usuário lê (mouse ou foco)
  el.addEventListener('mouseenter', () => clearTimeout(timer));
  el.addEventListener('mouseleave', arm);
  el.addEventListener('focusin', () => clearTimeout(timer));
  el.addEventListener('focusout', arm);
  arm();
  return dismiss;
}
