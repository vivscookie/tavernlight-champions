import { savePoolRules, getPool, describeError } from '../api.js';
import { bindElement, renderList } from '../ui/template.js';
import { showToast } from '../ui/toast.js';
import { withPending } from '../ui/pending.js';

(function () {
  'use strict';

  const MVP_MIN_PCT = 5;                       // fatia mínima reservada ao MVP (resto automático)
  const potEl = document.getElementById('pot-total');
  const noteEl = document.getElementById('allocation-note');
  const badgeEl = document.getElementById('allocation-badge');
  let TOTAL_CENTS = 0; // vem da API (GET /seasons/{id}/pool)
  const main = document.getElementById('main-content');

  const LABELS = { first: 'Champion Prize', second: 'Runner-Up Prize', third: 'Third Place' };
  const sliders = {};
  document.querySelectorAll('input[data-place]').forEach((el) => { sliders[el.dataset.place] = el; });
  const places = Object.keys(sliders);

  const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
  const split = (cents) => { const [d, c] = usd.format(cents / 100).split('.'); return [d, '.' + c]; };

  const sumOthers = (except) => places.reduce((t, k) => (k === except ? t : t + Number(sliders[k].value)), 0);

  // Impede que a soma das fatias ajustáveis ultrapasse (100 - MVP_MIN_PCT)
  function enforceBudget(changedKey) {
    const el = sliders[changedKey];
    const maxAllowed = 100 - MVP_MIN_PCT - sumOthers(changedKey);
    const wanted = Number(el.value);
    if (wanted > maxAllowed) {
      el.value = Math.max(Number(el.min), maxAllowed);
      return `The total can't exceed ${100 - MVP_MIN_PCT}% — the remaining ${MVP_MIN_PCT}% is reserved for the MVP award.`;
    }
    return '';
  }

  function render() {
    const pct = {};
    places.forEach((k) => { pct[k] = Number(sliders[k].value); });
    pct.mvp = 100 - places.reduce((t, k) => t + pct[k], 0);

    // Valores em centavos inteiros; o MVP recebe o resto, então a soma fecha exatamente no total
    const cents = {};
    places.forEach((k) => { cents[k] = Math.round((TOTAL_CENTS * pct[k]) / 100); });
    cents.mvp = TOTAL_CENTS - places.reduce((t, k) => t + cents[k], 0);

    [...places, 'mvp'].forEach((k) => {
      const box = document.querySelector(`[data-card-amount="${k}"]`);
      if (box) {
        const [dollars, decimals] = split(cents[k]);
        box.firstChild.nodeValue = dollars;
        const dec = box.querySelector('span');
        if (dec) dec.textContent = decimals;
      }
      const pctEl = document.querySelector(`[data-card-pct="${k}"]`);
      if (pctEl) pctEl.textContent = k === 'mvp' ? `${pct[k]}% COMMUNITY` : `${pct[k]}% OF TOTAL`;
    });

    places.forEach((k) => {
      const label = document.querySelector(`[data-slider-label="${k}"]`);
      if (label) label.textContent = `${LABELS[k]} (Current: ${pct[k]}%)`;
      const amt = document.querySelector(`[data-slider-amount="${k}"]`);
      if (amt) amt.textContent = usd.format(cents[k] / 100);
      sliders[k].setAttribute('aria-valuetext', `${pct[k]}% — ${usd.format(cents[k] / 100)}`);
    });

    const total = pct.first + pct.second + pct.third + pct.mvp;
    badgeEl.textContent = `Auto-Balanced (${total}%)`;
  }

  places.forEach((k) => {
    sliders[k].addEventListener('input', () => {
      noteEl.textContent = enforceBudget(k);
      render();
    });
  });

  // ---------- Salvar regras do pote ----------
  const form = document.getElementById('rules-form');
  const saveBtn = document.getElementById('btn-save-rules');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(form); // inclui os controles associados via form="rules-form"
    const rules = {
      shares: { first: Number(data.get('share_first')), second: Number(data.get('share_second')), third: Number(data.get('share_third')) },
      fairPlayRules: data.has('rule_fair_play'),
      guildBadge: data.has('rule_guild_badge'),
    };
    rules.shares.mvp = 100 - rules.shares.first - rules.shares.second - rules.shares.third;

    const out = await withPending(saveBtn, { label: 'Saving…' }, () => savePoolRules(rules));
    if (!out.ok) {
      showToast({ tone: 'error', title: "Couldn't save the rule presets", message: describeError(out.error) });
      return;
    }
    const saved = out.value?.shares ?? rules.shares; // o servidor devolve o MVP calculado
    getPool().then(applyPool).catch(() => {}); // atualiza "última alteração" e o total; falha aqui não atrapalha
    showToast({
      tone: 'success',
      title: 'Rule presets saved',
      message: `Payout split: ${saved.first}% / ${saved.second}% / ${saved.third}% + ${saved.mvp}% MVP.`,
    });
  });

  // ---------- Carga do pote: as regras ficam travadas até os dados chegarem ----------
  const controls = document.querySelectorAll('[form="rules-form"]');
  const lock = (locked) => controls.forEach((el) => { el.disabled = locked; });
  const TONES = ['primary', 'secondary', 'tertiary'];
  lock(true);

  function applyPool(pool) {
    TOTAL_CENTS = pool.totalCents;
    potEl.dataset.cents = String(pool.totalCents);
    bindElement(main, pool);
    const { shares, fairPlayRules, guildBadge } = pool.rules;
    places.forEach((k) => {
      const el = sliders[k];
      el.value = String(Math.min(Number(el.max), Math.max(Number(el.min), shares[k])));
    });
    document.querySelector('input[name="rule_fair_play"]').checked = fairPlayRules;
    document.querySelector('input[name="rule_guild_badge"]').checked = guildBadge;
    places.forEach((k) => enforceBudget(k));
    render();
    renderList(document.getElementById('ledger-list'), document.getElementById('tpl-ledger-row'), pool.ledger, (l, i) => ({ ...l, tone: TONES[i % TONES.length] }));
  }

  async function loadPool() {
    main.setAttribute('aria-busy', 'true');
    document.getElementById('pool-error').hidden = true;
    try {
      applyPool(await getPool());
      lock(false);
    } catch (error) {
      document.getElementById('pool-error-message').textContent = `${describeError(error, "We couldn't load the pot.")} Rules stay locked until it loads.`;
      document.getElementById('pool-error').hidden = false;
      document.getElementById('pool-retry').focus();
    } finally {
      main.setAttribute('aria-busy', 'false');
    }
  }
  document.getElementById('pool-retry').addEventListener('click', loadPool);
  loadPool();
})();