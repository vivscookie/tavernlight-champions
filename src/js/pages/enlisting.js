import { getRegistration, saveStep, completeStep, goToStep, guardStep } from '../registration-state.js';

if (guardStep(3)) init();

function init() {
  const cards = Array.from(document.querySelectorAll('.game-card[data-game]'));
  const counterEl = document.getElementById('enrolledCount');
  const backLink = document.querySelector('[data-nav="back"]');
  const draftBtn = document.querySelector('[data-action="save-draft"]');

  const checkbox = (card) => card.querySelector('input[type="checkbox"]');
  const enlisted = () => cards.filter((c) => checkbox(c).checked).map((c) => c.dataset.game);

  // O visual (faixa, pílula, sombra, detalhes) é CSS puro, guiado por data-enlisted (group-data-[enlisted=true])
  const paint = (card) => {
    const on = checkbox(card).checked;
    card.dataset.enlisted = String(on);
    // Campos de um jogo não marcado ficam desabilitados: não são enviados nem validados
    document
      .getElementById(`${card.dataset.game}-details`)
      ?.querySelectorAll('select, input')
      .forEach((el) => {
        el.disabled = !on;
      });
  };

  function updateCounter() {
    counterEl.textContent = `${enlisted().length} of ${cards.length} Selected`; // total vem do DOM, não fixo
  }

  // Estado salvo (se houver) sobrepõe o padrão do HTML
  const saved = getRegistration().games;
  if (saved && Array.isArray(saved.enlisted)) {
    cards.forEach((c) => {
      checkbox(c).checked = saved.enlisted.includes(c.dataset.game);
    });
  }

  cards.forEach((card) => {
    checkbox(card).addEventListener('change', () => {
      paint(card);
      updateCounter();
    });
    paint(card);
  });
  updateCounter();

  const snapshot = () => ({ enlisted: enlisted() });

  backLink?.addEventListener('click', (e) => {
    e.preventDefault();
    saveStep('games', snapshot());
    goToStep(2);
  });
  draftBtn?.addEventListener('click', () => {
    const ok = saveStep('games', snapshot());
    // O texto do botão é o último nó de texto (o primeiro filho é o ícone)
    const textNode = [...draftBtn.childNodes].reverse().find((n) => n.nodeType === 3 && n.textContent.trim());
    if (!textNode) return;
    const original = textNode.textContent;
    textNode.textContent = ok ? ' Draft saved ' : ' Could not save ';
    setTimeout(() => {
      textNode.textContent = original;
    }, 2000);
  });
  document.getElementById('enlisting-form').addEventListener('submit', (e) => {
    e.preventDefault();
    saveStep('games', snapshot());
    completeStep(3);
    goToStep(4);
  });
}
