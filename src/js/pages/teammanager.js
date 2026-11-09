import { getTeam, updateMemberStatus, removeMember, decideInvite, revokeInvite, describeError } from '../api.js';
import { bindElement, renderList, renderTemplate } from '../ui/template.js';
import { safeImageUrl, kickoffLabel, clockTime } from '../ui/format.js';
import { startCountdown, stopCountdown } from '../ui/countdown.js';
import { showToast } from '../ui/toast.js';
import { showDialog } from '../ui/dialog.js';

const $ = (id) => document.getElementById(id);
const main = $('main-content');
let team = null;

// ---------- view models: o que o template precisa além do que a API devolve
const memberVm = (m) => ({ ...m, domId: `roster-${m.id}`, avatarSrc: safeImageUrl(m.avatarUrl), removeLabel: `Remove ${m.handle}` });
const inboundVm = (i) => ({ ...i, domId: `invite-${i.id}`, avatarSrc: safeImageUrl(i.avatarUrl) });
const outboundVm = (o) => ({ ...o, domId: `outbound-${o.id}` });

// ---------- renderização
function emptyRow(text) {
  const tr = document.createElement('tr');
  const td = document.createElement('td');
  td.colSpan = 5;
  td.className = 'py-space-lg px-space-md text-center text-on-surface-variant font-body-md text-body-md';
  td.textContent = text;
  tr.append(td);
  return tr;
}

// Contexto completo da tela (cabeçalho, estatísticas, contadores): é religado a cada mudança
const headerVm = () => ({
  ...team,
  crestSrc: safeImageUrl(team.crestUrl),
  memberCount: team.members.length,
  inboundCount: team.invites.inbound.length,
  outboundCount: team.invites.outbound.length,
});

function render() {
  bindElement(main, headerVm());
  renderList($('enrolled-titles'), $('tpl-title-pill'), team.enrolledTitles, (code) => ({ code }));
  renderRoster();
  renderInvites();
  renderSchedule();
}

// ---------- próxima partida e escalações (tudo derivado no servidor; aqui só se mostra) ----------
const isNumbered = (position) => /^\d+$/.test(position);
const slotVm = (s) => ({
  ...s,
  isOpen: s.status === 'open',
  slotLabel:
    s.status === 'open'
      ? `${s.position}${isNumbered(s.position) ? '.' : ':'} Open slot`
      : isNumbered(s.position)
        ? `${s.position}. ${s.handle} (${s.detail})`
        : `${s.position}: ${s.handle} (${s.detail})`,
});
const disciplineVm = (d) => (d.kind === 'squad' ? { ...d, slots: d.slots.map(slotVm) } : d);

function renderSchedule() {
  const nm = team.nextMatch;
  const section = $('next-match');
  section.hidden = !nm;
  if (nm) {
    const { confirmed, required, locksAt } = nm.checkIn;
    bindElement(section, {
      nextMatch: nm,
      matchTitle: `${team.name} vs. ${nm.opponent.name} (${nm.gameLabel})`,
      matchSchedule: `Scheduled ${kickoffLabel(nm.startsAt)} • ${nm.server} • ${nm.lobby}`,
      readinessText: `${confirmed} / ${required} CONFIRMED`,
      readinessState: required > 0 && confirmed >= required ? 'ready' : 'incomplete',
      lockNote: `Check-in locks at ${clockTime(locksAt)}. Substitute swaps allowed up to ${nm.swapWindowMinutes} minutes prior to map veto.`,
    });
    startCountdown($('lock-countdown'), locksAt);
  } else {
    stopCountdown($('lock-countdown'));
  }

  const grid = $('discipline-grid');
  if (team.disciplines.length === 0) {
    const p = document.createElement('p');
    p.className = 'font-body-md text-body-md text-on-surface-variant lg:col-span-3';
    p.textContent = 'No disciplines enrolled yet.';
    grid.replaceChildren(p);
    return;
  }
  const frag = document.createDocumentFragment();
  for (const d of team.disciplines) frag.append(renderTemplate($(d.kind === 'solo' ? 'tpl-discipline-solo' : 'tpl-discipline-squad'), disciplineVm(d)));
  grid.replaceChildren(frag);
}

// Remover/aceitar mexe nas escalações e no check-in: o servidor recalcula, a tela só relê
async function refreshSchedule() {
  try {
    const fresh = await getTeam();
    team.nextMatch = fresh.nextMatch;
    team.disciplines = fresh.disciplines;
    renderSchedule();
  } catch {
    showToast({ tone: 'info', title: 'Lineups may be out of date', message: 'Reload the page to refresh them.', duration: 6000 });
  }
}

function renderRoster() {
  renderList($('roster-grid'), $('tpl-roster-card'), team.members, memberVm);
  bindElement(main, headerVm());
}

