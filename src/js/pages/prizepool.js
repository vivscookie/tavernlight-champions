import { getRegistration, saveStep, completeStep, clearRegistration, goToStep, guardStep } from '../registration-state.js';
import { submitRegistration, getPool, describeError } from '../api.js';
import { bindElement, renderList } from '../ui/template.js';
import { formatMoney } from '../ui/format.js';
import { showToast } from '../ui/toast.js';
import { showDialog } from '../ui/dialog.js';
import { withPending } from '../ui/pending.js';

if (guardStep(4)) init();

// Textos e tons de cada colocação (cópia da tela); os números vêm da API (GET /seasons/{id}/pool)
const PLACE_COPY = {
  1: { title: '1st Place Champion', tone: 'primary', id: 'payout-1st' },
  2: { title: '2nd Place Runner-Up', tone: 'tertiary', id: 'payout-2nd' },
  3: { title: '3rd Place Finish', tone: 'neutral', id: 'payout-3rd' },
};
function payoutVm(p) {
  const consolation = p.kind === 'consolation';
  const c = consolation ? { title: 'Consolation Split', tone: 'muted', id: 'payout-split' } : PLACE_COPY[p.place];
  return {
    ...p,
    title: c.title,
    tone: c.tone,
    amountId: c.id,
    isFirst: p.place === '1',
    shareLabel: consolation ? `${p.sharePct}% Split` : `${p.sharePct}% Cash Pool`,
    note: consolation ? `Shared (${formatMoney(p.eachCents)} ea.)` : 'Direct Cash Wire Bonus',
    barStyle: `width: ${p.sharePct}%`,
  };
}

