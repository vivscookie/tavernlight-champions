// Formatadores usados pelos templates (data-text="campo|pipe") e pelas telas.
const USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const USD_INT = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

/** Centavos inteiros -> "$1,425.00" */
export const formatMoney = (cents) => USD.format(cents / 100);
/** "$1,425" (sem centavos; a parte decimal vem de moneyDec) */
export const formatMoneyInt = (cents) => USD_INT.format(Math.trunc(cents / 100));
/** ".50" */
export const formatMoneyDec = (cents) => `.${String(Math.abs(cents) % 100).padStart(2, '0')}`;

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** "14m ago", "3h ago", "2d ago" */
export function timeAgoShort(iso, now = Date.now()) {
  const min = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  if (min < 1440) return `${Math.floor(min / 60)}h ago`;
  return `${Math.floor(min / 1440)}d ago`;
}

/** "18 hours ago", "1 day ago" */
export function timeAgoLong(iso, now = Date.now()) {
  const min = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (min < 1) return 'just now';
  if (min < 60) return `${plural(min, 'minute')} ago`;
  if (min < 1440) return `${plural(Math.floor(min / 60), 'hour')} ago`;
  return `${plural(Math.floor(min / 1440), 'day')} ago`;
}

/** "6h", "45m", "expired" */
export function timeLeft(iso, now = Date.now()) {
  const min = Math.round((new Date(iso).getTime() - now) / 60000);
  if (min <= 0) return 'expired';
  return min < 60 ? `${min}m` : `${Math.floor(min / 60)}h`;
}

/** "alex_design" -> "AD"; "vivi#0001" -> "VI" */
export function initials(handle) {
  const parts = String(handle).split(/[^A-Za-z]+/).filter(Boolean);
  const out = parts.length > 1 ? parts[0][0] + parts[1][0] : (parts[0] ?? '?').slice(0, 2);
  return out.toUpperCase();
}

const GAME_ICON = { cs2: 'target', lol: 'swords', smash: 'sports_esports', valorant: 'adjust' };
export const gameIcon = (game) => GAME_ICON[game] ?? 'sports_esports';

/** Só aceita URLs http(s) ou relativas vindas da API (nada de javascript:, data:, vbscript:, file: nem //host) */
export function safeUrl(url) {
  if (typeof url !== 'string' || !url) return null;
  if (url.startsWith('/') && !url.startsWith('//')) return url;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch {
    return null;
  }
}
export const safeImageUrl = safeUrl;

/** "Today 14:05", "Yesterday 16:42", "Oct 3 09:10" (fuso do usuário) */
export function dayTime(iso, now = new Date()) {
  const d = new Date(iso);
  const hhmm = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const midnight = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((midnight(now) - midnight(d)) / 86400000);
  const day = days === 0 ? 'Today' : days === 1 ? 'Yesterday' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${day} ${hhmm}`;
}

/** "19:30 EDT": hora local do usuário, com o fuso */
export const clockTime = (iso) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });

/** "Tonight at 19:30 EDT" · "Today at 09:00 EDT" · "Tomorrow at 19:30 EDT" · "Mon, Oct 27 at 19:30 EDT" */
export function kickoffLabel(iso, now = new Date()) {
  const d = new Date(iso);
  const midnight = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((midnight(d) - midnight(now)) / 86400000);
  let day;
  if (days === 0) day = d.getHours() >= 18 ? 'Tonight' : 'Today';
  else if (days === 1) day = 'Tomorrow';
  else day = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  return `${day} at ${clockTime(iso)}`;
}

const midnight = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();

/** Chip de calendário no fuso do usuário: { label: 'TODAY' | 'FRI', number: '28' } */
export function dayChip(iso, now = new Date()) {
  const d = new Date(iso);
  const today = midnight(d) === midnight(now);
  return { label: today ? 'TODAY' : d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(), number: String(d.getDate()), isToday: today };
}

/** "Tuesday" (fuso do usuário) */
export const weekdayLong = (iso) => new Date(iso).toLocaleDateString('en-US', { weekday: 'long' });

/** "$450" quando redondo, "$450.50" quando não */
export const formatMoneyCompact = (cents) => (cents % 100 === 0 ? formatMoneyInt(cents) : formatMoney(cents));

/** "Fri 19:30 GMT-3": dia curto + hora 24 h + fuso, na hora local do usuário (mesmo formato de clockTime) */
export const kickoffShort = (iso) => `${new Date(iso).toLocaleDateString('en-US', { weekday: 'short' })} ${clockTime(iso)}`;

export const PIPES = {
  money: formatMoney,
  moneyInt: formatMoneyInt,
  moneyDec: formatMoneyDec,
  pct: (v) => `${v}%`,
  moneyCompact: formatMoneyCompact,
  seed: (v) => `#${v} Seed`,
  signed: (v) => (v > 0 ? `+${v}` : String(v)),
  signedPct: (v) => `${v > 0 ? '+' : ''}${v}%`,
  dayTime,
  clock: clockTime,
  kickoff: (v) => kickoffLabel(v),
  rank: (v) => `#${v}`,
  bullet: (v) => `• ${v}`,
  upper: (v) => String(v).toUpperCase(),
  initials,
  gameIcon,
  agoShort: (v) => timeAgoShort(v),
  agoLong: (v) => timeAgoLong(v),
  left: (v) => timeLeft(v),
  plusMoney: (v) => `+${formatMoney(v)}`,
};
