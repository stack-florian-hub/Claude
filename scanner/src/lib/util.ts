export const uid = (p = '') => p + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);

export const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

export function quantile(sorted: number[], p: number): number {
  if (!sorted.length) return NaN;
  const k = (sorted.length - 1) * p;
  const f = Math.floor(k);
  const c = Math.min(f + 1, sorted.length - 1);
  return sorted[f] + (sorted[c] - sorted[f]) * (k - f);
}

export const round = (x: number, step = 100) => Math.round(x / step) * step;

export function stripAccents(s: string) {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '');
}

export function normCity(s: string) {
  return stripAccents(s || '').toLowerCase().replace(/saint/g, 'st').replace(/[^a-z0-9]+/g, ' ').trim();
}

const VOIE_TYPES: [RegExp, string][] = [
  [/\bAVENUE\b/g, 'AV'], [/\bBOULEVARD\b/g, 'BD'], [/\bPLACE\b/g, 'PL'], [/\bCHEMIN\b/g, 'CHE'], [/\bROUTE\b/g, 'RTE'],
  [/\bIMPASSE\b/g, 'IMP'], [/\bALLEE\b/g, 'ALL'], [/\bCOURS\b/g, 'CRS'], [/\bSQUARE\b/g, 'SQ'], [/\bRESIDENCE\b/g, 'RES'],
  [/\bPASSAGE\b/g, 'PAS'], [/\bMARECHAL\b/g, 'MAL'], [/\bGENERAL\b/g, 'GEN'], [/\bSAINTE\b/g, 'STE'], [/\bSAINT\b/g, 'ST'],
  [/\bDOCTEUR\b/g, 'DR'], [/\bPRESIDENT\b/g, 'PDT'], [/\bPROMENADE\b/g, 'PROM'], [/\bFAUBOURG\b/g, 'FG'], [/\bQUAI\b/g, 'QUAI'],
];
const STOP = new Set(['DE', 'DU', 'DES', 'LA', 'LE', 'LES', 'L', 'D', 'AU', 'AUX', 'ET']);
const TYPES = new Set(['RUE', 'AV', 'BD', 'PL', 'CHE', 'RTE', 'IMP', 'ALL', 'CRS', 'SQ', 'RES', 'PAS', 'PROM', 'FG', 'QUAI']);

/** Clé de rue comparable entre annonce ("avenue Notre-Dame") et DVF ("AV NOTRE DAME"). */
export function streetKey(s?: string): string {
  if (!s) return '';
  let u = stripAccents(s).toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ');
  for (const [re, r] of VOIE_TYPES) u = u.replace(re, r);
  return u.split(/\s+/).filter((w) => w && !STOP.has(w) && !/^\d+[A-Z]?$/.test(w)).join(' ');
}
/** Partie distinctive de la rue (sans le type de voie). */
export function streetCore(s?: string) {
  return streetKey(s).split(' ').filter((w) => !TYPES.has(w)).join(' ');
}

export function haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000, toR = Math.PI / 180;
  const dLat = (lat2 - lat1) * toR, dLon = (lon2 - lon1) * toR;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export const daysBetween = (a: string, b: string | Date = new Date()) =>
  Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);

export function addMonths(iso: string, m: number) {
  const d = new Date(iso);
  d.setMonth(d.getMonth() + m);
  return d.toISOString().slice(0, 10);
}

export const today = () => new Date().toISOString().slice(0, 10);

const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
export const eur = (x?: number | null) => (x == null || !isFinite(x) ? '—' : nf.format(Math.round(x)) + ' €');
export const keur = (x?: number | null) => (x == null || !isFinite(x) ? '—' : (x / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' k€');
export const pct = (x?: number | null, d = 0) => (x == null || !isFinite(x) ? '—' : (x * 100).toLocaleString('fr-FR', { maximumFractionDigits: d }) + ' %');
export const num = (x?: number | null, d = 0) => (x == null || !isFinite(x) ? '—' : x.toLocaleString('fr-FR', { maximumFractionDigits: d }));
export const frDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('fr-FR') : '—');
