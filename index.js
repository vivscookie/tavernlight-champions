import { getEvents, setRsvp, getDashboard, describeError } from '../api.js';
import { renderTemplate, bindElement } from '../ui/template.js';
import { dayChip, weekdayLong, formatMoneyCompact, safeUrl, initials, kickoffShort } from '../ui/format.js';
import { startCountdown, stopCountdown, formatCountdownCompact } from '../ui/countdown.js';
import { showToast } from '../ui/toast.js';

const $ = (id) => document.getElementById(id);

// =====================================================================
// Calendário do estúdio: os eventos vêm da API (GET /seasons/{id}/events)
// =====================================================================
const section = $('schedule-section');
const list = $('calendar-event-list');
const filterButtons = [...document.querySelectorAll('#calendar-filter-bar .cal-filter')];

// Filtros calculados a partir de FATOS do evento (nada de tags escritas à mão)
const FILTERS = {
  all: () => true,
  mine: (e) => e.participating,
  live: (e) => e.status === 'live' || e.status === 'live_soon',
  prizes: (e) => e.prize !== null,
};
const ACTION_LABEL = { spectate: 'Spectate Link', bracket: 'View Bracket', register: 'Register Team' };

let events = [];
let filter = 'all';

function eventVm(e) {
  const chip = dayChip(e.startsAt);
  const k = e.action.kind;
  const hasUrl = Boolean(safeUrl(e.action.url)); // URL insegura (javascript:, data:…) conta como indisponível
  return {
    ...e,
    dayLabel: chip.label,
    dayNumber: chip.number,
    isToday: chip.isToday,
    isLive: e.status === 'live',
    isSoon: e.status === 'live_soon',
    prizeLabel: e.prize ? (e.prize.kind === 'cash' ? `${formatMoneyCompact(e.prize.amountCents)} POT` : 'BRAGGING RIGHTS') : null,
    descriptionLine: e.registrationClosesAt ? `${e.description} • Open registration until ${weekdayLong(e.registrationClosesAt)}` : e.description,
    isSpectate: k === 'spectate' && hasUrl,
    isRsvp: k === 'rsvp',
    isLinkAction: (k === 'bracket' || k === 'register') && hasUrl,
    isPendingAction: (k === 'bracket' || k === 'register' || k === 'spectate') && !hasUrl,
    actionLabel: ACTION_LABEL[k] ?? '',
    rsvpLabel: k === 'rsvp' && e.action.going ? "RSVP'd (You)" : 'RSVP',
  };
}

function applyFilter(name) {
  filter = name;
  // O visual do chip ativo é CSS (aria-pressed:…); aqui só o atributo
  filterButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filter === name)));
  let shown = 0;
  for (const card of list.children) {
    const e = events.find((x) => x.id === card.dataset.eventId);
    const visible = Boolean(e) && FILTERS[name](e);
    card.classList.toggle('hidden', !visible);
    if (visible) shown += 1;
  }
  const label = document.querySelector(`[data-filter="${name}"]`)?.textContent.trim() ?? name;
  $('calendar-count').textContent = `Showing ${shown} ${shown === 1 ? 'event' : 'events'}: ${label}`;
  const empty = $('calendar-empty');
  empty.hidden = shown > 0 || $('calendar-loading').hidden === false;
  empty.textContent = events.length === 0 ? 'No events scheduled yet.' : 'No events match this filter.';
}

function renderEvents() {
  list.replaceChildren(...events.map((e) => renderTemplate($('tpl-event'), eventVm(e))));
  applyFilter(filter);
}

async function loadEvents() {
  section.setAttribute('aria-busy', 'true');
  $('calendar-error').hidden = true;
  $('calendar-loading').hidden = false;
  try {
    events = (await getEvents()).events;
    $('calendar-loading').hidden = true;
    renderEvents();
  } catch (error) {
    $('calendar-loading').hidden = true;
    $('calendar-error-message').textContent = describeError(error, "We couldn't load the calendar.");
    $('calendar-error').hidden = false;
  } finally {
    section.setAttribute('aria-busy', 'false');
  }
}

