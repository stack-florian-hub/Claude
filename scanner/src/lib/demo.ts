// Jeu de démonstration : DVF fictif (généré de façon déterministe) + annonces + pipeline.
// Les valeurs sont plausibles mais FICTIVES : remplacer par la vraie DVF (npm run dvf:fetch).
import type { Deal, DvfIndex, DvfMutation, ListingInput, SubLot } from './types';
import { addMonths } from './util';

function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(r() + 1e-9)) * Math.cos(2 * Math.PI * r());

interface DemoCommune { insee: string; cps: string[]; name: string; dept: string; ppmA: number; ppmM: number; dep: [number, number]; streets: [string, number][]; lat: number; lon: number }

// dep = [médiane, dispersion] des dépendances vendues seules ; streets = [nom DVF, coefficient de prix]
export const DEMO_COMMUNES: DemoCommune[] = [
  { insee: '78551', cps: ['78100'], name: 'Saint-Germain-en-Laye', dept: '78', ppmA: 7200, ppmM: 7600, dep: [24000, 0.3], lat: 48.898, lon: 2.093,
    streets: [['AV NOTRE DAME', 1.06], ['RUE DE PARIS', 1.05], ['RUE AU PAIN', 1.08], ['BD DE LA PAIX', 0.95], ['RUE DU MAL JOFFRE', 1.0], ['RUE DE POISSY', 0.97]] },
  { insee: '44109', cps: ['44000', '44100', '44300'], name: 'Nantes', dept: '44', ppmA: 3900, ppmM: 4300, dep: [18000, 0.35], lat: 47.218, lon: -1.553,
    streets: [['RUE DE STRASBOURG', 1.1], ['BD DES ANGLAIS', 0.95], ['RUE PAUL BELLAMY', 1.0], ['QUAI DE VERSAILLES', 1.05], ['RUE DE COULMIERS', 1.08], ['BD GUIST HAU', 1.12]] },
  { insee: '44184', cps: ['44600'], name: 'Saint-Nazaire', dept: '44', ppmA: 2900, ppmM: 3100, dep: [12000, 0.4], lat: 47.273, lon: -2.214,
    streets: [['AV DE LA REPUBLIQUE', 1.0], ['BD DE VERDUN', 1.05], ['RUE DE PORNICHET', 0.95], ['BD PDT WILSON', 1.15]] },
  { insee: '44055', cps: ['44500'], name: 'La Baule-Escoublac', dept: '44', ppmA: 6200, ppmM: 5900, dep: [20000, 0.4], lat: 47.287, lon: -2.391,
    streets: [['AV DE LATTRE DE TASSIGNY', 1.05], ['AV DES IBIS', 0.98], ['BD DE L OCEAN', 1.2]] },
  { insee: '85194', cps: ['85100', '85180', '85340'], name: 'Les Sables-d’Olonne', dept: '85', ppmA: 4400, ppmM: 4100, dep: [18000, 0.35], lat: 46.497, lon: -1.783,
    streets: [['RUE DES HALLES', 1.0], ['PROM GEORGES CLEMENCEAU', 1.25], ['RUE NATIONALE', 0.97], ['AV ROSA BONHEUR', 0.95], ['QUAI GUINE', 1.08]] },
  { insee: '85222', cps: ['85800'], name: 'Saint-Gilles-Croix-de-Vie', dept: '85', ppmA: 4300, ppmM: 4000, dep: [16000, 0.4], lat: 46.697, lon: -1.94,
    streets: [['RUE DU GEN DE GAULLE', 1.0], ['QUAI DU PORT FIDELE', 1.1], ['AV DE LA PLAGE', 1.15], ['RUE GAUTTE', 0.95]] },
  { insee: '85191', cps: ['85000'], name: 'La Roche-sur-Yon', dept: '85', ppmA: 2200, ppmM: 2300, dep: [9000, 0.4], lat: 46.67, lon: -1.426,
    streets: [['RUE DES SABLIERS', 1.0], ['BD ARISTIDE BRIAND', 1.05], ['RUE GEORGES CLEMENCEAU', 1.02], ['PL NAPOLEON', 1.1]] },
  { insee: '49007', cps: ['49000', '49100'], name: 'Angers', dept: '49', ppmA: 3200, ppmM: 3300, dep: [11000, 0.4], lat: 47.471, lon: -0.551,
    streets: [['RUE PLANTAGENET', 1.08], ['BD FOCH', 1.05], ['RUE BRESSIGNY', 1.0], ['AV PASTEUR', 0.95], ['RUE DU MAIL', 1.04]] },
  { insee: '49099', cps: ['49300'], name: 'Cholet', dept: '49', ppmA: 1750, ppmM: 1850, dep: [8000, 0.4], lat: 47.06, lon: -0.879,
    streets: [['RUE NATIONALE', 1.0], ['BD GUSTAVE RICHARD', 1.03], ['AV DE LA LIBERATION', 0.97]] },
  { insee: '37261', cps: ['37000', '37100', '37200'], name: 'Tours', dept: '37', ppmA: 3300, ppmM: 3500, dep: [12000, 0.4], lat: 47.394, lon: 0.685,
    streets: [['RUE NATIONALE', 1.08], ['BD BERANGER', 1.06], ['RUE COLBERT', 1.0], ['BD HEURTELOUP', 1.0], ['RUE GIRAUDEAU', 0.97], ['AV DE GRAMMONT', 0.96]] },
];

