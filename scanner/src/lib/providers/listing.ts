// ListingProvider : d'où viennent les annonces. Chaque source renvoie des ListingInput normalisés.
// Aujourd'hui : collage de texte, CSV, JSON, saisie manuelle, bookmarklet.
// Demain : une API (agrégateur payant, flux AJP) = une classe de plus qui implémente fetch().
import type { Dpe, ListingInput, LotType, SellerType, SubLot, Zone } from '../types';
import { buildLots, detectMainType, detectSeller, parseListingText, sourceFromUrl, splitPaste } from '../detect';
import { parseCsv, toObjects } from '../csv';
import { uid } from '../util';

export interface ListingProvider {
  id: string;
  label: string;
  kind: 'collage' | 'fichier' | 'api' | 'scraping';
  available: boolean;
  description: string;
  /** Sources fichier / collage : transforme un contenu en annonces. */
  parse?(content: string): ParsedListing[];
  /** Sources API : récupère les annonces des zones actives. */
  fetch?(zones: Zone[]): Promise<ParsedListing[]>;
}

export type ParsedListing = ListingInput & { parseNotes: string[] };

const num = (s?: string) => {
  if (!s) return undefined;
  const v = parseFloat(s.replace(/[\s €]/g, '').replace(',', '.'));
  return isFinite(v) ? v : undefined;
};

// Synonymes de colonnes acceptés à l'import CSV/JSON (insensible à la casse et aux accents).
const COLS: Record<string, string[]> = {
  title: ['titre', 'title', 'intitule'],
  price: ['prix', 'price', 'prix_affiche', 'prix affiché'],
  url: ['url', 'lien', 'link'],
  source: ['source', 'site'],
  number: ['numero', 'numéro', 'no', 'num'],
  street: ['rue', 'voie', 'adresse', 'address', 'street'],
  postalCode: ['cp', 'code_postal', 'code postal', 'postalcode', 'zip'],
  city: ['ville', 'commune', 'city'],
  insee: ['insee', 'code_insee', 'code_commune'],
  surface: ['surface', 'surface_m2', 'm2'],
  rooms: ['pieces', 'pièces', 'rooms', 'nb_pieces'],
  type: ['type', 'type_bien', 'type de lot', 'type_lot'],
  lots: ['lots', 'detail_lots', 'détail lots'],
  dpe: ['dpe', 'classe_energie'],
  charges: ['charges', 'charges_annuelles', 'charges_an'],
  coproLots: ['copro_lots', 'lots_copro', 'nb_lots_copro'],
  seller: ['vendeur', 'seller', 'type_vendeur'],
  publishedAt: ['date', 'date_publication', 'publication', 'publishedat'],
  description: ['description', 'texte', 'desc'],
  travaux: ['travaux'],
  lat: ['lat', 'latitude'],
  lon: ['lon', 'lng', 'longitude'],
};
const norm = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

function pick(o: Record<string, unknown>, field: string): string | undefined {
  const keys = Object.keys(o);
  for (const syn of COLS[field]) {
    const k = keys.find((x) => norm(x) === norm(syn));
    if (k && o[k] != null && String(o[k]).trim() !== '') return String(o[k]).trim();
  }
  return undefined;
}

const SELLERS: SellerType[] = ['particulier', 'agence', 'justice', 'notaire', 'inconnu'];

/** Format compact de la colonne « lots » : "appartement:58:3|cave|parking" ou "garage;garage;garage". */
export function parseLotsSpec(spec: string): SubLot[] {
  return spec.split(/[|+;]/).map((x) => x.trim()).filter(Boolean).map((p) => {
    const [t, s, r] = p.split(':');
    const type = detectMainType(t) === 'autre' ? (t.toLowerCase() as LotType) : detectMainType(t);
    return { id: uid('l'), type, surface: num(s), rooms: num(r) };
  });
}

