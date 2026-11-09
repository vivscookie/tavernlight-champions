import { publishMatchResult, describeError } from '../api.js';
import { showToast } from '../ui/toast.js';
import { withPending } from '../ui/pending.js';

(function () {
    'use strict';

    const MAX_ROUNDS = 99;
    const bestOf = Number(document.getElementById('series-format')?.dataset.bestOf) || 3;
    const winsNeeded = Math.floor(bestOf / 2) + 1;

    // Descobre os mapas pelo DOM (map1_a/map1_b, map2_a/map2_b…): nada fixo em "3 mapas"
    const maps = Array.from(document.querySelectorAll('input[id^="map"][id$="_a"]'))
      .map((a) => {
        const n = Number(a.id.match(/^map(\d+)_a$/)[1]);
        return { n, a, b: document.getElementById(`map${n}_b`) };
      })
      .filter((m) => m.b)
      .sort((x, y) => x.n - y.n);

    const scoreAEl = document.getElementById('teamA_seriesScore');
    const scoreBEl = document.getElementById('teamB_seriesScore');
    const statusEl = document.getElementById('series-status');
    const submitBtn = document.getElementById('btn-submit-match');

    // Retorna inteiro entre 0 e MAX_ROUNDS, ou NaN se vazio/inválido
    function readRounds(input) {
      const raw = input.value.trim();
      if (!/^\d+$/.test(raw)) return NaN;
      const n = Number(raw);
      return n <= MAX_ROUNDS ? n : NaN;
    }

    // Regra da série, mapa a mapa e em ordem
    function evaluate() {
      let winsA = 0;
      let winsB = 0;
      let decidedAt = null;
      let firstEmpty = null;
      const issues = [];

      for (const m of maps) {
        const a = readRounds(m.a);
        const b = readRounds(m.b);

        if (Number.isNaN(a) || Number.isNaN(b)) {
          issues.push({ input: Number.isNaN(a) ? m.a : m.b, msg: `Map ${m.n}: enter whole numbers from 0 to ${MAX_ROUNDS}.` });
          continue;
        }
        const played = a > 0 || b > 0;

        if (decidedAt !== null) {
          // Série já decidida: mapas seguintes não podem ter placar
          if (played) issues.push({ input: m.a, msg: `Map ${m.n} can't have a score: the series was already decided on Map ${decidedAt}.` });
          continue;
        }
        if (!played) { if (firstEmpty === null) firstEmpty = m.n; continue; }
        if (firstEmpty !== null) {
          issues.push({ input: m.a, msg: `Map ${firstEmpty} has no score, but Map ${m.n} does.` });
          continue;
        }
        if (a === b) {
          issues.push({ input: m.a, msg: `Map ${m.n} is tied ${a}–${b}: enter the final score, including overtime.` });
          continue;
        }

        if (a > b) winsA++; else winsB++;
        if (winsA >= winsNeeded || winsB >= winsNeeded) decidedAt = m.n;
      }
      return { winsA, winsB, decidedAt, issues, valid: issues.length === 0 && decidedAt !== null };
    }

    function render() {
      const r = evaluate();
      scoreAEl.textContent = r.winsA;
      scoreBEl.textContent = r.winsB;

      let text;
      if (r.issues.length) text = r.issues[0].msg;
      else if (r.decidedAt !== null) text = `Finalized (Map ${r.decidedAt} Decided)`;
      else text = `In progress — first to ${winsNeeded} map wins`;

      statusEl.textContent = text;
      statusEl.classList.toggle('text-error', r.issues.length > 0);
      return r;
    }

    function adjustRound(input, change) {
      const current = readRounds(input);
      const base = Number.isNaN(current) ? 0 : current;
      input.value = Math.min(MAX_ROUNDS, Math.max(0, base + change));
      render();
    }

    document.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-adjust]');
      if (!btn) return;
      const input = document.getElementById(btn.dataset.target);
      if (input) adjustRound(input, Number(btn.dataset.adjust));
    });

    maps.forEach((m) => [m.a, m.b].forEach((el) => el.addEventListener('input', render)));

    // Trava a tela depois de publicar (evita publicar duas vezes e edições que não seriam salvas)
    function lockForm() {
      maps.forEach((m) => [m.a, m.b].forEach((el) => { el.disabled = true; }));
      document.querySelectorAll('[data-adjust]').forEach((b) => { b.disabled = true; });
    }

    document.getElementById('match-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const r = render();
      if (!r.valid) {
        // Foca o campo com problema (ou o próximo mapa pendente) em vez de publicar
        (r.issues[0]?.input || maps.find((m) => !(readRounds(m.a) > 0 || readRounds(m.b) > 0))?.a)?.focus();
        showToast({
          tone: 'error',
          title: "Results can't be published yet",
          message: r.issues[0]?.msg ?? `The series isn't decided yet: first to ${winsNeeded} map wins.`,
        });
        return;
      }

      const matchId = document.getElementById('series-format')?.dataset.matchId;
      const form = event.currentTarget;
      const extra = new FormData(form); // campos associados via form="match-form"
      // Domínio -> o DTO do contrato é montado em api.js. O placar da série é recalculado pelo servidor.
      const payload = {
        matchId,
        bestOf,
        maps: maps.map((m) => ({ n: m.n, a: readRounds(m.a), b: readRounds(m.b) })),
        mvp: extra.get('mvp') || null,
        notes: String(extra.get('notes') || '').trim(),
      };

      const out = await withPending(
        submitBtn,
        { label: 'Publishing…', keepDisabledOnSuccess: true, doneLabel: 'Published' },
        () => publishMatchResult(payload),
      );

      if (!out.ok) {
        const retryable = ['network', 'server', 'rate_limit'].includes(out.error?.kind);
        showToast({
          tone: 'error',
          title: "Couldn't publish the results",
          message: describeError(out.error) + (retryable ? ' Nothing was saved.' : ''),
        });
        return;
      }

      // Vale o placar confirmado pelo servidor (se diferir do local, o servidor é a verdade)
      const winsA = out.value?.winsA ?? r.winsA;
      const winsB = out.value?.winsB ?? r.winsB;
      lockForm();
      statusEl.textContent = `Published (${winsA}–${winsB})`;
      showToast({
        tone: 'success',
        title: `Match #${matchId} published`,
        message: `Final series score ${winsA}–${winsB}. The standings are updated.`,
      });
    });

    render();
  })();