const demoCache = new Map<string, DvfIndex>();

/** DVF fictive d'un département (2023-2025), seulement pour les communes de démo. */
export function demoDvf(dept: string): DvfIndex | null {
  if (demoCache.has(dept)) return demoCache.get(dept)!;
  const communes = DEMO_COMMUNES.filter((c) => c.dept === dept);
  if (!communes.length) return null;
  const mutations: DvfMutation[] = [];
  for (const c of communes) {
    const r = rng(parseInt(c.insee, 10));
    for (const year of [2023, 2024, 2025]) {
      const drift = 1 + (year - 2025) * 0.02;
      const date = () => `${year}-${String(1 + Math.floor(r() * 12)).padStart(2, '0')}-${String(1 + Math.floor(r() * 28)).padStart(2, '0')}`;
      const pos = () => ({ x: +(c.lon + gauss(r) * 0.01).toFixed(5), y: +(c.lat + gauss(r) * 0.007).toFixed(5) });
      for (let i = 0; i < 90; i++) {
        const [street, k] = c.streets[Math.floor(r() * c.streets.length)];
        const s = Math.round(18 + r() * r() * 110);
        const small = s < 30 ? 1.08 : s > 90 ? 0.93 : 1; // les petites surfaces se vendent plus cher au m²
        const ppm = c.ppmA * k * drift * small * Math.exp(gauss(r) * 0.12);
        const nd = r() < 0.35 ? 1 + Math.floor(r() * 2) : 0;
        mutations.push({ d: date(), v: Math.round((ppm * s + nd * c.dep[0] * 0.6) / 100) * 100, t: 'A', s, p: Math.max(1, Math.round(s / 22)), nd, cp: c.cps[Math.floor(r() * c.cps.length)], c: c.insee, n: String(1 + Math.floor(r() * 80)), r: street, ...pos() });
      }
      for (let i = 0; i < 30; i++) {
        const [street, k] = c.streets[Math.floor(r() * c.streets.length)];
        const s = Math.round(60 + r() * 110);
        const ppm = c.ppmM * k * drift * Math.exp(gauss(r) * 0.14);
        mutations.push({ d: date(), v: Math.round(ppm * s / 100) * 100, t: 'M', s, p: Math.round(s / 25), nd: r() < 0.5 ? 1 : 0, cp: c.cps[0], c: c.insee, n: String(1 + Math.floor(r() * 80)), r: street, ...pos() });
      }
      for (let i = 0; i < 26; i++) {
        const [street, k] = c.streets[Math.floor(r() * c.streets.length)];
        const v = c.dep[0] * Math.sqrt(k) * drift * Math.exp(gauss(r) * c.dep[1]);
        mutations.push({ d: date(), v: Math.max(1500, Math.round(v / 100) * 100), t: 'D', nd: 1, cp: c.cps[0], c: c.insee, n: String(1 + Math.floor(r() * 80)), r: street, ...pos() });
      }
    }
  }
  const idx: DvfIndex = { dept, years: [2023, 2024, 2025], builtAt: '2026-01-01', source: 'démo (fictif)', mutations };
  demoCache.set(dept, idx);
  return idx;
}

