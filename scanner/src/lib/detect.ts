// Lecture d'un texte d'annonce collé (ou capturé) et détection des lots groupés.
import type { Dpe, ListingInput, LotType, SellerType, Source, SubLot } from './types';
import { uid } from './util';

const WORDS: Record<string, number> = { un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6 };

const toNum = (s: string) => parseFloat(s.replace(/[\s  .]/g, '').replace(',', '.'));

export function sourceFromUrl(url?: string): Source {
  if (!url) return 'manuel';
  const u = url.toLowerCase();
  if (u.includes('seloger')) return 'seloger';
  if (u.includes('leboncoin')) return 'leboncoin';
  if (u.includes('logic-immo')) return 'logicimmo';
  if (u.includes('bienici')) return 'bienici';
  if (u.includes('pap.fr')) return 'pap';
  if (u.includes('ajp')) return 'ajp';
  if (u.includes('licitor')) return 'licitor';
  return 'autre';
}

export function detectSeller(t: string, src?: Source): SellerType {
  if (/vente (?:aux ench[eè]res|judiciaire|[àa] la barre)|adjudication|mise [àa] prix|licitation|saisie immobili/i.test(t) || src === 'licitor') return 'justice';
  if (/notaire|36h[- ]immo|immo-interactif/i.test(t)) return 'notaire';
  if (/\bparticulier\b|de particulier [àa] particulier/i.test(t) || src === 'pap') return 'particulier';
  if (/agence|honoraires|mandat|n[ée]gociat(?:eur|rice)|conseill[eè]re? immobili/i.test(t)) return 'agence';
  return 'inconnu';
}

export function detectMainType(t: string): LotType {
  const s = t.toLowerCase();
  if (/\b(maison|pavillon|long[eè]re|villa|corps de ferme)\b/.test(s)) return 'maison';
  if (/\b(appartement|studio|duplex|triplex|loft)\b|\b[tf]\d\b/.test(s)) return 'appartement';
  if (/\b(local commercial|local professionnel|bureaux?|commerce|boutique)\b/.test(s)) return 'local';
  if (/\b(garage|box)\b/.test(s)) return 'garage';
  if (/\b(parking|place de stationnement|emplacement)\b/.test(s)) return 'parking';
  if (/\bcave\b/.test(s)) return 'cave';
  if (/\bterrain\b/.test(s)) return 'terrain';
  return 'autre';
}

const DEP_RE = /\b(un|une|deux|trois|quatre|cinq|six|\d)?\s*(garages?|box(?:es)?|parkings?|places? de (?:parking|stationnement)|emplacements? de (?:parking|stationnement)|caves?|celliers?)\b/gi;
const NEG_BEFORE = /(proche|proximit[ée]|possibilit[ée]|en option|en sus|non (?:inclus|compris)|sans|pas de|[àa] louer|location|acc[eè]s|dans la rue|facile|ext[ée]rieur au lot)[^.\n]{0,20}$/i;
const NEG_AFTER = /^[^.\n]{0,12}(visiteurs?|public|gratuit|[àa] proximit|en sus|en option|possible|[àa] louer|collectif)/i;

/** Détecte les dépendances vendues avec le bien (garage, parking, cave) et leur nombre. */
export function detectDependencies(text: string): { type: LotType; count: number }[] {
  const found: Record<string, number> = {};
  for (const m of text.matchAll(DEP_RE)) {
    const before = text.slice(Math.max(0, m.index! - 40), m.index!);
    const after = text.slice(m.index! + m[0].length, m.index! + m[0].length + 25);
    if (NEG_BEFORE.test(before) || NEG_AFTER.test(after)) continue;
    const w = m[2].toLowerCase();
    const type: LotType = /garage|box/.test(w) ? 'garage' : /cave|cellier/.test(w) ? 'cave' : 'parking';
    const q = m[1] ? (WORDS[m[1].toLowerCase()] ?? parseInt(m[1], 10)) : /s$|boxes/.test(w) && !/^places?/.test(w) ? 2 : 1;
    found[type] = Math.max(found[type] || 0, Math.min(q || 1, 6));
  }
  return Object.entries(found).map(([type, count]) => ({ type: type as LotType, count }));
}

/** Construit la liste des lots : bien principal + dépendances détectées. */
export function buildLots(main: LotType, surface: number | undefined, rooms: number | undefined, text: string): SubLot[] {
  const lots: SubLot[] = [];
  const deps = detectDependencies(text);
  const isDepOnly = ['garage', 'parking', 'cave'].includes(main);
  if (!isDepOnly) lots.push({ id: uid('l'), type: main, surface, rooms });
  for (const d of deps) {
    // annonce « garage seul » : la dépendance détectée est le bien principal
    const n = isDepOnly && d.type === main ? Math.max(1, d.count) : d.count;
    for (let i = 0; i < n; i++) lots.push({ id: uid('l'), type: d.type, label: n > 1 ? `${d.type} ${i + 1}` : undefined, surface: isDepOnly && d.type === main && n === 1 ? surface : undefined });
  }
  if (!lots.length) lots.push({ id: uid('l'), type: main, surface });
  // « lot de 3 boxes » / « 2 garages » sans autre bien
  const m = text.match(/lot de (\d|deux|trois|quatre|cinq)\s+(garages?|box(?:es)?|parkings?|caves?)/i);
  if (m && lots.length === 1) {
    const q = WORDS[m[1].toLowerCase()] ?? parseInt(m[1], 10);
    const t = lots[0].type;
    return Array.from({ length: q }, (_, i) => ({ id: uid('l'), type: t, label: `${t} ${i + 1}` }));
  }
  return lots;
}

