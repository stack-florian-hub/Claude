// Lecture d'un texte d'annonce collé (ou capturé) et détection des lots groupés.
import type { Dpe, ListingInput, LotType, SellerType, Source, SubLot } from './types';
import { uid } from './util';
import { detectNetwork } from './networks';

/** Situations où le prix affiché n'est pas comparable à une vente libre (ou demande une décote). */
export interface Special { id: 'residence' | 'viager' | 'nue' | 'loue' | 'local' | 'rehab'; label: string; blocking: boolean }
const SPECIALS: [Special, RegExp][] = [
  [{ id: 'residence', label: 'Résidence gérée / services (seniors, étudiants, tourisme, LMNP) : prix d’investissement locatif, non comparable', blocking: true },
    /r[ée]sidences?[- ](?:de )?(?:services?|seniors?|s[ée]niors?|[ée]tudiante|de tourisme|g[ée]r[ée]e|h[ôo]teli[eè]re|affaires)|\bEHPAD\b|\bLMNP\b|bail commercial|garantie de (?:loyer|rentabilit)|loyers? (?:mensuels? )?garantis?|rentabilit[ée] garantie/i],
  [{ id: 'viager', label: 'Viager : prix hors rente, non comparable', blocking: true }, /\bviager|\bbouquet\b|rente viag/i],
  [{ id: 'nue', label: 'Nue-propriété / usufruit : non comparable', blocking: true }, /nue[- ]propri[ée]t[ée]|usufruit/i],
  [{ id: 'local', label: 'Local commercial ou professionnel : à valoriser comme local, pas comme logement', blocking: true }, /local commercial|local professionnel|ancienne agence (?:bancaire)?|fonds de commerce|murs commerciaux/i],
  [{ id: 'loue', label: 'Vendu loué : décote de 10 à 15 % et délai jusqu’à la libération', blocking: false }, /locataire en place|vendu lou[ée]|actuellement lou[ée]|bail en cours|\blou[ée] (?:\d|jusqu|depuis|meubl)/i],
  [{ id: 'rehab', label: 'Bien à réhabiliter (atelier, plateau, grange) : travaux lourds à chiffrer', blocking: false }, /atelier [àa] r[ée]habiliter|[àa] r[ée]habiliter|plateau [àa] am[ée]nager|non soumis [àa] DPE/i],
];
export function detectSpecial(text: string): Special[] {
  return SPECIALS.filter(([, re]) => re.test(text)).map(([sp]) => sp);
}

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
  const n = detectNetwork(u);
  if (n) return n.kind === 'notaires' ? 'notaires' : 'reseau';
  return 'autre';
}

