// Backend de REFERÊNCIA do contrato (docs/api-contract.md), em memória e sem dependências de Node/DOM.
// Usado em dois lugares, com as mesmas regras:
//   • scripts/mock-server.mjs  → servidor HTTP (`npm run mock-api`) e testes de contrato
//   • src/js/api.js (VITE_API_MODE=mock) → o navegador, carregado sob demanda
// O backend real deve se comportar igual. Fixtures entram por parâmetro (JSON em src/data/mock/).
const SEASON = 'autumn-split';
const DEPARTMENTS = ['game_design', 'frontend_engineering', 'backend_infrastructure', 'art_animation', 'qa_playtesting', 'product_operations', 'community_marketing'];
const SQUADS = { ironforge: 2, dragonmaw: 1, pixel: 3, infra: 1 }; // vagas abertas
const GAMES = ['cs2', 'lol', 'valorant', 'smash', 'rl', 'aoe'];
const RESERVED = ['admin', 'moderator', 'tavernlight'];
const KNOWN_MATCHES = ['14', '15', '16'];
const GAMERTAG = /^[A-Za-z0-9_-]{3,16}$/;
const CURRENT_USER = 'vivi#0001'; // em produção vem da sessão
const HOUR = 3600000;
const MIN = 60000;

const isInt = (v) => Number.isInteger(v);
const fail = (status, code, message, fields) => ({ status, body: { error: { code, message, ...(fields ? { fields } : {}) } } });
const ok = (status, body) => ({ status, body });
const clone = (x) => JSON.parse(JSON.stringify(x));
const uid = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}${Math.random()}`).replace(/-/g, '').slice(0, 8);

// ------------------------------------------------------------------ validações
function validateRegistration(b) {
  const f = {};
  if (b.seasonId !== SEASON) f.seasonId = 'unknown season';
  if (typeof b.gamertag !== 'string' || !GAMERTAG.test(b.gamertag)) f.gamertag = 'must be 3-16 characters: letters, numbers, _ or -';
  if (!DEPARTMENTS.includes(b.department)) f.department = 'unknown department';
  const path = b.squad?.path;
  if (!['join', 'agent', 'found'].includes(path)) f['squad.path'] = 'must be join, agent or found';
  else if (path === 'join') {
    if (!(b.squad.squadId in SQUADS)) f['squad.squadId'] = 'required and must be an existing squad';
    else if (SQUADS[b.squad.squadId] < 1) f['squad.squadId'] = 'squad has no open slots';
  } else if (b.squad.squadId != null) f['squad.squadId'] = 'only allowed when joining a squad';
  if (!Array.isArray(b.games) || b.games.some((g) => !GAMES.includes(g)) || new Set(b.games).size !== b.games.length) f.games = 'must be a list of unique, known games';
  const cents = b.stake?.amountCents;
  if (!isInt(cents) || cents < 0 || cents > 50000) f['stake.amountCents'] = 'must be an integer between 0 and 50000';
  else if (cents > 0 && b.stake.payrollConsent !== true) f['stake.payrollConsent'] = 'must be true when amountCents is greater than 0';
  return f;
}

function validateMatch(b) {
  const f = {};
  if (![1, 3, 5].includes(b.bestOf)) f.bestOf = 'must be 1, 3 or 5';
  if (!Array.isArray(b.maps) || b.maps.length < 1 || b.maps.length > (b.bestOf ?? 5)) return { f: { ...f, maps: 'must have between 1 and bestOf maps' } };
  let winsA = 0, winsB = 0, decidedAt = null;
  const need = Math.floor((b.bestOf ?? 3) / 2) + 1;
  b.maps.forEach((m, i) => {
    const k = `maps[${i}]`;
    if (m?.number !== i + 1) f[`${k}.number`] = `must be ${i + 1}`;
    for (const side of ['teamA', 'teamB']) if (!isInt(m?.[side]) || m[side] < 0 || m[side] > 99) f[`${k}.${side}`] = 'must be an integer between 0 and 99';
    if (f[`${k}.teamA`] || f[`${k}.teamB`]) return;
    if (decidedAt !== null) { f[k] = `can't have a score: the series was decided on map ${decidedAt}`; return; }
    if (m.teamA === m.teamB) { f[k] = 'maps cannot end tied'; return; }
    if (m.teamA > m.teamB) winsA++; else winsB++;
    if (winsA >= need || winsB >= need) decidedAt = i + 1;
  });
  if (b.mvp != null && (typeof b.mvp !== 'string' || b.mvp.length > 40)) f.mvp = 'must be at most 40 characters';
  if (b.notes != null && (typeof b.notes !== 'string' || b.notes.length > 500)) f.notes = 'must be at most 500 characters';
  if (Object.keys(f).length) return { f };
  if (decidedAt === null) return { undecided: true };
  return { winsA, winsB };
}

