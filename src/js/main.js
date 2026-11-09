// Entrada comum a todas as páginas: CSS compilado do Tailwind + menu mobile.
import '../styles/main.css';
import './ui/mobile-nav.js';

// Modo demonstração (API simulada): mostra a faixa "Demo mode". Acessos DIRETOS a import.meta.env.*, para o Vite
// descartar este ramo (e o banner) do build de produção em modo live.
if (import.meta.env.VITE_API_MODE === 'mock' || (import.meta.env.VITE_API_MODE === undefined && import.meta.env.DEV)) {
  import('./ui/demo-banner.js');
}
