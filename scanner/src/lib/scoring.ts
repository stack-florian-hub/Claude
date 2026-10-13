// Score d'anomalie : Σ valeurs des lots séparés vs prix affiché. Voir ARCHITECTURE.md §4.
import type { Analysis, CostBreakdown, Listing, LotValuation, Range, Settings, Zone } from './types';
import type { DvfSource } from './dvf-query';
import { valueLot } from './providers/valuation';
import { clamp, daysBetween, normCity, round } from './util';
import { detectSpecial } from './detect';

export function zoneFor(l: Listing, zones: Zone[]): Zone | undefined {
  const c = normCity(l.address.city);
  return zones.find(
    (z) => z.active && (z.postalCodes.includes(l.address.postalCode) || (l.address.insee && z.communes.includes(l.address.insee)) || z.communes.some((x) => normCity(x) === c)),
  );
}

export const acquisitionPct = (s: Settings) => (s.fees.useMdbRegime ? s.fees.notaireMdbPct : s.fees.notaireDroitCommunPct) / 100;

export function lotMonths(l: Listing, s: Settings) {
  return Math.max(...l.lots.map((x) => x.resaleMonths ?? s.resaleMonths[x.type] ?? 6), 1);
}

/** Coûts du scénario moyen (le portage dépend du délai de revente le plus long). */
function costs(l: Listing, s: Settings, resaleTotal: number, months: number): CostBreakdown {
  const acquisitionFees = round(l.price * acquisitionPct(s), 10);
  const travaux = (l.travaux || 0) + l.lots.reduce((a, x) => a + (x.travaux || 0), 0);
  const resaleAgency = round(resaleTotal * (s.fees.agenceRevPct / 100), 10);
  const diagnostics = l.lots.length * s.fees.diagnosticsParLot;
  const division = l.needsDivision ? Math.max(1, l.lots.length - 1) * s.fees.divisionParLot : 0;
  const chargesM = l.chargesAnnual ? l.chargesAnnual / 12 : s.fees.chargesMensuellesDefaut;
  const tfM = (s.fees.taxeFonciereAnnuelleParLot * l.lots.filter((x) => !['cave', 'parking'].includes(x.type)).length) / 12;
  const interestM = cashNeed(l, s, acquisitionFees, travaux).financed ? (l.price * (1 - s.financing.apportPct / 100) * s.financing.rate) / 100 / 12 : 0;
  const carrying = round(months * (chargesM + tfM + interestM), 10);
  return { acquisitionFees, travaux, resaleAgency, diagnostics, division, carrying, total: acquisitionFees + travaux + resaleAgency + diagnostics + division + carrying };
}

export function cashNeed(l: Listing, s: Settings, fees: number, travaux: number) {
  const comptant = l.price + fees + travaux;
  if (comptant <= s.budget.cash || !s.financing.enabled) return { cash: comptant, financed: false };
  return { cash: l.price * (s.financing.apportPct / 100) + fees + travaux, financed: true };
}

/** Valeur de revente de chaque lot (seule étape qui demande la DVF). */
export function valueLots(input: Listing, s: Settings, zones: Zone[], dvf: DvfSource): LotValuation[] {
  const zone = zoneFor(input, zones);
  const zoneInsee = zone?.communes.find((c) => /^\d{5}$/.test(c) && normCity(input.address.city) !== '');
  const l: Listing = input.address.insee || /^\d{5}$/.test(input.address.postalCode) || !zoneInsee ? input : { ...input, address: { ...input.address, insee: zoneInsee } };
  const tension = zone?.tension ?? 2;
  return l.lots.map((lot) => valueLot({ listing: l, lot, settings: s, tension, dvf }));
}

export function analyze(input: Listing, s: Settings, zones: Zone[], dvf: DvfSource): Analysis {
  return aggregate(input, valueLots(input, s, zones, dvf), s, zones);
}

