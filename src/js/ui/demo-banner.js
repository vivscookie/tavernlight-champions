// Faixa discreta avisando que a API é simulada (dados de exemplo; nada é salvo).
// Só é carregada quando VITE_API_MODE=mock (veja main.js): um deploy público em modo demo nunca deve parecer produção.
const el = document.createElement('aside');
el.setAttribute('aria-label', 'Demo mode');
el.className =
  'fixed bottom-space-md left-space-md z-[90] max-w-[calc(100%-2rem)] pointer-events-none px-space-md py-space-xs rounded-full bg-tertiary-container text-on-tertiary-container font-label-caps text-label-caps shadow-lg';
el.textContent = 'Demo mode · sample data, nothing is saved';
document.body.append(el);
