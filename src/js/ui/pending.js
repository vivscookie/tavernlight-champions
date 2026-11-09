// Estado "enviando" de um botão: desabilita (evita duplo clique), marca aria-busy e mostra spinner.
// Devolve { ok, value } em caso de sucesso ou { ok:false, error } em caso de falha, sem lançar exceção.

/**
 * @param {HTMLButtonElement} button
 * @param {{ label: string, keepDisabledOnSuccess?: boolean, doneLabel?: string }} opts
 * @param {() => Promise<any>} task
 */
export async function withPending(button, { label, keepDisabledOnSuccess = false, doneLabel } = {}, task) {
  if (button.disabled) return { ok: false, skipped: true }; // já está enviando

  const original = [...button.childNodes].map((n) => n.cloneNode(true));
  const restore = () => button.replaceChildren(...original.map((n) => n.cloneNode(true)));

  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  const spin = document.createElement('span');
  spin.className = 'material-symbols-outlined text-[18px] animate-spin motion-reduce:animate-none';
  spin.setAttribute('aria-hidden', 'true');
  spin.textContent = 'progress_activity';
  const text = document.createElement('span');
  text.textContent = label;
  button.replaceChildren(spin, text);

  try {
    const value = await task();
    if (keepDisabledOnSuccess) {
      text.textContent = doneLabel ?? label;
      spin.textContent = 'check';
      spin.classList.remove('animate-spin');
      button.removeAttribute('aria-busy');
    } else {
      restore();
      button.disabled = false;
      button.removeAttribute('aria-busy');
    }
    return { ok: true, value };
  } catch (error) {
    restore();
    button.disabled = false;
    button.removeAttribute('aria-busy');
    return { ok: false, error };
  }
}