export function detectSeller(t: string, src?: Source): SellerType {
  if (/vente (?:aux ench[eè]res|judiciaire|[àa] la barre)|adjudication|mise [àa] prix|licitation|saisie immobili/i.test(t) ) return 'justice';
  if (src === 'notaires' || /notaire|36 ?h(?:eures)?[- ]immo|immo-interactif|office notarial/i.test(t)) return 'notaire';
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
  // le garage ou la cave d'une maison font partie de la maison : pas de lot séparé
  if (main === 'maison' || main === 'terrain') return [{ id: uid('l'), type: main, surface, rooms }];
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
  // on coupe avant les blocs « annonces similaires » des portails (prix et lots d'autres biens)
  const full = raw.replace(/\r/g, '').trim();
  const cut = full.search(/\n\s*(?:annonces similaires|ces (?:biens|annonces) (?:pourraient|peuvent)|biens similaires|vous aimerez aussi|d'autres annonces|autres biens|à découvrir aussi)/i);
  const text = cut > 0 ? full.slice(0, cut) : full;
  const notes: string[] = [];
  const urlInText = url || text.match(/https?:\/\/\S+/)?.[0];
  let source = sourceFromUrl(urlInText);
  if (source === 'manuel' || source === 'autre') {
    const head = text.slice(0, 300).toLowerCase();
    const m = [['seloger', 'seloger'], ['leboncoin', 'leboncoin'], ['logic-immo', 'logicimmo'], ["bien'ici", 'bienici'], ['bienici', 'bienici'], ['pap.fr', 'pap'], ['de particulier à particulier', 'pap']].find(([k]) => head.includes(k));
    if (m) source = m[1] as Source;
  }
  const firstLine = text.split('\n').map((x) => x.trim()).find((x) => x && !/^https?:/.test(x)) || 'Annonce';
  const price = pickPrice(text);
  if (!price) notes.push('Prix non trouvé');
  const surfM = text.match(/(\d{1,4}(?:[,.]\d{1,2})?)\s*m(?:²|2)(?![a-z0-9])/i);
  const surface = surfM ? toNum(surfM[1]) : undefined;
  const roomsM = text.match(/(\d{1,2})\s*pi[eè]ces?/i) || text.match(/\b[TF](\d)\b/);
  const rooms = roomsM ? parseInt(roomsM[1], 10) : undefined;
  let cpM = text.match(/\b((?:0[1-9]|[1-8]\d|9[0-5])\d{3})\s+(?!euros?\b|eur\b|€|ttc\b|ht\b|hai\b)([A-ZÀ-Ýa-zà-ÿ][A-Za-zÀ-ÿ'’ -]{1,40})/i);
  let cityBefore: string | undefined;
  if (!cpM) {
    // « Cholet 49300 » ou « Cholet (49300) » : ville avant le code postal
    const m = text.match(/([A-ZÀ-Ý][A-Za-zÀ-ÿ'’-]+(?:[ -][A-Za-zÀ-ÿ'’-]+){0,3})\s*\(?\b((?:0[1-9]|[1-8]\d|9[0-5])\d{3})\b/);
    if (m) {
      cpM = [m[0], m[2], ''] as unknown as RegExpMatchArray;
      cityBefore = m[1].replace(/^(?:.*\s)?(?:à|a|sur|de)\s+/i, '');
    }
  }
  if (cpM && !cityBefore) {
    // « Nantes 44100 Chantenay » (Leboncoin) : la ville est avant le code postal, le quartier après
    const line = text.split('\n').find((x) => x.includes(cpM![1])) || '';
    const before = line.slice(0, line.indexOf(cpM[1])).replace(/[,(–-]\s*$/, '').trim();
    if (/^[A-ZÀ-Ý][A-Za-zÀ-ÿ'’ -]{1,40}$/.test(before) && !/\b(rue|avenue|boulevard|bd|place|quai|all[ée]e|chemin|impasse|route|cours|promenade|square|r[ée]sidence|prix|vente|appartement|maison|garage|parking)\b/i.test(before)) cityBefore = before;
  }
  if (!cpM) notes.push('Code postal non trouvé');
  // adresse : d'abord sur la ligne du code postal, sinon une voie précédée d'un numéro
  const STREET = /(?<!\d)(\d{1,4}(?:\s?(?:bis|ter))?(?:-\d{1,4})?)?[,\s]*\b((?:rue|avenue|av\.|boulevard|bd|place|quai|all[ée]e|chemin|impasse|route|cours|promenade|square|r[ée]sidence)\s[^\n,.;()]{2,45})/i;
  const cpLine = cpM ? text.split('\n').find((x) => x.includes(cpM[1])) : undefined;
  let streetM = cpLine?.match(STREET) || null;
  if (!streetM) {
    const m = text.match(new RegExp(STREET.source.replace(')?[,\\s]*', ')[,\\s]+'), 'i'));
    streetM = m;
  }
  const dpeM = text.match(/(?:DPE|classe [ée]nerg(?:[ée]tique|ie)|consommation [ée]nerg[ée]tique|[ée]tiquette [ée]nergie|diagnostic de performance [ée]nerg[ée]tique(?:\s*\(DPE\))?)[)\s:]*(?:classe\s*)?([A-G])\b/i);
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
  const network = detectNetwork(urlInText, text);
  if (network && source === 'manuel') source = network.kind === 'notaires' ? 'notaires' : 'reseau';
  const agencyM = text.match(/pr[ée]sent[ée]e? par\s*\n?\s*([^\n]{3,60})/i) || text.match(/\bREF\S*\s*-\s*([^\n]{3,60})/i);
  return {
    source,
    network: network?.id,
    agency: agencyM?.[1].trim(),
    url: urlInText,
    title: firstLine.slice(0, 140),
    description: text.slice(0, 4000),
    price: price || 0,
    address: {
      number: streetM?.[1]?.trim(),
      street: streetM?.[2]?.replace(/\s+\d{5}\b.*$/, '').trim(),
      postalCode,
      city: (cityBefore || cpM?.[2] || '').replace(/\s+(?:-|–).*$/, '').trim(),
      dept: postalCode.slice(0, 2),
    },
    surface,
    lots,
    dpe: dpeM?.[1].toUpperCase() as Dpe | undefined,
    chargesAnnual,
    coproLots: coproM ? parseInt(coproM[1], 10) : undefined,
    coproProcedure: procedure || undefined,
    seller: ((sel) => (sel === 'inconnu' && network ? (network.kind === 'notaires' ? 'notaire' : 'agence') : sel))(detectSeller(text, source)),
    publishedAt,
    parseNotes: notes,
  };
}

/** Sépare un collage de plusieurs annonces (ligne « --- » ou « === » entre deux annonces). */
export function splitPaste(raw: string): string[] {
  return raw.split(/\n\s*(?:-{3,}|={3,})\s*\n/).map((x) => x.trim()).filter((x) => x.length > 20);
}