function validateRules(b) {
  const f = {};
  const s = b.shares ?? {};
  const range = { first: [30, 70], second: [15, 40], third: [5, 25] };
  for (const [k, [lo, hi]] of Object.entries(range)) if (!isInt(s[k]) || s[k] < lo || s[k] > hi) f[`shares.${k}`] = `must be an integer between ${lo} and ${hi}`;
  if (!Object.keys(f).length && s.first + s.second + s.third > 95) f.shares = 'first + second + third cannot exceed 95 (5% is reserved for the MVP)';
  if (typeof b.fairPlayRules !== 'boolean') f.fairPlayRules = 'must be a boolean';
  if (typeof b.guildBadge !== 'boolean') f.guildBadge = 'must be a boolean';
  return f;
}

// ------------------------------------------------------------------ fábrica
/**
 * @param {{ team: object, pool: object }} fixtures conteúdo de src/data/mock/*.json
 * @param {{ now?: () => number }} [opts]
 */
export function createBackend(fixtures, { now = () => Date.now() } = {}) {
  let registrations, published, idem, team, pool, events, dash;

  function reset() {
    registrations = new Map(); // gamertag minúsculo -> inscrição
    published = new Map();
    idem = new Map(); // Idempotency-Key -> { sig, status, body }
    const t0 = now();
    const t = clone(fixtures.team);
    team = {
      ...t,
      invites: {
        inbound: t.invites.inbound,
        outbound: t.invites.outbound.map(({ sentHoursAgo, expiresInHours, ...o }) => ({
          ...o,
          sentAt: new Date(t0 - sentHoursAgo * HOUR).toISOString(),
          expiresAt: new Date(t0 + expiresInHours * HOUR).toISOString(),
        })),
      },
    };
    const nm = t.nextMatch;
    if (nm) {
      const startsAt = t0 + nm.startsInMinutes * MIN;
      team.nextMatch = {
        id: nm.id, game: nm.game, gameLabel: nm.gameLabel, round: nm.round, bestOf: nm.bestOf, stage: nm.stage, format: nm.format,
        mapPool: nm.mapPool, voice: nm.voice ?? null, opponent: nm.opponent,
        startsAt: new Date(startsAt).toISOString(), server: nm.server, lobby: nm.lobby,
        locksAt: new Date(startsAt - nm.checkInLocksMinutesBeforeStart * MIN).toISOString(), swapWindowMinutes: nm.swapWindowMinutes,
      };
    } else team.nextMatch = null;
    team.disciplines = t.disciplines ?? [];
    dash = clone(fixtures.dashboard ?? null);
    const ev = clone(fixtures.events ?? { seasonId: 'autumn-split', events: [] });
    events = {
      seasonId: ev.seasonId,
      items: ev.events.map(({ startsInMinutes, durationMinutes, registrationClosesInMinutes, ...e }) => ({
        ...e,
        startsAt: new Date(t0 + startsInMinutes * MIN).toISOString(),
        endsAt: new Date(t0 + (startsInMinutes + durationMinutes) * MIN).toISOString(),
        ...(registrationClosesInMinutes != null ? { registrationClosesAt: new Date(t0 + registrationClosesInMinutes * MIN).toISOString() } : {}),
      })),
    };
    const p = clone(fixtures.pool);
    pool = {
      seasonId: p.seasonId,
      totalCents: p.totalCents,
      changeVsPreviousPct: p.changeVsPreviousPct,
      consolationWinners: p.consolationWinners,
      rules: { ...p.rules, updatedAt: new Date(t0 - p.rules.updatedHoursAgo * HOUR).toISOString() },
      ledger: p.ledger.map(({ minutesAgo, ...l }) => ({ ...l, at: new Date(t0 - minutesAgo * MIN).toISOString() })),
    };
    delete pool.rules.updatedHoursAgo;
  }
  reset();

  // ---- visões (o que vai no JSON)
  const shares = () => {
    const { first, second, third } = pool.rules.shares;
    return { first, second, third, mvp: 100 - first - second - third };
  };
  function payouts() {
    const s = shares();
    const cut = (pct) => Math.round((pool.totalCents * pct) / 100);
    const podium = [['1', s.first], ['2', s.second], ['3', s.third]].map(([place, pct]) => ({ place, kind: 'podium', sharePct: pct, amountCents: cut(pct) }));
    const rest = pool.totalCents - podium.reduce((t, p) => t + p.amountCents, 0); // o que sobra fecha o total exato
    const n = pool.consolationWinners;
    return [...podium, { place: `4-${3 + n}`, kind: 'consolation', sharePct: s.mvp, amountCents: rest, winners: n, eachCents: Math.floor(rest / n) }];
  }
  const poolView = () => ({
    seasonId: pool.seasonId,
    totalCents: pool.totalCents,
    changeVsPreviousPct: pool.changeVsPreviousPct,
    rules: { ...pool.rules, shares: shares() },
    payouts: payouts(),
    ledger: pool.ledger,
  });
  // Escalações guardam só o memberId: quem saiu do time deixa o slot "open" (nunca um handle desatualizado)
  const memberOf = (id) => team.members.find((m) => m.id === id);
  const disciplinesView = () =>
    team.disciplines.map((d) => {
      const meta = { game: d.game, name: d.name, kind: d.kind, tone: d.tone, format: d.format, note: d.note };
      if (d.kind === 'solo') {
        const pick = (s) => { const m = s && memberOf(s.memberId); return m ? { memberId: m.id, handle: m.handle, detail: s.detail } : null; };
        return { ...meta, lead: pick(d.lead), backup: pick(d.backup) };
      }
      return {
        ...meta,
        slots: d.slots.map((s) => {
          const m = memberOf(s.memberId);
          return m
            ? { position: s.position, memberId: m.id, handle: m.handle, detail: s.detail, status: s.status }
            : { position: s.position, memberId: null, handle: null, detail: null, status: 'open' };
        }),
      };
    });
  // Check-in: quantos slots TRAVADOS da escalação do jogo da partida ainda têm alguém / quantos slots existem
  function nextMatchView() {
    const nm = team.nextMatch;
    if (!nm) return null;
    const lineup = disciplinesView().find((d) => d.game === nm.game && d.kind === 'squad');
    const required = lineup ? lineup.slots.length : 0;
    const confirmed = lineup ? lineup.slots.filter((s) => s.status === 'locked').length : 0;
    const { locksAt, ...rest } = nm;
    return { ...rest, checkIn: { confirmed, required, locksAt } };
  }
  // Painel inicial: perfil, posição e a próxima partida (a mesma de GET /teams/mine, mais os dados do SEU time)
  function dashboardView() {
    const nm = nextMatchView();
    const { wins, losses } = team.stats;
    return {
      ...dash,
      nextMatch: nm && { ...nm, team: { name: team.name, crestUrl: team.crestUrl ?? null, seed: team.stats.standing, record: { wins, losses } } },
    };
  }
  const teamView = () => {
    const { wins, losses } = team.stats;
    const { disciplines: _raw, nextMatch: _nm, ...base } = team;
    return { ...base, stats: { ...team.stats, winRatePct: Math.round((wins / (wins + losses)) * 100) }, nextMatch: nextMatchView(), disciplines: disciplinesView() };
  };

  // Calendário: status e filtros derivados do relógio do servidor (a tela não decide o que é "live")
  const LIVE_SOON_MIN = 180;
  function eventStatus(e) {
    const t = now();
    if (t >= Date.parse(e.endsAt)) return 'ended';
    if (t >= Date.parse(e.startsAt)) return 'live';
    return Date.parse(e.startsAt) - t <= LIVE_SOON_MIN * MIN ? 'live_soon' : 'scheduled';
  }
  const eventView = (e) => {
    const { teamParticipates, endsAt, ...rest } = e;
    return {
      ...rest,
      endsAt,
      status: eventStatus(e),
      // "participa" = o time joga OU a pessoa confirmou presença (RSVP)
      participating: Boolean(teamParticipates || (e.action.kind === 'rsvp' && e.action.going)),
      category: e.category ?? null,
      prize: e.prize ?? null,
    };
  };
  const eventsView = () => ({
    seasonId: events.seasonId,
    events: events.items.filter((e) => eventStatus(e) !== 'ended').sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)).map(eventView),
  });

  // ---- rotas
  function route(method, url, body, headers) {
    const path = url.pathname.replace(/^\/api/, '');
    const viewer = headers['x-mock-role'] === 'viewer';
    let m;

    if (method === 'GET' && path === '/gamertags/availability') {
      const name = url.searchParams.get('name') ?? '';
      if (!GAMERTAG.test(name)) return fail(422, 'validation_failed', 'Invalid name', { name: 'must be 3-16 characters: letters, numbers, _ or -' });
      const taken = RESERVED.includes(name.toLowerCase()) || registrations.has(name.toLowerCase());
      return ok(200, { name, available: !taken });
    }

    if (method === 'POST' && path === '/registrations') {
      const f = validateRegistration(body);
      if (Object.keys(f).length) return fail(422, 'validation_failed', 'Invalid registration', f);
      const key = body.gamertag.toLowerCase();
      if (RESERVED.includes(key)) return fail(409, 'gamertag_taken', 'Screen name is not available');
      if (registrations.has(key)) return fail(409, 'already_registered', 'Already registered for this season');
      const reg = { id: `reg_${uid()}`, status: 'confirmed', createdAt: new Date(now()).toISOString() };
      registrations.set(key, reg);
      if (body.stake.amountCents > 0) {
        // a contribuição entra no pote e no ledger
        pool.totalCents += body.stake.amountCents;
        pool.ledger.unshift({ id: `tx_${reg.id}`, code: `#${reg.id.slice(4, 9).toUpperCase()}`, handle: body.gamertag, tournament: 'Season stake', amountCents: body.stake.amountCents, at: reg.createdAt });
        pool.ledger = pool.ledger.slice(0, 20);
      }
      return ok(201, reg);
    }

    if (method === 'POST' && (m = path.match(/^\/matches\/(\d+)\/result$/))) {
      if (viewer) return fail(403, 'forbidden', 'Only match officials can publish results');
      if (!KNOWN_MATCHES.includes(m[1])) return fail(404, 'not_found', 'Match not found');
      if (published.has(m[1])) return fail(409, 'already_published', 'Results were already published');
      const r = validateMatch(body);
      if (r.f) return fail(422, 'validation_failed', 'Invalid result', r.f);
      if (r.undecided) return fail(422, 'series_not_decided', 'The scores do not decide the series');
      const res = { matchId: m[1], status: 'published', winsA: r.winsA, winsB: r.winsB };
      published.set(m[1], res);
      return ok(201, res);
    }

    if (method === 'GET' && (m = path.match(/^\/seasons\/([\w-]+)\/pool$/))) {
      return m[1] === pool.seasonId ? ok(200, poolView()) : fail(404, 'not_found', 'Season not found');
    }

    if (method === 'GET' && (m = path.match(/^\/seasons\/([\w-]+)\/events$/))) {
      return m[1] === events.seasonId ? ok(200, eventsView()) : fail(404, 'not_found', 'Season not found');
    }

    if (method === 'PUT' && (m = path.match(/^\/events\/([\w-]+)\/rsvp$/))) {
      const e = events.items.find((x) => x.id === m[1]);
      if (!e || eventStatus(e) === 'ended') return fail(404, 'not_found', 'Event not found');
      if (typeof body.going !== 'boolean') return fail(422, 'validation_failed', 'Invalid RSVP', { going: 'must be a boolean' });
      if (e.action.kind !== 'rsvp') return fail(409, 'rsvp_not_available', 'This event does not take RSVPs');
      if (eventStatus(e) === 'live') return fail(409, 'rsvp_closed', 'RSVPs closed when the event started');
      e.action = { ...e.action, going: body.going };
      return ok(200, eventView(e));
    }

    if (method === 'PUT' && path === '/pool/rules') {
      if (viewer) return fail(403, 'forbidden', 'Only organizers can change the pool rules');
      const f = validateRules(body);
      if (Object.keys(f).length) return fail(422, 'validation_failed', 'Invalid rules', f);
      pool.rules = { shares: { first: body.shares.first, second: body.shares.second, third: body.shares.third }, fairPlayRules: body.fairPlayRules, guildBadge: body.guildBadge, updatedBy: CURRENT_USER, updatedAt: new Date(now()).toISOString() };
      return ok(200, { ...body, shares: shares() });
    }

    if (method === 'GET' && path === '/me/dashboard') return dash ? ok(200, dashboardView()) : fail(404, 'not_found', 'No dashboard');

    // ---- time do usuário logado
    if (method === 'GET' && path === '/teams/mine') return ok(200, teamView());

    if ((m = path.match(/^\/teams\/mine\/members\/([\w-]+)$/))) {
      const member = team.members.find((x) => x.id === m[1]);
      if (viewer) return fail(403, 'forbidden', 'Only the squad captain can manage the roster');
      if (!member) return fail(404, 'not_found', 'Member not found');
      if (method === 'PATCH') {
        if (!['starter', 'sub'].includes(body.status)) return fail(422, 'validation_failed', 'Invalid status', { status: 'must be starter or sub' });
        if (member.isCaptain) return fail(409, 'captain_locked', 'The captain is always an active starter');
        member.status = body.status;
        return ok(200, member);
      }
      if (method === 'DELETE') {
        if (member.isCaptain) return fail(409, 'captain_locked', 'The captain cannot be removed');
        team.members = team.members.filter((x) => x.id !== member.id);
        return ok(204, null);
      }
    }

    if (method === 'POST' && (m = path.match(/^\/teams\/mine\/invites\/([\w-]+)\/decision$/))) {
      if (viewer) return fail(403, 'forbidden', 'Only the squad captain can answer applications');
      const inv = team.invites.inbound.find((x) => x.id === m[1]);
      if (!inv) return fail(404, 'not_found', 'Application not found or already answered');
      if (!['accept', 'decline'].includes(body.decision)) return fail(422, 'validation_failed', 'Invalid decision', { decision: 'must be accept or decline' });
      if (body.decision === 'accept') {
        if (team.members.length >= team.capacity) return fail(409, 'squad_full', 'The squad has no open slots');
        const member = { id: `m_${uid()}`, handle: inv.handle, avatarUrl: inv.avatarUrl, department: inv.department, roleLabel: 'NEW RECRUIT', isCaptain: false, status: 'sub', ratings: inv.disciplines.map((d) => ({ game: d.game, label: d.label, stat: inv.peakRating })).slice(0, 2) };
        team.members.push(member);
        team.invites.inbound = team.invites.inbound.filter((x) => x.id !== inv.id);
        return ok(200, { status: 'accepted', member });
      }
      team.invites.inbound = team.invites.inbound.filter((x) => x.id !== inv.id);
      return ok(200, { status: 'declined' });
    }

    if (method === 'DELETE' && (m = path.match(/^\/teams\/mine\/invites\/([\w-]+)$/))) {
      if (viewer) return fail(403, 'forbidden', 'Only the squad captain can revoke invites');
      if (!team.invites.outbound.some((x) => x.id === m[1])) return fail(404, 'not_found', 'Invite not found');
      team.invites.outbound = team.invites.outbound.filter((x) => x.id !== m[1]);
      return ok(204, null);
    }

    return fail(404, 'not_found', `No route for ${method} ${path}`);
  }

  /**
   * @param {string} method
   * @param {string} urlString caminho + query (ex.: "/api/teams/mine")
   * @param {string|undefined} rawBody corpo JSON em texto
   * @param {Record<string,string>} headers cabeçalhos em minúsculas
   * @returns {{ status: number, body: any, replay?: boolean }}
   */
  function handle(method, urlString, rawBody, headers = {}) {
    const url = new URL(urlString, 'http://localhost');
    let body;
    if (rawBody) {
      try { body = JSON.parse(rawBody); } catch { return fail(400, 'validation_failed', 'Body is not valid JSON'); }
    }
    const key = headers['idempotency-key'];
    if (method === 'POST' && url.pathname.startsWith('/api/')) {
      if (!key) return fail(422, 'validation_failed', 'Idempotency-Key header is required', { 'Idempotency-Key': 'is required' });
      const sig = `${urlString}\n${rawBody ?? ''}`;
      const prev = idem.get(key);
      if (prev) {
        if (prev.sig !== sig) return fail(422, 'idempotency_key_reuse', 'Same key with a different request');
        return { status: prev.status, body: prev.body, replay: true };
      }
      const out = route(method, url, body ?? {}, headers);
      if (out.status < 500) idem.set(key, { sig, status: out.status, body: out.body });
      return out;
    }
    return route(method, url, body ?? {}, headers);
  }

  return { handle, reset };
}