export function rowToListing(o: Record<string, unknown>): ParsedListing {
  const notes: string[] = [];
  const description = pick(o, 'description') || '';
  const title = pick(o, 'title') || description.split('\n')[0]?.slice(0, 120) || 'Annonce importée';
  const url = pick(o, 'url');
  const src = (pick(o, 'source') || '').toLowerCase().replace(/[^a-z]/g, '');
  const source = (['seloger', 'leboncoin', 'logicimmo', 'bienici', 'pap', 'ajp', 'licitor', 'manuel'].includes(src) ? src : sourceFromUrl(url)) as ListingInput['source'];
  const surface = num(pick(o, 'surface'));
  const rooms = num(pick(o, 'rooms'));
  const lotsSpec = pick(o, 'lots');
  const main = detectMainType(pick(o, 'type') || title);
  const lots = Array.isArray((o as any).lots) ? ((o as any).lots as SubLot[]).map((l) => ({ ...l, id: l.id || uid('l') }))
    : lotsSpec ? parseLotsSpec(lotsSpec) : buildLots(main, surface, rooms, title + '\n' + description);
  const postalCode = (pick(o, 'postalCode') || '').padStart(5, '0');
  if (!num(pick(o, 'price'))) notes.push('Prix manquant');
  if (!/^\d{5}$/.test(postalCode)) notes.push('Code postal manquant');
  const sellerRaw = (pick(o, 'seller') || '').toLowerCase();
  const seller = (SELLERS.find((s) => sellerRaw.startsWith(s.slice(0, 4))) || detectSeller(title + ' ' + description, source)) as SellerType;
  const dpe = pick(o, 'dpe')?.toUpperCase();
  const lat = num(pick(o, 'lat')), lon = num(pick(o, 'lon'));
  const date = pick(o, 'publishedAt');
  const iso = date && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(date) ? date.split('/').reverse().map((x) => x.padStart(2, '0')).join('-') : date;
  return {
    source, url, title, description,
    price: num(pick(o, 'price')) || 0,
    address: { number: pick(o, 'number'), street: pick(o, 'street'), postalCode, city: pick(o, 'city') || '', insee: pick(o, 'insee'), dept: postalCode.slice(0, 2), lat, lon },
    surface, lots,
    dpe: dpe && /^[A-G]$/.test(dpe) ? (dpe as Dpe) : undefined,
    chargesAnnual: num(pick(o, 'charges')),
    coproLots: num(pick(o, 'coproLots')),
    seller,
    publishedAt: iso || new Date().toISOString().slice(0, 10),
    travaux: num(pick(o, 'travaux')),
    parseNotes: notes,
  };
}

export const PasteProvider: ListingProvider = {
  id: 'collage', label: 'Coller des annonces', kind: 'collage', available: true,
  description: 'Copier le texte d’une ou plusieurs annonces (séparées par une ligne ---). Prix, surface, adresse, DPE, charges, vendeur et lots groupés sont détectés automatiquement.',
  parse: (content) => splitPaste(content).map((t) => parseListingText(t)),
};

export const CsvProvider: ListingProvider = {
  id: 'csv', label: 'Fichier CSV', kind: 'fichier', available: true,
  description: 'Colonnes reconnues : titre, prix, url, source, numero, rue, cp, ville, insee, surface, pieces, type, lots, dpe, charges, vendeur, date, description, travaux, lat, lon. Voir data/demo/annonces-exemple.csv.',
  parse: (content) => toObjects(parseCsv(content)).map(rowToListing),
};

export const JsonProvider: ListingProvider = {
  id: 'json', label: 'Fichier JSON', kind: 'fichier', available: true,
  description: 'Tableau d’objets avec les mêmes champs que le CSV (ou le format interne ListingInput).',
  parse: (content) => {
    const data = JSON.parse(content);
    return (Array.isArray(data) ? data : [data]).map((o) => ('address' in o && 'lots' in o ? { ...o, parseNotes: [] } : rowToListing(o)));
  },
};

/** Emplacement prévu pour une API d'annonces (non branchée : aucune API gratuite et autorisée à ce jour). */
export const ApiProviderStub: ListingProvider = {
  id: 'api', label: 'API d’annonces (à brancher)', kind: 'api', available: false,
  description: 'Exemple d’intégration future : agrégateur d’annonces sous abonnement, flux AJP. Implémenter fetch(zones) et l’ajouter à LISTING_PROVIDERS.',
  fetch: async () => [],
};

export const LISTING_PROVIDERS: ListingProvider[] = [PasteProvider, CsvProvider, JsonProvider, ApiProviderStub];

// --- Ventes judiciaires : sortie de la veille Licitor du dépôt (veille/licitor.py → licitor.json)
const TRIB_DEPT: Record<string, string> = {
  nantes: '44', 'saint-nazaire': '44', 'la roche-sur-yon': '85', "les sables-d'olonne": '85', angers: '49', saumur: '49', tours: '37', blois: '41',
  'le mans': '72', laval: '53', orleans: '45', montargis: '45', chateauroux: '36', poitiers: '86', niort: '79', 'la rochelle': '17',
};
const LICITOR_TYPE: Record<string, LotType> = { studio: 'appartement', appartement: 'appartement', maison: 'maison', immeuble: 'maison', local: 'local', terrain: 'terrain' };

