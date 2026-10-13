// Opérations du pipeline : création depuis une annonce, indicateurs (cash engagé, gains prévus / réalisés).
import type { Analysis, Deal, DealLot, Listing, Settings } from './types';
import { LOT_LABELS } from './defaults';
import { cashNeed } from './scoring';
import { uid } from './util';

export const ACTIVE_STAGES = ['signe', 'revente'] as const;
export const STAGES = ['repere', 'visite', 'offre', 'signe', 'revente', 'clos'] as const;

export function dealFromListing(l: Listing, a: Analysis, s: Settings): Deal {
  const financed = cashNeed(l, s, a.costs.acquisitionFees, a.costs.travaux).financed;
  return {
    id: uid('d'),
    name: `${l.title.slice(0, 60)} – ${l.address.city}`,
    listingId: l.id,
    company: 'immobiliere',
    stage: 'repere',
    city: l.address.city,
    purchasePrice: l.price,
    acquisitionFees: a.costs.acquisitionFees,
    travaux: a.costs.travaux + a.costs.division,
    loanAmount: financed ? Math.round(l.price * (1 - s.financing.apportPct / 100)) : 0,
    loanRate: financed ? s.financing.rate : 0,
    loanRepayment: 'prorata',
    createdAt: new Date().toISOString().slice(0, 10),
    lots: l.lots.map((lot, i) => ({
      id: uid('dl'),
      label: lot.label || `${LOT_LABELS[lot.type]}${lot.surface ? ' ' + lot.surface + ' m²' : ''}`,
      type: lot.type,
      plannedResale: a.lots[i].mid,
      plannedMonth: (lot.resaleMonths ?? s.resaleMonths[lot.type] ?? 6) + (l.needsDivision ? 3 : 0),
      status: 'a_vendre',
    })),
  };
}

export const lotNet = (l: DealLot, s: Settings, actual = true) =>
  (actual && l.actualResale != null ? l.actualResale : l.plannedResale) * (1 - (l.saleCostsPct ?? s.fees.agenceRevPct) / 100);

export interface DealMetrics {
  cost: number; // prix + frais + travaux
  equity: number; // apport (cost − emprunt)
  interest: number; // intérêts estimés sur la durée prévue
  plannedRevenue: number;
  plannedGain: number;
  soldRevenue: number;
  realizedGain: number | null; // seulement une fois tous les lots vendus
  cashEngaged: number; // cash actuellement immobilisé
  loanOutstanding: number;
  progress: number; // part des lots vendus (en valeur)
}

export function loanShare(d: Deal, lot: DealLot) {
  const tot = d.lots.reduce((a, x) => a + x.plannedResale, 0) || 1;
  return (d.loanAmount * lot.plannedResale) / tot;
}

export function dealMetrics(d: Deal, s: Settings): DealMetrics {
  const cost = d.purchasePrice + d.acquisitionFees + d.travaux;
  const equity = cost - d.loanAmount;
  const months = Math.max(1, ...d.lots.map((l) => l.plannedMonth));
  const interest = (d.loanAmount * d.loanRate * months * (d.loanRepayment === 'in_fine' ? 1 : 0.6)) / 100 / 12;
  const plannedRevenue = d.lots.reduce((a, l) => a + lotNet(l, s, false), 0);
  const expectedRevenue = d.lots.reduce((a, l) => a + lotNet(l, s, true), 0);
  const sold = d.lots.filter((l) => l.status === 'vendu');
  const soldRevenue = sold.reduce((a, l) => a + lotNet(l, s, true), 0);
  const allSold = d.lots.length > 0 && d.lots.every((l) => l.status === 'vendu' || l.status === 'conserve');
  let repaid = d.loanRepayment === 'prorata' ? sold.reduce((a, l) => a + loanShare(d, l), 0) : allSold ? d.loanAmount : 0;
  repaid = Math.min(repaid, d.loanAmount);
  const engagedStage = d.stage === 'signe' || d.stage === 'revente';
  const tot = d.lots.reduce((a, x) => a + x.plannedResale, 0) || 1;
  return {
    cost, equity, interest, plannedRevenue,
    plannedGain: d.plannedGain ?? plannedRevenue - cost - interest,
    soldRevenue,
    realizedGain: d.stage === 'clos' || allSold ? expectedRevenue - cost - interest : null,
    cashEngaged: engagedStage ? equity - (soldRevenue - repaid) : 0,
    loanOutstanding: engagedStage ? d.loanAmount - repaid : 0,
    progress: sold.reduce((a, l) => a + l.plannedResale, 0) / tot,
  };
}
