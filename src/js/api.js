// Cliente da API (contrato em docs/api-contract.md).
//
// Dois modos, escolhidos por VITE_API_MODE:
//   live → fetch real para VITE_API_BASE_URL (padrão "/api"). É o padrão em `vite build`.
//   mock → respostas simuladas no navegador (padrão em `npm run dev`), para trabalhar sem backend.
//          Em mock, ?simulateError força falha: ?simulateError | =conflict | =validation | =network | =write (só escritas)
//
// As telas só conhecem objetos de domínio; os DTOs do contrato são montados aqui.
import site from '../data/site.json';

// Acessos DIRETOS a import.meta.env.*: no build o Vite troca cada um por um literal, e o ramo do mock
// (backend de referência + fixtures com dados de exemplo) é descartado do bundle de produção.
// Não guarde import.meta.env em variável/alias: isso desliga a eliminação e o mock vai para o dist/.
export const API_MODE = import.meta.env.VITE_API_MODE ?? (import.meta.env.DEV ? 'mock' : 'live');
export const API_BASE = String(import.meta.env.VITE_API_BASE_URL ?? '/api').replace(/\/+$/, '');
export const API_LATENCY_MS = 600; // só no modo mock
export const REQUEST_TIMEOUT_MS = 15000;

if (API_MODE === 'mock') {
  const log = import.meta.env.PROD ? console.warn : console.info;
  log('[api] modo MOCK: nenhuma chamada chega ao servidor. Use VITE_API_MODE=live para o backend real.');
}