let n = 0;
const L = (type: SubLot['type'], surface?: number, extra: Partial<SubLot> = {}): SubLot => ({ id: `l${++n}`, type, surface, ...extra });
const ago = (days: number) => new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
const A = (number: string, street: string, postalCode: string, city: string, insee: string, dept: string) => ({ number, street, postalCode, city, insee, dept });

export function demoListings(): ListingInput[] {
  n = 0;
  return [
    {
      source: 'ajp', title: 'Lot de 4 – Résidence New Port : appartement 4 pièces 92 m² + garage + parking + cave', price: 525000,
      description: 'Résidence New Port, 40-42 avenue Notre-Dame. Vendu en un seul lot : appartement 4 pièces de 92 m² (3 chambres, balcon), un garage fermé en sous-sol, une place de parking extérieure et une cave. Copropriété de 64 lots, charges 3 600 €/an. DPE D. Prix global, aucune ventilation par lot. REPRODUCTION FICTIVE DU COUP NEW PORT (démo).',
      address: A('40-42', 'avenue Notre-Dame', '78100', 'Saint-Germain-en-Laye', '78551', '78'),
      surface: 92, lots: [L('appartement', 92, { rooms: 4, label: 'Appartement 4 p.' }), L('garage', undefined, { label: 'Garage fermé s/sol', resaleMonths: 2 }), L('parking', undefined, { label: 'Place extérieure' }), L('cave', undefined, { label: 'Cave' })],
      dpe: 'D', chargesAnnual: 3600, coproLots: 64, seller: 'agence', publishedAt: ago(9), travaux: 12000, demo: true,
      priceHistory: [{ date: ago(9), price: 525000, source: 'annonce' }],
    },
    {
      source: 'leboncoin', title: 'T3 58 m² avec cave et parking – Nantes Coulmiers', price: 168000,
      description: 'Particulier vend T3 de 58 m² au 2e étage, vendu avec une cave et une place de parking en sous-sol. Copropriété 24 lots, charges 1 400 €/an. DPE E. Rafraîchissement à prévoir.',
      address: A('12', 'rue de Coulmiers', '44000', 'Nantes', '44109', '44'), surface: 58,
      lots: [L('appartement', 58, { rooms: 3 }), L('cave'), L('parking')], dpe: 'E', chargesAnnual: 1400, coproLots: 24, seller: 'particulier', publishedAt: ago(21), travaux: 9000, demo: true,
    },
    {
      source: 'leboncoin', title: 'Garage fermé centre-ville Nantes', price: 12000,
      description: 'Box fermé 14 m² dans résidence sécurisée, rue Paul Bellamy. Porte basculante. Vente rapide.',
      address: A('8', 'rue Paul Bellamy', '44000', 'Nantes', '44109', '44'), lots: [L('garage', 14)], seller: 'particulier', publishedAt: ago(4), demo: true,
    },
    {
      source: 'seloger', title: 'Studio 35 m² + garage + cave – Les Sables, Halles', price: 139000,
      description: 'Appartement 2 pièces 35 m² proche des Halles, vendu avec garage et cave. Idéal investissement locatif saisonnier. DPE D. Charges 900 €/an.',
      address: A('5', 'rue des Halles', '85100', 'Les Sables-d’Olonne', '85194', '85'), surface: 35,
      lots: [L('appartement', 35, { rooms: 2 }), L('garage'), L('cave')], dpe: 'D', chargesAnnual: 900, seller: 'agence', publishedAt: ago(48), demo: true,
      priceHistory: [{ date: ago(48), price: 149000 }, { date: ago(20), price: 139000 }],
    },
    {
      source: 'pap', title: 'Lot de 3 boxes fermés – Les Sables-d’Olonne', price: 32000,
      description: 'Vends ensemble 3 garages fermés contigus dans la même copropriété, lots distincts au règlement de copropriété. Succession, vente rapide souhaitée.',
      address: A('22', 'avenue Rosa Bonheur', '85100', 'Les Sables-d’Olonne', '85194', '85'),
      lots: [L('garage', 13, { label: 'Box 1' }), L('garage', 13, { label: 'Box 2' }), L('garage', 15, { label: 'Box 3' })], seller: 'particulier', publishedAt: ago(15), demo: true,
    },
    {
      source: 'bienici', title: 'T2 42 m² vue port – Saint-Gilles-Croix-de-Vie, à rénover', price: 118000,
      description: 'T2 de 42 m² quai du Port Fidèle, vue sur le port. Entièrement à rénover (électricité, salle d’eau, isolation). DPE G. Charges 700 €/an.',
      address: A('14', 'quai du Port Fidèle', '85800', 'Saint-Gilles-Croix-de-Vie', '85222', '85'), surface: 42,
      lots: [L('appartement', 42, { rooms: 2 })], dpe: 'G', chargesAnnual: 700, seller: 'agence', publishedAt: ago(70), travaux: 28000, demo: true,
      priceHistory: [{ date: ago(70), price: 135000 }, { date: ago(35), price: 125000 }, { date: ago(10), price: 118000 }],
    },
    {
      source: 'seloger', title: 'Maison 90 m² La Roche-sur-Yon', price: 212000,
      description: 'Maison de ville 4 pièces 90 m² avec jardin. DPE D.',
      address: A('31', 'rue des Sabliers', '85000', 'La Roche-sur-Yon', '85191', '85'), surface: 90, lots: [L('maison', 90, { rooms: 4 })], dpe: 'D', seller: 'agence', publishedAt: ago(30), demo: true,
    },
    {
      source: 'seloger', title: 'T3 70 m² + parking + cave – Angers Plantagenêt', price: 175000,
      description: 'Bel appartement T3 70 m² en centre-ville, avec une place de parking en sous-sol et une cave. Copropriété 40 lots. DPE D. Baisse de prix.',
      address: A('9', 'rue Plantagenêt', '49100', 'Angers', '49007', '49'), surface: 70,
      lots: [L('appartement', 70, { rooms: 3 }), L('parking'), L('cave')], dpe: 'D', chargesAnnual: 1600, coproLots: 40, seller: 'agence', publishedAt: ago(95), travaux: 6000, demo: true,
      priceHistory: [{ date: ago(95), price: 205000 }, { date: ago(55), price: 189000 }, { date: ago(18), price: 175000 }],
    },
    {
      source: 'leboncoin', title: 'Garage Angers bd Foch', price: 15000,
      description: 'Garage fermé en sous-sol.', address: A('3', 'boulevard Foch', '49000', 'Angers', '49007', '49'), lots: [L('garage', 15)], seller: 'particulier', publishedAt: ago(12), demo: true,
    },
    {
      source: 'logicimmo', title: 'Maison 110 m² Cholet, travaux', price: 165000,
      description: 'Maison 5 pièces 110 m², travaux de rafraîchissement. DPE F.', address: A('48', 'rue Nationale', '49300', 'Cholet', '49099', '49'), surface: 110,
      lots: [L('maison', 110, { rooms: 5 })], dpe: 'F', seller: 'agence', publishedAt: ago(140), travaux: 22000, demo: true,
    },
    {
      source: 'ajp', title: 'Vente judiciaire – T2 48 m² Tours, rue Colbert (mise à prix)', price: 98000,
      description: 'Vente aux enchères sur saisie immobilière, TJ de Tours. Appartement de 48 m² 2 pièces, libre d’occupation selon PV descriptif. Mise à prix 60 000 €, prix retenu = estimation d’adjudication. Visite unique avant audience.',
      address: A('27', 'rue Colbert', '37000', 'Tours', '37261', '37'), surface: 48, lots: [L('appartement', 48, { rooms: 2 })], dpe: 'E', seller: 'justice', publishedAt: ago(25), travaux: 15000, demo: true,
    },
    {
      source: 'leboncoin', title: 'Place de parking souterraine Tours centre', price: 9500,
      description: 'Parking en sous-sol sécurisé.', address: A('10', 'boulevard Heurteloup', '37000', 'Tours', '37261', '37'), lots: [L('parking')], seller: 'particulier', publishedAt: ago(6), demo: true,
    },
    {
      source: 'seloger', title: 'T3 65 m² + garage – Saint-Nazaire bd de Verdun', price: 159000,
      description: 'T3 65 m² lumineux avec garage fermé. DPE C. Charges 1 100 €/an.', address: A('60', 'boulevard de Verdun', '44600', 'Saint-Nazaire', '44184', '44'), surface: 65,
      lots: [L('appartement', 65, { rooms: 3 }), L('garage')], dpe: 'C', chargesAnnual: 1100, seller: 'agence', publishedAt: ago(33), demo: true,
    },
    {
      source: 'bienici', title: 'Studio 30 m² Nantes bd des Anglais', price: 135000,
      description: 'Studio rénové 30 m², idéal investisseur.', address: A('101', 'boulevard des Anglais', '44100', 'Nantes', '44109', '44'), surface: 30, lots: [L('appartement', 30, { rooms: 1 })], dpe: 'D', seller: 'agence', publishedAt: ago(19), demo: true,
    },
    {
      source: 'leboncoin', title: 'Garage La Baule, proche plage', price: 21000,
      description: 'Garage fermé, avenue des Ibis.', address: A('7', 'avenue des Ibis', '44500', 'La Baule-Escoublac', '44055', '44'), lots: [L('garage', 15)], seller: 'particulier', publishedAt: ago(2), demo: true,
    },
    {
      source: 'seloger', title: 'T2 40 m² + parking La Baule', price: 259000,
      description: 'T2 40 m² avec parking, résidence avec piscine.', address: A('18', 'avenue de Lattre de Tassigny', '44500', 'La Baule-Escoublac', '44055', '44'), surface: 40,
      lots: [L('appartement', 40, { rooms: 2 }), L('parking')], dpe: 'C', seller: 'agence', publishedAt: ago(60), demo: true,
    },
    {
      source: 'leboncoin', title: 'Place de parking Saint-Germain-en-Laye centre', price: 26000,
      description: 'Parking souterrain rue de Paris.', address: A('15', 'rue de Paris', '78100', 'Saint-Germain-en-Laye', '78551', '78'), lots: [L('parking')], seller: 'particulier', publishedAt: ago(40), demo: true,
    },
    {
      source: 'logicimmo', title: 'Immeuble 2 appartements (40 + 35 m²) – Tours Giraudeau, à diviser', price: 185000,
      description: 'Petit immeuble avec deux appartements indépendants de 40 et 35 m², non soumis à copropriété : division et règlement de copropriété à créer. DPE E. Rafraîchissement.',
      address: A('41', 'rue Giraudeau', '37000', 'Tours', '37261', '37'), surface: 75,
      lots: [L('appartement', 40, { rooms: 2, label: 'Appartement RDC' }), L('appartement', 35, { rooms: 2, label: 'Appartement 1er' })], dpe: 'E', seller: 'agence', publishedAt: ago(52), travaux: 18000, needsDivision: true, demo: true,
    },
    {
      source: 'leboncoin', title: 'Cave Nantes centre', price: 6000, description: 'Cave 6 m² en sous-sol, accès sécurisé.',
      address: A('20', 'rue de Strasbourg', '44000', 'Nantes', '44109', '44'), lots: [L('cave', 6)], seller: 'particulier', publishedAt: ago(8), demo: true,
    },
    {
      source: 'seloger', title: 'Studio 28 m² Les Sables, Remblai', price: 155000,
      description: 'Studio 28 m² vue mer, promenade Clemenceau.', address: A('70', 'promenade Georges Clemenceau', '85100', 'Les Sables-d’Olonne', '85194', '85'), surface: 28,
      lots: [L('appartement', 28, { rooms: 1 })], dpe: 'E', seller: 'agence', publishedAt: ago(11), demo: true,
    },
    {
      source: 'pap', title: 'Garage Cholet', price: 6500, description: 'Garage fermé, succession.',
      address: A('12', 'boulevard Gustave Richard', '49300', 'Cholet', '49099', '49'), lots: [L('garage', 14)], seller: 'particulier', publishedAt: ago(120), demo: true,
      priceHistory: [{ date: ago(120), price: 9000 }, { date: ago(60), price: 7500 }, { date: ago(14), price: 6500 }],
    },
    {
      source: 'ajp', title: 'Adjudication – T4 82 m² + 2 parkings, Saint-Nazaire', price: 185000,
      description: 'Vente judiciaire (licitation). Appartement T4 de 82 m² occupé par un indivisaire, avec deux places de parking en sous-sol. Mise à prix 90 000 €. Prix retenu = adjudication probable.',
      address: A('9', 'boulevard Président Wilson', '44600', 'Saint-Nazaire', '44184', '44'), surface: 82,
      lots: [L('appartement', 82, { rooms: 4 }), L('parking', undefined, { label: 'Parking 1' }), L('parking', undefined, { label: 'Parking 2' })], dpe: 'D', seller: 'justice', publishedAt: ago(16), travaux: 20000, demo: true,
    },
  ];
}