async function toggleRsvp(btn) {
  const event = events.find((e) => e.id === btn.dataset.eventId);
  const going = !event.action.going;
  btn.disabled = true;
  try {
    const updated = await setRsvp(event.id, going); // o servidor devolve o evento com a participação já recalculada
    events = events.map((e) => (e.id === updated.id ? updated : e));
    renderEvents();
    list.querySelector(`[data-event-id="${event.id}"] [data-action="rsvp"]`)?.focus();
    showToast({ tone: 'success', title: going ? `You're going to ${event.title}` : `RSVP cancelled for ${event.title}`, duration: 3500 });
  } catch (error) {
    btn.disabled = false;
    showToast({ tone: 'error', title: "Couldn't update your RSVP", message: describeError(error) });
  }
}

filterButtons.forEach((btn) => btn.addEventListener('click', () => applyFilter(btn.dataset.filter)));
list.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action="rsvp"]');
  if (btn && !btn.disabled) toggleRsvp(btn);
});
$('calendar-retry').addEventListener('click', loadEvents);
loadEvents();

// =====================================================================
// Herói e próxima partida: GET /me/dashboard (a MESMA partida do teammanager e do calendário)
// =====================================================================
const hero = $('hero');
const matchCard = $('next-match-card');
const teamVm = (t) => ({
  name: t.name,
  division: t.division, // só o adversário traz divisão
  crestSrc: safeUrl(t.crestUrl),
  initials: initials(t.name),
  seed: t.seed,
  recordText: `${t.record.wins}-${t.record.losses}`,
});

function renderHero(d) {
  const nm = d.nextMatch;
  const badge = $('countdown-badge');
  const timer = $('live-timer');
  bindElement(hero, { user: d.user, season: d.season, standing: d.standing, prizeShare: d.prizeShare, ...(nm ? { nextMatch: nm } : {}) });
  matchCard.hidden = !nm;

  if (!nm) {
    stopCountdown(badge);
    stopCountdown(timer);
    badge.textContent = 'No match';
    $('hero-bestof').hidden = true;
    return;
  }
  $('hero-bestof').hidden = false;

  const mine = teamVm(nm.team);
  const opponent = teamVm(nm.opponent);
  const { confirmed, required } = nm.checkIn; // derivado no servidor, igual ao do teammanager
  bindElement(matchCard, {
    nextMatch: nm,
    fixtureLabel: `UPCOMING LIVE FIXTURE • ${nm.gameLabel} ${nm.format}`,
    mine,
    opponent,
    mapPoolText: nm.mapPool.join(' / '),
    readinessText: `${confirmed}/${required} Ready`,
    readinessState: required > 0 && confirmed >= required ? 'ready' : 'incomplete',
  });
  // Sem brasão (ou com URL insegura) a tela mostra as iniciais do time
  matchCard.querySelector('[data-role="initials-mine"]').hidden = Boolean(mine.crestSrc);
  matchCard.querySelector('[data-role="initials-opponent"]').hidden = Boolean(opponent.crestSrc);
  $('voice-link').classList.toggle('hidden', !safeUrl(nm.voice?.url));

  // Contadores até o início, recalculados pelo relógio (não acumulam atraso em aba oculta)
  startCountdown(badge, nm.startsAt, { format: formatCountdownCompact, doneText: 'Live now' });
  const kickoff = kickoffShort(nm.startsAt);
  startCountdown(timer, nm.startsAt, { format: (s) => `${kickoff} (in ${formatCountdownCompact(s)})`, doneText: `${kickoff} • Live now` });
}

async function loadDashboard() {
  hero.setAttribute('aria-busy', 'true');
  $('dashboard-error').hidden = true;
  try {
    renderHero(await getDashboard());
  } catch (error) {
    $('dashboard-error-message').textContent = describeError(error, "We couldn't load your dashboard.");
    $('dashboard-error').hidden = false;
  } finally {
    hero.setAttribute('aria-busy', 'false');
  }
}
$('dashboard-retry').addEventListener('click', loadDashboard);
loadDashboard();