interface LicitorLot {
  lien: string; ref: string; titre: string; commune: string; type: string; tribunal: string; date?: string; lots?: number; adjuge?: number | null; map?: number | null;
  surface?: number | null; occupation?: string; description?: string; adresse?: string; poursuivant?: string; visite_txt?: string; carence?: boolean;
}

const median = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  return s.length ? s[Math.floor((s.length - 1) / 2)] : NaN;
};

/** Ratio médian adjudication / mise à prix observé, par tribunal (≥ 5 résultats) sinon toutes zones. */
export function adjudicationRatios(resultats: LicitorLot[]) {
  const ok = resultats.filter((r) => r.adjuge && r.map && r.map > 0);
  const byTrib = new Map<string, number[]>();
  for (const r of ok) (byTrib.get(norm(r.tribunal)) || byTrib.set(norm(r.tribunal), []).get(norm(r.tribunal))!).push(r.adjuge! / r.map!);
  const all = ok.map((r) => r.adjuge! / r.map!);
  return {
    get(tribunal: string) {
      const t = byTrib.get(norm(tribunal));
      if (t && t.length >= 5) return { ratio: median(t), n: t.length, scope: tribunal };
      if (all.length >= 5) return { ratio: median(all), n: all.length, scope: 'toutes zones' };
      return { ratio: 1.6, n: 0, scope: 'hypothèse par défaut' };
    },
  };
}

export const LicitorProvider: ListingProvider = {
  id: 'licitor', label: 'Ventes judiciaires (veille Licitor)', kind: 'fichier', available: true,
  description: 'Fichier licitor.json produit par veille/licitor.py (ventes à venir + adjudications 24 mois). Prix retenu = adjudication probable = mise à prix × ratio médian observé au même tribunal.',
  parse: (content) => {
    const data = JSON.parse(content) as { avenir?: LicitorLot[]; resultats?: LicitorLot[] };
    const ratios = adjudicationRatios(data.resultats || []);
    const today = new Date().toISOString().slice(0, 10);
    return (data.avenir || [])
      .filter((d) => d.map && (!d.date || d.date.slice(0, 10) >= today))
      .map((d) => {
        const r = ratios.get(d.tribunal);
        const price = Math.round((d.map! * r.ratio) / 500) * 500;
        const [streetPart, cityPart] = d.adresse && d.adresse.includes(',') ? [d.adresse.slice(0, d.adresse.lastIndexOf(',')), d.adresse.slice(d.adresse.lastIndexOf(',') + 1)] : ['', d.adresse || d.commune];
        const sm = streetPart.match(/^(\d{1,4}(?:\s?(?:bis|ter))?)[,\s]+(.+)$/i);
        const type = LICITOR_TYPE[d.type] ?? detectMainType(d.titre);
        const text = `${d.titre}. ${d.description || ''}`;
        const notes = [`Prix = adjudication probable : mise à prix ${d.map!.toLocaleString('fr-FR')} € × ${r.ratio.toFixed(2)} (médiane ${r.scope}, ${r.n} résultats)`];
        if (d.occupation === 'occupé' || d.occupation === 'bail') notes.push(`Bien ${d.occupation === 'bail' ? 'loué' : 'occupé'} : décote et délai`);
        notes.push('Code postal complété par géocodage à l’import');
        const listing: ParsedListing = {
          source: 'licitor', sourceRef: d.ref, url: d.lien,
          title: `Enchère ${d.tribunal} – ${d.titre} à ${d.commune}`.slice(0, 140),
          description: [text, d.date ? `Audience : ${d.date.replace('T', ' à ')}` : '', `Tribunal judiciaire de ${d.tribunal}`, d.visite_txt || '', d.poursuivant ? `Avocat poursuivant : ${d.poursuivant}` : '', `Occupation : ${d.occupation || 'inconnue'}`].filter(Boolean).join('\n'),
          price,
          address: { number: sm?.[1], street: sm ? sm[2] : streetPart || undefined, postalCode: '', city: (cityPart || d.commune).trim(), dept: TRIB_DEPT[norm(d.tribunal).replace(/\s+/g, ' ')] || '' },
          surface: d.surface ?? undefined,
          lots: buildLots(type, d.surface ?? undefined, undefined, text),
          seller: 'justice',
          publishedAt: today,
          auction: { date: d.date, map: d.map!, tribunal: d.tribunal, occupation: d.occupation, visite: d.visite_txt, avocat: d.poursuivant, ratio: r.ratio },
          parseNotes: notes,
        };
        return listing;
      });
  },
};

LISTING_PROVIDERS.splice(3, 0, LicitorProvider);