/** Opérations de démo pour le Pipeline (ids d'annonce résolus au moment du seed). */
export function demoDeals(listingIdByTitle: (startsWith: string) => string | undefined): Deal[] {
  const now = new Date().toISOString().slice(0, 10);
  const signed = addMonths(now, -6);
  return [
    {
      id: 'd-newport', name: 'New Port – Saint-Germain-en-Laye (4 lots)', listingId: listingIdByTitle('Lot de 4'), company: 'immobiliere', stage: 'revente', city: 'Saint-Germain-en-Laye',
      purchasePrice: 525000, acquisitionFees: 39400, travaux: 12000, loanAmount: 450000, loanRate: 4.5, loanRepayment: 'in_fine', signedAt: signed, createdAt: addMonths(now, -8),
      lots: [
        { id: 'np1', label: 'Garage fermé', type: 'garage', plannedResale: 28000, plannedMonth: 7, status: 'sous_compromis', saleCostsPct: 0 },
        { id: 'np2', label: 'Parking extérieur', type: 'parking', plannedResale: 17000, plannedMonth: 8, status: 'en_vente' },
        { id: 'np3', label: 'Cave', type: 'cave', plannedResale: 7000, plannedMonth: 9, status: 'en_vente' },
        { id: 'np4', label: 'Appartement 92 m²', type: 'appartement', plannedResale: 650000, plannedMonth: 10, status: 'en_vente' },
      ],
      plannedGain: 0, notes: 'Démo : compromis garage signé à 30 000 € net vendeur (vente entre particuliers, sans agence). Reproduction fictive.', demo: true,
    },
    {
      id: 'd-cholet', name: 'Garage Cholet (2025)', company: 'immobiliere', stage: 'clos', city: 'Cholet', purchasePrice: 7000, acquisitionFees: 900, travaux: 300,
      loanAmount: 0, loanRate: 0, loanRepayment: 'in_fine', signedAt: addMonths(now, -14), createdAt: addMonths(now, -15),
      lots: [{ id: 'c1', label: 'Garage', type: 'garage', plannedResale: 12000, plannedMonth: 4, actualResale: 13000, soldAt: addMonths(now, -10), status: 'vendu', saleCostsPct: 0 }],
      plannedGain: 0, demo: true,
    },
    {
      id: 'd-bellamy', name: 'Garage rue Paul Bellamy – Nantes', listingId: listingIdByTitle('Garage fermé centre-ville Nantes'), company: 'immobiliere', stage: 'offre', city: 'Nantes',
      purchasePrice: 11000, acquisitionFees: 1300, travaux: 0, loanAmount: 0, loanRate: 0, loanRepayment: 'in_fine', createdAt: now,
      lots: [{ id: 'b1', label: 'Box 14 m²', type: 'garage', plannedResale: 19000, plannedMonth: 3, status: 'a_vendre' }], plannedGain: 0, notes: 'Offre à 11 000 € envoyée.', demo: true,
    },
    {
      id: 'd-boxes', name: '3 boxes – Les Sables (Rosa Bonheur)', listingId: listingIdByTitle('Lot de 3 boxes'), company: 'immobiliere', stage: 'visite', city: 'Les Sables-d’Olonne',
      purchasePrice: 31000, acquisitionFees: 2800, travaux: 1500, loanAmount: 0, loanRate: 0, loanRepayment: 'in_fine', createdAt: now,
      lots: [
        { id: 'x1', label: 'Box 1', type: 'garage', plannedResale: 18000, plannedMonth: 3, status: 'a_vendre' },
        { id: 'x2', label: 'Box 2', type: 'garage', plannedResale: 18000, plannedMonth: 4, status: 'a_vendre' },
        { id: 'x3', label: 'Box 3', type: 'garage', plannedResale: 19000, plannedMonth: 5, status: 'a_vendre' },
      ], plannedGain: 0, demo: true,
    },
  ];
}