function init() {
  const main = document.getElementById('main-content');
  const input = document.getElementById('custom-amount-input');
  const cards = Array.from(document.querySelectorAll('.tier-card'));
  const consent = document.getElementById('consent-payroll');
  const form = document.getElementById('stake-form');
  const registerBtn = document.getElementById('btn-register');
  const MIN = Number(input.min || 0);
  const MAX = Number(input.max || 500);
  const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

  // Trabalha em centavos inteiros para evitar erros de ponto flutuante
  const toCents = (v) => Math.round(Number(v) * 100);

  // O visual do card selecionado é CSS puro (aria-checked:, group-aria-checked:): aqui só o atributo
  function syncCards(amount) {
    const cents = toCents(amount);
    cards.forEach((card) => card.setAttribute('aria-checked', String(Number.isFinite(cents) && cents === toCents(card.dataset.amount))));
    updateTabStops();
  }

  // Roving tabindex: só o card marcado (ou o primeiro, se nenhum) entra na ordem de tabulação
  function updateTabStops() {
    const stop = cards.find((c) => c.getAttribute('aria-checked') === 'true') ?? cards[0];
    cards.forEach((c) => {
      c.tabIndex = c === stop ? 0 : -1;
    });
  }

  // { ok, value } ou { ok:false, message }
  function readAmount() {
    const raw = input.value.trim();
    if (raw === '') return { ok: false, message: 'Enter a contribution amount.' };
    const n = Number(raw);
    if (!Number.isFinite(n)) return { ok: false, message: 'Enter a valid number.' };
    if (n < MIN || n > MAX) return { ok: false, message: `Amount must be between ${money.format(MIN)} and ${money.format(MAX)}.` };
    if (Math.abs(n * 100 - Math.round(n * 100)) > 1e-6) return { ok: false, message: 'Use at most two decimal places.' };
    return { ok: true, value: toCents(n) / 100 };
  }

  function validateInput() {
    const r = readAmount();
    input.setCustomValidity(r.ok ? '' : r.message);
    return r;
  }

  // ---------- Seleção e persistência ----------
  const persist = () => {
    const r = validateInput();
    if (r.ok) saveStep('stake', { amount: r.value });
    return r;
  };

  const choose = (card) => {
    input.value = card.dataset.amount;
    persist();
    syncCards(card.dataset.amount);
  };

  cards.forEach((card) => {
    card.addEventListener('click', () => choose(card));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        choose(card);
        return;
      }
      // Setas movem e selecionam, como num grupo de rádios nativo
      const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (step) {
        e.preventDefault();
        const next = cards[(cards.indexOf(card) + step + cards.length) % cards.length];
        next.focus();
        choose(next);
      }
    });
  });

  input.addEventListener('input', () => {
    const r = persist();
    syncCards(r.ok ? r.value : NaN);
  });
  consent.addEventListener('change', () => consent.setCustomValidity(''));

  document.querySelector('[data-nav="back"]')?.addEventListener('click', () => {
    persist();
    goToStep(3);
  });

  const draftBtn = document.querySelector('[data-action="save-draft"]');
  draftBtn?.addEventListener('click', () => {
    const r = persist();
    showToast(
      r.ok
        ? { tone: 'success', title: 'Draft saved', message: 'You can come back and finish later.', duration: 3000 }
        : { tone: 'error', title: 'Fix the amount first', message: r.message },
    );
  });

  // ---------- Concluir cadastro ----------
  form.addEventListener('submit', async (event) => {
    event.preventDefault(); // Enter no campo de valor também cai aqui
    const r = validateInput();
    if (!r.ok) {
      input.reportValidity();
      input.focus();
      return;
    }
    // O desconto em folha só se aplica a valores > 0, e exige aceite explícito (checkbox começa desmarcado)
    if (r.value > 0 && !consent.checked) {
      consent.setCustomValidity('Confirm the payroll deduction to continue.');
      consent.reportValidity();
      consent.focus();
      return;
    }

    saveStep('stake', { amount: r.value });
    const out = await withPending(registerBtn, { label: 'Submitting registration…' }, () => submitRegistration(getRegistration(), { payrollConsent: consent.checked }));

    if (!out.ok) {
      // Falhas de rede/servidor: o usuário só precisa tentar de novo (a Idempotency-Key evita inscrição dupla)
      const retryable = ['network', 'server', 'rate_limit'].includes(out.error?.kind);
      showToast({
        tone: 'error',
        title: "Couldn't complete your registration",
        message: describeError(out.error) + (retryable ? ' Your selections are saved on this device.' : ''),
      });
      return;
    }

    completeStep(4);
    const registration = getRegistration();
    clearRegistration(); // inscrição enviada: o assistente recomeça limpo
    await showDialog({
      title: 'Registration confirmed',
      message: 'Welcome to the Staff Champions League Arena.',
      details: [
        ['Confirmation', out.value?.id ?? '—'],
        ['Screen name', registration.identity?.gamertag ?? '—'],
        ['Stake', r.value === 0 ? 'Free tier (no deduction)' : `${money.format(r.value)} via payroll deduction`],
      ],
      actions: [{ id: 'home', label: 'Go to dashboard', href: 'index.html', primary: true }, { id: 'stay', label: 'Stay here' }],
    });
  });

  // ---------- Estado inicial ----------
  const saved = getRegistration().stake;
  if (saved && typeof saved.amount === 'number') input.value = String(saved.amount);
  const initial = validateInput();
  syncCards(initial.ok ? initial.value : NaN);

  // ---------- Pote atual (informativo: se falhar, o cadastro continua possível) ----------
  async function loadPool() {
    main.setAttribute('aria-busy', 'true');
    document.getElementById('pool-error').hidden = true;
    try {
      const pool = await getPool();
      bindElement(main, pool);
      renderList(document.getElementById('payout-grid'), document.getElementById('tpl-payout'), pool.payouts, payoutVm);
    } catch (error) {
      document.getElementById('pool-error-message').textContent = `${describeError(error, "Couldn't load the current pot.")} You can still register.`;
      document.getElementById('pool-error').hidden = false;
    } finally {
      main.setAttribute('aria-busy', 'false');
    }
  }
  document.getElementById('pool-retry').addEventListener('click', loadPool);
  loadPool();
}