// ---------------------------------------------------------------- erros
export class ApiError extends Error {
  /**
   * @param {string} message
   * @param {{ status?: number, code?: string, fields?: Record<string,string>, retryAfter?: number|null, cause?: unknown }} [opts]
   */
  constructor(message, { status = 0, code = 'unknown', fields = {}, retryAfter = null, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
    this.retryAfter = retryAfter;
  }

  /** 'network' | 'auth' | 'validation' | 'conflict' | 'rate_limit' | 'server' | 'other' */
  get kind() {
    if (this.status === 0) return 'network';
    if (this.status === 401 || this.status === 403) return 'auth';
    if (this.status === 409) return 'conflict';
    if (this.status === 429) return 'rate_limit';
    if (this.status === 400 || this.status === 422) return 'validation';
    if (this.status >= 500) return 'server';
    return 'other';
  }
}

const MESSAGES = {
  network_error: "Can't reach the server. Check your connection and try again.",
  timeout: 'The server took too long to answer. Try again in a moment.',
  unauthenticated: 'Your session expired. Sign in again to continue.',
  forbidden: "You don't have permission to do this.",
  not_found: "We couldn't find that record.",
  already_registered: "You're already registered for this season.",
  gamertag_taken: 'That screen name was just taken. Go back to step 1 and choose another.',
  already_published: 'These results were already published.',
  series_not_decided: "The scores don't decide the series yet.",
  idempotency_key_reuse: 'This request was already sent with different data. Reload the page and try again.',
  rsvp_closed: 'RSVPs closed when the event started.',
  rsvp_not_available: "This event doesn't take RSVPs.",
  squad_full: 'The squad is full. Make room before accepting another player.',
  captain_locked: "The squad captain can't be benched or removed.",
  internal_error: 'Something went wrong on our side. Try again in a moment.',
};

/** Texto para o usuário (en) a partir de qualquer erro. O `code` manda; `message` do servidor é só apoio. */
export function describeError(error, fallback = 'Something went wrong. Try again.') {
  if (!(error instanceof ApiError)) return fallback;
  if (error.code === 'rate_limited') {
    return error.retryAfter ? `Too many attempts. Try again in ${error.retryAfter} s.` : 'Too many attempts. Try again in a moment.';
  }
  if (error.kind === 'validation') {
    const first = Object.values(error.fields)[0];
    return first ? `Check the data: ${first}.` : MESSAGES[error.code] ?? fallback;
  }
  if (MESSAGES[error.code]) return MESSAGES[error.code];
  if (error.kind === 'server') return MESSAGES.internal_error;
  return fallback;
}

// ---------------------------------------------------------------- transporte
// Chave de idempotência por (endpoint + corpo): uma nova tentativa do MESMO envio reaproveita a chave,
// então um timeout seguido de retry não cria duas inscrições. Some após o sucesso.
const idempotencyKeys = new Map();
const newKey = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

function csrfToken() {
  return typeof document === 'undefined' ? null : document.querySelector('meta[name="csrf-token"]')?.content || null;
}

async function liveRequest(method, path, { body, query, idempotent = false, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  const qs = query ? `?${new URLSearchParams(query)}` : '';
  const url = `${API_BASE}${path}${qs}`;
  const headers = { Accept: 'application/json' };
  const payload = body === undefined ? undefined : JSON.stringify(body);
  if (payload !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET') {
    const token = csrfToken();
    if (token) headers['X-CSRF-Token'] = token;
  }
  const idemId = idempotent ? `${method} ${path} ${payload}` : null;
  if (idempotent) {
    if (!idempotencyKeys.has(idemId)) idempotencyKeys.set(idemId, newKey());
    headers['Idempotency-Key'] = idempotencyKeys.get(idemId);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(url, { method, headers, body: payload, credentials: 'same-origin', signal: controller.signal });
  } catch (cause) {
    const timedOut = cause?.name === 'AbortError';
    throw new ApiError(timedOut ? 'Request timed out' : 'Network error', { status: 0, code: timedOut ? 'timeout' : 'network_error', cause });
  } finally {
    clearTimeout(timer);
  }

  let data = null;
  try {
    const text = await res.text();
    data = text ? JSON.parse(text) : null;
  } catch {
    /* corpo vazio ou que não é JSON (ex.: página de erro de um proxy) */
  }

  if (!res.ok) {
    const err = data?.error ?? {};
    throw new ApiError(err.message ?? `HTTP ${res.status}`, {
      status: res.status,
      code: err.code ?? `http_${res.status}`,
      fields: err.fields ?? {},
      retryAfter: Number(res.headers.get('Retry-After')) || null,
    });
  }
  if (idempotent) idempotencyKeys.delete(idemId);
  return data;
}

// ---------------------------------------------------------------- modo mock
// Roda o MESMO backend de referência do servidor HTTP (src/js/mock/backend.js), carregado sob demanda
// (não entra no bundle de produção em modo live). O estado vive até recarregar a página.
//   ?simulateError[=conflict|validation|network|write]  força uma falha      ?mockRole=viewer  simula usuário sem permissão (403)
let mockBackend = null;
async function getMockBackend() {
  if (!mockBackend) {
    const [{ createBackend }, team, pool, events, dashboard] = await Promise.all([
      import('./mock/backend.js'),
      import('../data/mock/team.json'),
      import('../data/mock/pool.json'),
      import('../data/mock/events.json'),
      import('../data/mock/dashboard.json'),
    ]);
    mockBackend = createBackend({ team: team.default, pool: pool.default, events: events.default, dashboard: dashboard.default });
  }
  return mockBackend;
}

async function mockRequest(method, path, { body, query } = {}) {
  await new Promise((r) => setTimeout(r, API_LATENCY_MS));
  const params = new URLSearchParams(window.location.search);
  const sim = params.get('simulateError');
  // =write: só as escritas falham (a tela carrega, mas salvar dá erro)
  if (sim !== null && !(sim === 'write' && method === 'GET')) {
    const fail = {
      conflict: { status: 409, code: 'already_registered' },
      validation: { status: 422, code: 'validation_failed', fields: { 'stake.amountCents': 'must be between 0 and 50000' } },
      network: { status: 0, code: 'network_error' },
    }[sim] ?? { status: 503, code: 'internal_error' };
    throw new ApiError(`Simulated failure on ${method} ${path}`, fail);
  }
  const qs = query ? `?${new URLSearchParams(query)}` : '';
  const headers = { 'x-mock-role': params.get('mockRole') ?? '' };
  if (method === 'POST') headers['idempotency-key'] = newKey();
  const out = (await getMockBackend()).handle(method, `/api${path}${qs}`, body === undefined ? undefined : JSON.stringify(body), headers);
  if (out.status >= 400) {
    const e = out.body.error;
    throw new ApiError(e.message, { status: out.status, code: e.code, fields: e.fields ?? {} });
  }
  return out.body; // 204 -> null
}

/** Ponto único de saída: troca live/mock sem as telas saberem. */
export const request = (method, path, opts) => (API_MODE === 'mock' ? mockRequest(method, path, opts) : liveRequest(method, path, opts));

// ---------------------------------------------------------------- DTOs (domínio → contrato)
const incomplete = (fields) => new ApiError('Registration is incomplete', { status: 422, code: 'validation_failed', fields });

export function toRegistrationDto(reg, { payrollConsent = false } = {}) {
  const missing = {};
  if (!reg?.identity?.gamertag) missing['gamertag'] = 'is required';
  if (!reg?.identity?.department) missing['department'] = 'is required';
  if (!reg?.squad?.path) missing['squad.path'] = 'is required';
  if (!Array.isArray(reg?.games?.enlisted)) missing['games'] = 'is required';
  if (typeof reg?.stake?.amount !== 'number') missing['stake.amountCents'] = 'is required';
  if (Object.keys(missing).length) throw incomplete(missing);
  return {
    seasonId: site.season.id,
    gamertag: reg.identity.gamertag,
    department: reg.identity.department,
    squad: { path: reg.squad.path, squadId: reg.squad.path === 'join' ? reg.squad.squadId ?? null : null },
    games: reg.games.enlisted,
    stake: { amountCents: Math.round(reg.stake.amount * 100), payrollConsent: Boolean(payrollConsent) },
  };
}

export const toMatchResultDto = ({ bestOf, maps, mvp, notes }) => ({
  bestOf,
  maps: maps.map((m) => ({ number: m.n, teamA: m.a, teamB: m.b })),
  mvp: mvp || null,
  notes: notes ?? '',
});

export const toPoolRulesDto = ({ shares, fairPlayRules, guildBadge }) => ({
  seasonId: site.season.id,
  shares: { first: shares.first, second: shares.second, third: shares.third }, // o MVP é do servidor
  fairPlayRules: Boolean(fairPlayRules),
  guildBadge: Boolean(guildBadge),
});

// ---------------------------------------------------------------- operações
/** @returns {Promise<{ name: string, available: boolean }>} */
export const checkGamertagAvailability = (name) => request('GET', '/gamertags/availability', { query: { name } });

/**
 * @param registration estado do cadastro (registration-state.js)
 * @param opts.payrollConsent aceite explícito do desconto em folha (checkbox); o servidor o exige quando amountCents > 0
 */
export async function submitRegistration(registration, { payrollConsent = false } = {}) {
  return request('POST', '/registrations', { body: toRegistrationDto(registration, { payrollConsent }), idempotent: true });
}

/** @param result { matchId, bestOf, maps: [{n,a,b}], mvp, notes } */
export const publishMatchResult = (result) =>
  request('POST', `/matches/${encodeURIComponent(result.matchId)}/result`, { body: toMatchResultDto(result), idempotent: true });

/** @param rules { shares: {first,second,third}, fairPlayRules, guildBadge } */
export const savePoolRules = (rules) => request('PUT', '/pool/rules', { body: toPoolRulesDto(rules) });

// ---- leitura e gestão do pote
/** @returns {Promise<{ seasonId, totalCents, changeVsPreviousPct, rules, payouts, ledger }>} */
export const getPool = (seasonId = site.season.id) => request('GET', `/seasons/${encodeURIComponent(seasonId)}/pool`);

// ---- time do usuário logado (roster e convites)
/** @returns {Promise<object>} time com membros, estatísticas e convites (docs/api-contract.md) */
export const getTeam = () => request('GET', '/teams/mine');
/** @param status 'starter' | 'sub' */
export const updateMemberStatus = (memberId, status) => request('PATCH', `/teams/mine/members/${encodeURIComponent(memberId)}`, { body: { status } });
export const removeMember = (memberId) => request('DELETE', `/teams/mine/members/${encodeURIComponent(memberId)}`);
/** @param decision 'accept' | 'decline' */
export const decideInvite = (inviteId, decision) =>
  request('POST', `/teams/mine/invites/${encodeURIComponent(inviteId)}/decision`, { body: { decision }, idempotent: true });
/** Cancela um convite que o time enviou */
export const revokeInvite = (inviteId) => request('DELETE', `/teams/mine/invites/${encodeURIComponent(inviteId)}`);

// ---- calendário de eventos
/** @returns {Promise<{ seasonId, events: Array }>} eventos futuros/em andamento, já ordenados; status e participação vêm do servidor */
export const getEvents = (seasonId = site.season.id) => request('GET', `/seasons/${encodeURIComponent(seasonId)}/events`);
/** Confirma/cancela presença. Devolve o evento atualizado (a participação muda junto). */
export const setRsvp = (eventId, going) => request('PUT', `/events/${encodeURIComponent(eventId)}/rsvp`, { body: { going } });

// ---- painel inicial (herói do index)
/** @returns {Promise<{ user, season, standing, prizeShare, nextMatch }>} nextMatch é a MESMA partida de getTeam(), com os dados do seu time */
export const getDashboard = () => request('GET', '/me/dashboard');
