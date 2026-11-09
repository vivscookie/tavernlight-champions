// Contagem regressiva até um instante ISO. Recalcula a partir do relógio a cada segundo (não acumula atraso
// se a aba ficar em segundo plano) e para sozinha ao chegar em zero.
const timers = new WeakMap();
const pad = (n) => String(n).padStart(2, '0');

/** 8670 -> "02h : 24m : 30s" */
export const formatCountdown = (seconds) => `${pad(Math.floor(seconds / 3600))}h : ${pad(Math.floor((seconds % 3600) / 60))}m : ${pad(seconds % 60)}s`;

/** 9652 -> "02h 40m 52s" (versão compacta, sem separadores) */
export const formatCountdownCompact = (seconds) => `${pad(Math.floor(seconds / 3600))}h ${pad(Math.floor((seconds % 3600) / 60))}m ${pad(seconds % 60)}s`;

/**
 * @param {HTMLElement} el elemento que mostra o tempo (use role="timer": não é anunciado a cada segundo)
 * @param {string} targetIso instante final (ISO 8601)
 * @param {{ doneText?: string, now?: () => number, format?: (seconds: number) => string }} [opts] `format` troca o texto (padrão: "02h : 24m : 30s")
 * @returns {() => void} função que cancela
 */
export function startCountdown(el, targetIso, { doneText = 'Locked', now = () => Date.now(), format = formatCountdown } = {}) {
  stopCountdown(el);
  const target = new Date(targetIso).getTime();
  let done = false;
  const tick = () => {
    const s = Math.max(0, Math.round((target - now()) / 1000));
    el.textContent = s === 0 ? doneText : format(s);
    if (s === 0) {
      done = true;
      stopCountdown(el);
    }
  };
  tick();
  if (!done) timers.set(el, setInterval(tick, 1000));
  return () => stopCountdown(el);
}

export function stopCountdown(el) {
  clearInterval(timers.get(el));
  timers.delete(el);
}