function renderInvites() {
  const { inbound, outbound } = team.invites;
  renderList($('inbound-rows'), $('tpl-inbound-row'), inbound, inboundVm);
  if (inbound.length === 0) $('inbound-rows').append(emptyRow('No pending applications.'));
  renderList($('outbound-list'), $('tpl-outbound'), outbound, outboundVm);
  bindElement(main, headerVm());
}

// ---------- carga (loading / erro / tentar de novo)
async function load() {
  main.setAttribute('aria-busy', 'true');
  $('team-error').hidden = true;
  try {
    team = await getTeam();
    render();
  } catch (error) {
    $('team-error-message').textContent = describeError(error, "We couldn't load your squad.");
    $('team-error').hidden = false;
    $('team-retry').focus();
  } finally {
    main.setAttribute('aria-busy', 'false');
  }
}
$('team-retry').addEventListener('click', load);

// ---------- ações (cada uma chama a API; a tela só muda depois da resposta, salvo o status, que é otimista)
const memberById = (id) => team.members.find((m) => m.id === id);

async function toggleStatus(btn) {
  const card = btn.closest('.roster-card');
  const member = memberById(card.dataset.memberId);
  const previous = member.status;
  const next = previous === 'starter' ? 'sub' : 'starter';
  card.dataset.status = next; // otimista: o visual é CSS (group-data-[status=…])
  btn.disabled = true;
  try {
    const saved = await updateMemberStatus(member.id, next);
    member.status = saved.status;
    showToast({ tone: 'info', title: `${member.handle} is now ${saved.status === 'starter' ? 'an active starter' : 'a reserve'}`, duration: 3000 });
  } catch (error) {
    card.dataset.status = previous; // desfaz
    showToast({ tone: 'error', title: `Couldn't update ${member.handle}`, message: describeError(error) });
  } finally {
    btn.disabled = false;
  }
}

async function remove(btn) {
  const member = memberById(btn.closest('.roster-card').dataset.memberId);
  const choice = await showDialog({
    title: `Remove ${member.handle} from the squad?`,
    message: 'They lose their slot immediately and can only come back through a new application.',
    actions: [{ id: 'cancel', label: 'Cancel' }, { id: 'remove', label: 'Remove player', primary: true }],
  });
  if (choice !== 'remove') return;
  btn.disabled = true;
  try {
    await removeMember(member.id);
    team.members = team.members.filter((m) => m.id !== member.id);
    renderRoster();
    $('roster-grid').focus(); // o botão que tinha o foco saiu da página
    showToast({ tone: 'info', title: `${member.handle} removed from the roster`, duration: 4000 });
    refreshSchedule(); // o slot dele nas escalações fica "open" e o check-in é recalculado pelo servidor
  } catch (error) {
    btn.disabled = false;
    showToast({ tone: 'error', title: `Couldn't remove ${member.handle}`, message: describeError(error) });
  }
}

async function answerInvite(btn) {
  const row = btn.closest('tr');
  const invite = team.invites.inbound.find((i) => i.id === btn.dataset.inviteId);
  const decision = btn.dataset.decision;
  const buttons = row.querySelectorAll('button');
  buttons.forEach((b) => { b.disabled = true; });
  try {
    const res = await decideInvite(invite.id, decision);
    team.invites.inbound = team.invites.inbound.filter((i) => i.id !== invite.id);
    if (res.member) team.members.push(res.member);
    renderRoster();
    renderInvites();
    $('inbound-rows').querySelector('button')?.focus();
    showToast({
      tone: decision === 'accept' ? 'success' : 'info',
      title: decision === 'accept' ? `${invite.handle} joined the squad as a reserve` : `Application from ${invite.handle} declined`,
      duration: 4000,
    });
  } catch (error) {
    buttons.forEach((b) => { b.disabled = false; });
    showToast({ tone: 'error', title: `Couldn't ${decision} ${invite.handle}`, message: describeError(error) });
  }
}

async function revoke(btn) {
  const invite = team.invites.outbound.find((i) => i.id === btn.dataset.inviteId);
  btn.disabled = true;
  try {
    await revokeInvite(invite.id);
    team.invites.outbound = team.invites.outbound.filter((i) => i.id !== invite.id);
    renderInvites();
    showToast({ tone: 'info', title: `Invite to ${invite.handle} revoked`, duration: 4000 });
  } catch (error) {
    btn.disabled = false;
    showToast({ tone: 'error', title: `Couldn't revoke the invite`, message: describeError(error) });
  }
}

document.addEventListener('click', (event) => {
  const el = event.target.closest('[data-action]');
  if (!el || el.disabled) return;
  const run = { 'toggle-status': toggleStatus, remove, invite: answerInvite, revoke }[el.dataset.action];
  if (run) run(el);
});

load();