function pickPrice(t: string): number | undefined {
  const re = /(\d{1,3}(?:[\s  .]\d{3})+|\d{4,7})(?:,\d{2})?\s*(?:€|euros?\b|EUR\b)/gi;
  const cands: { v: number; ctx: string }[] = [];
  for (const m of t.matchAll(re)) cands.push({ v: toNum(m[1]), ctx: t.slice(Math.max(0, m.index! - 35), m.index!).toLowerCase() });
  const ok = cands.filter((c) => c.v >= 1000 && !/charges?|taxe|honoraires|frais|loyer|mensualit|\/m|par m|caution|d[ée]p[oô]t/.test(c.ctx));
  const labelled = ok.find((c) => /prix|vendu|vente|adjudication|net vendeur|fai/.test(c.ctx) && !/mise [àa] prix/.test(c.ctx));
  return (labelled ?? ok[0])?.v;
}

export function parseListingText(raw: string, url?: string): ListingInput & { parseNotes: string[] } {
  const text = raw.replace(/\r/g, '').trim();
  const notes: string[] = [];
  const urlInText = url || text.match(/https?:\/\/\S+/)?.[0];
  const source = sourceFromUrl(urlInText);
  const firstLine = text.split('\n').map((x) => x.trim()).find((x) => x && !/^https?:/.test(x)) || 'Annonce';
  const price = pickPrice(text);
  if (!price) notes.push('Prix non trouvé');
  const surfM = text.match(/(\d{1,4}(?:[,.]\d{1,2})?)\s*m(?:²|2)(?![a-z0-9])/i);
  const surface = surfM ? toNum(surfM[1]) : undefined;
  const roomsM = text.match(/(\d{1,2})\s*pi[eè]ces?/i) || text.match(/\b[TF](\d)\b/);
  const rooms = roomsM ? parseInt(roomsM[1], 10) : undefined;
  const cpM = text.match(/\b((?:0[1-9]|[1-8]\d|9[0-5])\d{3})\s+([A-ZÀ-Ýa-zà-ÿ][A-Za-zÀ-ÿ'’ -]{1,40})/);
  if (!cpM) notes.push('Code postal non trouvé');
  const streetM = text.match(/(\d{1,4}(?:\s?(?:bis|ter))?(?:-\d{1,4})?)?[,\s]*\b((?:rue|avenue|av\.|boulevard|bd|place|quai|all[ée]e|chemin|impasse|route|cours|promenade|square|r[ée]sidence)\s[^\n,.;()]{2,45})/i);
  const dpeM = text.match(/(?:DPE|classe [ée]nerg[ée]tique|consommation [ée]nerg[ée]tique|[ée]tiquette [ée]nergie)\s*:?\s*(?:classe\s*)?([A-G])\b/i);
  const chM = text.match(/charges?[^\d\n]{0,30}(\d[\d\s .]*)\s*€\s*(?:\/|par)?\s*(an|mois|trimestre)?/i);
  let chargesAnnual: number | undefined;
  if (chM) {
    const v = toNum(chM[1]);
    chargesAnnual = chM[2] === 'mois' ? v * 12 : chM[2] === 'trimestre' ? v * 4 : v < 400 && !chM[2] ? v * 12 : v;
  }
  const coproM = text.match(/copropri[ée]t[ée][^\n.]{0,20}?(\d{1,4})\s*lots/i) || text.match(/(\d{1,4})\s*lots[^\n.]{0,20}copropri/i);
  const procedure = /proc[ée]dure (?:en cours|d'alerte)|copropri[ée]t[ée] en difficult|administrateur provisoire|plan de sauvegarde/i.test(text);
  const main = detectMainType(firstLine + '\n' + text.slice(0, 400));
  const lots = buildLots(main, surface, rooms, text);
  const dateM = text.match(/(?:publi[ée]e?|mise en ligne|cr[ée]{1,2}e?)\s*(?:le\s*)?:?\s*(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})/i);
  const publishedAt = dateM ? `${dateM[3].length === 2 ? '20' + dateM[3] : dateM[3]}-${dateM[2].padStart(2, '0')}-${dateM[1].padStart(2, '0')}` : new Date().toISOString().slice(0, 10);
  const postalCode = cpM?.[1] || '';
  return {
    source,
    url: urlInText,
    title: firstLine.slice(0, 140),
    description: text.slice(0, 4000),
    price: price || 0,
    address: {
      number: streetM?.[1]?.trim(),
      street: streetM?.[2]?.replace(/\s+\d{5}\b.*$/, '').trim(),
      postalCode,
      city: (cpM?.[2] || '').replace(/\s+(?:-|–).*$/, '').trim(),
      dept: postalCode.slice(0, 2),
    },
    surface,
    lots,
    dpe: dpeM?.[1].toUpperCase() as Dpe | undefined,
    chargesAnnual,
    coproLots: coproM ? parseInt(coproM[1], 10) : undefined,
    coproProcedure: procedure || undefined,
    seller: detectSeller(text, source),
    publishedAt,
    parseNotes: notes,
  };
}

/** Sépare un collage de plusieurs annonces (ligne « --- » ou « === » entre deux annonces). */
export function splitPaste(raw: string): string[] {
  return raw.split(/\n\s*(?:-{3,}|={3,})\s*\n/).map((x) => x.trim()).filter((x) => x.length > 20);
}