/** Coûts, gains, score et alertes à partir des valeurs de lots (sans DVF : rejouable dans le navigateur). */
export function aggregate(input: Listing, lotsIn: LotValuation[], s: Settings, zones: Zone[]): Analysis {
  let lots = lotsIn;
  const zone = zoneFor(input, zones);
  // adresse sans code postal ni INSEE (avant géocodage) : commune déduite de la zone
  const zoneInsee = zone?.communes.find((c) => /^\d{5}$/.test(c) && normCity(input.address.city) !== '' );
  const l: Listing = input.address.insee || /^\d{5}$/.test(input.address.postalCode) || !zoneInsee ? input : { ...input, address: { ...input.address, insee: zoneInsee } };
  const tension = zone?.tension ?? 2;
  // vendu loué : décote sur le logement occupé
  const specials = detectSpecial(`${l.title}\n${l.description}`);
  if (specials.some((x) => x.id === 'loue')) lots = lots.map((v) => (['appartement', 'maison'].includes(v.type) && v.source !== 'force' ? { ...v, low: round(v.low * 0.85), mid: round(v.mid * 0.87), high: round(v.high * 0.9), note: [v.note, 'Décote bien loué (−13 %)'].filter(Boolean).join(' · ') } : v));
  const total: Range = { low: 0, mid: 0, high: 0 };
  for (const v of lots) {
    total.low += v.low;
    total.mid += v.mid;
    total.high += v.high;
  }
  const months = lotMonths(l, s);
  const c = costs(l, s, total.mid, months);
  const fixed = c.acquisitionFees + c.travaux + c.diagnostics + c.division + c.carrying;
  const agency = s.fees.agenceRevPct / 100;
  const gainOf = (v: number) => round(v * (1 - agency) - l.price - fixed, 10);
  const gain = { low: gainOf(total.low), mid: gainOf(total.mid), high: gainOf(total.high) };
  const gainPct = l.price > 0 ? gain.mid / l.price : 0;
  const ratio = l.price > 0 ? (total.mid - c.total) / l.price : 0;

  // confiance pondérée par la valeur de chaque lot
  const confidence = total.mid > 0 ? lots.reduce((a, v) => a + v.confidence * v.mid, 0) / total.mid : 0;

  const signals: string[] = [];
  const warnings: string[] = [];
  let sig = 0;
  if (l.lots.length > 1) {
    signals.push(`Lot groupé (${l.lots.length} lots revendables séparément)`);
    sig += 4;
  }
  const first = l.priceHistory[0]?.price;
  if (first && first > l.price) {
    const drop = 1 - l.price / first;
    if (drop >= 0.03) {
      signals.push(`Baisse de prix de ${Math.round(drop * 100)} % (${l.priceHistory.length - 1} baisse${l.priceHistory.length > 2 ? 's' : ''})`);
      sig += drop >= 0.1 ? 3 : 2;
    }
  }
  if (l.seller === 'justice') {
    signals.push('Vente judiciaire / enchères');
    sig += 3;
  }
  if (l.seller === 'particulier') sig += 1;

  const age = l.publishedAt ? daysBetween(l.publishedAt) : 0;
  if (age > 60) {
    signals.push(`En ligne depuis ${age} jours (vendeur à relancer)`);
    sig += 2;
  }
  if (/succession|urgent|rapide|mutation|divorce|liquidation/i.test(l.description)) {
    signals.push('Vendeur pressé (mots-clés de la description)');
    sig += 2;
  }

  if (!zone) warnings.push('Hors zones paramétrées (tension supposée moyenne)');
  if (l.dpe === 'G' || l.dpe === 'F') warnings.push(`DPE ${l.dpe} : décote à la revente, location interdite ${l.dpe === 'G' ? 'depuis 2025' : 'en 2028'}`);
  if (l.coproProcedure) warnings.push('Copropriété en difficulté / procédure');
  if (l.needsDivision) warnings.push('Division à créer (modificatif EDD / géomètre / règlement de copro) : délai +2 à 4 mois');
  if (l.seller === 'justice') warnings.push('Vente judiciaire : pas de condition suspensive, surenchère 10 jours, vérifier l’occupation');
  for (const v of lots) {
    if (v.source === 'defaut') warnings.push(`${v.type} : valeur par défaut (pas de vente DVF exploitable)`);
    if (v.source === 'dvf-dept') warnings.push(`${v.type} : comparables à l’échelle du département seulement`);
  }
  if (lots.some((v) => v.mid === 0)) warnings.push('Au moins un lot sans valeur');

  const cn = cashNeed(l, s, c.acquisitionFees, c.travaux);
  if (cn.cash > s.budget.cash) warnings.push(`Cash nécessaire ${Math.round(cn.cash / 1000)} k€ > trésorerie ${Math.round(s.budget.cash / 1000)} k€`);

  const liquidity = (tension / 3) * 6 + (l.lots.some((x) => ['garage', 'parking', 'cave'].includes(x.type)) || l.price < 150000 ? 4 : 1);
  let score = clamp(gainPct / 0.4, 0, 1) * 35 + clamp(gain.mid / 100000, 0, 1) * 35 + confidence * 10 + Math.min(10, sig) + Math.min(10, liquidity);
  if (gain.mid <= 0) score = Math.min(score, 15);
  // une estimation fragile ne doit pas remonter en tête
  score *= 0.4 + 0.6 * Math.min(1, confidence / 0.5);
  if (confidence < 0.3) score = Math.min(score, 30);
  for (const sp of specials) warnings.unshift(sp.label);
  const blocking = specials.some((x) => x.blocking);
  if (blocking) score = Math.min(score, 20);
  // pas d'alerte sur une estimation trop fragile (comparables départementaux, valeurs par défaut…)
  // maison / terrain : valeur d'ensemble (bâti + terrain au €/m² DVF), pas une revente par lots de copropriété
  const strategy: Analysis['strategy'] = l.lots.every((x) => x.type === 'maison' || x.type === 'terrain') ? 'global' : 'lots';
  if (strategy === 'global') warnings.unshift('Maison : estimation globale (bâti + terrain au €/m² DVF des maisons voisines), sans valeur séparée du terrain ni revente par lots. Hors stratégie lots de copropriété : pas d’alerte');
  const flagged = strategy === 'lots' && !blocking && confidence >= 0.3 && gain.mid > 0 && (gain.mid > s.thresholds.minGain || gainPct > s.thresholds.minGainPct / 100);
  if (confidence < 0.3 && gain.mid > 0) warnings.push('Confiance trop faible pour une alerte : compléter l’adresse ou forcer la valeur des lots');

  // Prix plafond (offre ou enchère maximale) : gain(prix) = Σ×(1−agence) − prix×(1+frais%) − coûts fixes hors frais d'acquisition
  const netResale = total.mid * (1 - agency) - (c.travaux + c.diagnostics + c.division + c.carrying);
  const fp = acquisitionPct(s);
  const breakEven = Math.max(0, round(netResale / (1 + fp), 500));
  const forMinGain = Math.max(0, round((netResale - s.thresholds.minGain) / (1 + fp), 500));
  const forMinPct = Math.max(0, round(netResale / (1 + fp + s.thresholds.minGainPct / 100), 500));
  const priceCaps = { breakEven, forMinGain, forMinPct, max: Math.max(forMinGain, forMinPct) };

  return {
    listingId: l.id, lots, total, costs: c, priceCaps, strategy, gain, gainPct, ratio, ecart: total.mid - l.price, score: Math.round(score),
    confidence, flagged, signals, warnings, cashNeeded: Math.round(cn.cash), resaleMonths: months,
  };
}
