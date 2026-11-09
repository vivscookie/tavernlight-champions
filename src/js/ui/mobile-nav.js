// Menu principal no mobile (< lg): botão com aria-expanded, Esc fecha e devolve o foco ao botão.
const toggle = document.getElementById('mobile-nav-toggle');
const panel = document.getElementById('mobile-nav');

if (toggle && panel) {
  const icon = toggle.querySelector('.material-symbols-outlined');
  const desktop = window.matchMedia('(min-width: 1024px)');

  const setOpen = (open) => {
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close main menu' : 'Open main menu');
    if (icon) icon.textContent = open ? 'close' : 'menu';
  };

  toggle.addEventListener('click', () => setOpen(panel.hidden));

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) {
      setOpen(false);
      toggle.focus();
    }
  });
  // Clicar num link ou fora do menu fecha
  panel.addEventListener('click', (e) => {
    if (e.target.closest('a')) setOpen(false);
  });
  document.addEventListener('click', (e) => {
    if (!panel.hidden && !panel.contains(e.target) && !toggle.contains(e.target)) setOpen(false);
  });
  // Ao ampliar para o layout desktop, fecha o painel
  desktop.addEventListener('change', (e) => {
    if (e.matches) setOpen(false);
  });
}
