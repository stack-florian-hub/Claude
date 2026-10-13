// Simulation achat-revente (A/R) mois par mois, du point de vue du cash de la société.
import type { Analysis, Listing, Settings } from './types';
import { acquisitionPct } from './scoring';

export interface SimLot { label: string; resale: number; month: number; saleCostsPct: number }
export interface SimInput {
  price: number;
  acquisitionFees: number;
  travaux: number;
  travauxMonth: number;
  loanAmount: number;
  loanRate: number; // % annuel
  loanRepayment: 'prorata' | 'in_fine';
  chargesMonthly: number; // charges copro + taxe foncière + assurance
  diagnostics?: number;
  division?: number;
  lots: SimLot[];
}
export interface SimRow { m: number; achat: number; emprunt: number; travaux: number; portage: number; interets: number; ventes: number; remboursement: number; impots: number; net: number; cumul: number }
export interface SimResult {
  rows: SimRow[];
  duration: number;
  peakCash: number; // besoin en fonds de roulement maximal
  revenue: number; // ventes nettes de frais
  grossGain: number; // avant impôt
  tva: number;
  tax: number;
  netGain: number;
  irr: number; // TRI annualisé sur fonds propres
  moic: number; // multiple sur fonds propres
  roiAnnual: number; // gain net / pic de cash, annualisé
  rotation: { parallel: number; perYear: number; annualGain: number };
}

export function isTax(profit: number, s: Settings) {
  if (profit <= 0) return 0;
  const cap = s.tax.isReducedCap;
  return Math.min(profit, cap) * (s.tax.isReducedRate / 100) + Math.max(0, profit - cap) * (s.tax.isRate / 100);
}

export function irr(flows: number[], periodsPerYear = 12): number {
  const npv = (r: number) => flows.reduce((a, f, i) => a + f / Math.pow(1 + r, i), 0);
  let lo = -0.99, hi = 5;
  if (npv(lo) * npv(hi) > 0) return NaN;
  for (let k = 0; k < 200; k++) {
    const mid = (lo + hi) / 2;
    if (npv(lo) * npv(mid) <= 0) hi = mid;
    else lo = mid;
  }
  return Math.pow(1 + (lo + hi) / 2, periodsPerYear) - 1;
}

export function simulate(inp: SimInput, s: Settings, budget = s.budget.cash - s.budget.reserve): SimResult {
  const duration = Math.max(1, ...inp.lots.map((l) => l.month));
  const totalResale = inp.lots.reduce((a, l) => a + l.resale, 0) || 1;
  const rows: SimRow[] = [];
  let outstanding = inp.loanAmount;
  let cumul = 0;
  let revenue = 0, charges = 0, interests = 0;
  const lastSaleMonth = duration;
  for (let m = 0; m <= duration; m++) {
    const r: SimRow = { m, achat: 0, emprunt: 0, travaux: 0, portage: 0, interets: 0, ventes: 0, remboursement: 0, impots: 0, net: 0, cumul: 0 };
    if (m === 0) {
      r.achat = -(inp.price + inp.acquisitionFees);
      r.emprunt = inp.loanAmount;
    }
    if (m === Math.min(inp.travauxMonth, duration)) r.travaux = -(inp.travaux + (inp.division || 0));
    if (m > 0) {
      r.portage = -inp.chargesMonthly;
      r.interets = -(outstanding * inp.loanRate) / 100 / 12;
      charges += inp.chargesMonthly;
      interests -= r.interets;
    }
    const sold = inp.lots.filter((l) => l.month === m);
    for (const l of sold) {
      const net = l.resale * (1 - l.saleCostsPct / 100) - (inp.diagnostics || 0) / inp.lots.length;
      r.ventes += net;
      revenue += net;
      if (inp.loanRepayment === 'prorata') {
        const rep = Math.min(outstanding, (inp.loanAmount * l.resale) / totalResale);
        r.remboursement -= rep;
        outstanding -= rep;
      }
    }
    if (m === lastSaleMonth && outstanding > 0) {
      r.remboursement -= outstanding;
      outstanding = 0;
    }
    rows.push(r);
  }
  const grossBeforeTva = revenue - inp.price - inp.acquisitionFees - inp.travaux - (inp.division || 0) - charges - interests;
  const tva = s.tax.tvaSurMarge ? Math.max(0, (totalResale - inp.price) * (20 / 120)) : 0;
  const grossGain = grossBeforeTva - tva;
  const tax = isTax(grossGain, s);
  rows[rows.length - 1].impots = -(tva + tax);
  for (const r of rows) {
    r.net = r.achat + r.emprunt + r.travaux + r.portage + r.interets + r.ventes + r.remboursement + r.impots;
    cumul += r.net;
    r.cumul = cumul;
  }
  const peakCash = Math.max(0, -Math.min(0, ...rows.map((r) => r.cumul)));
  const flows = rows.map((r) => r.net);
  const out = flows.filter((f) => f < 0).reduce((a, f) => a - f, 0);
  const inflow = flows.filter((f) => f > 0).reduce((a, f) => a + f, 0);
  const netGain = grossGain - tax;
  const parallel = peakCash > 0 ? Math.floor(budget / peakCash) : 0;
  const perYear = (parallel * 12) / duration;
  return {
    rows, duration, peakCash, revenue, grossGain, tva, tax, netGain,
    irr: irr(flows), moic: out > 0 ? inflow / out : NaN,
    roiAnnual: peakCash > 0 ? (netGain / peakCash) * (12 / duration) : NaN,
    rotation: { parallel, perYear, annualGain: perYear * netGain },
  };
}

/** Pré-remplissage du simulateur à partir d'une annonce analysée. */
export function simInputFromAnalysis(l: Listing, a: Analysis, s: Settings): SimInput {
  const financed = l.price + a.costs.acquisitionFees + a.costs.travaux > s.budget.cash && s.financing.enabled;
  const chargesM = (l.chargesAnnual ? l.chargesAnnual / 12 : s.fees.chargesMensuellesDefaut) + (s.fees.taxeFonciereAnnuelleParLot * l.lots.length) / 12;
  return {
    price: l.price,
    acquisitionFees: Math.round(l.price * acquisitionPct(s)),
    travaux: a.costs.travaux,
    travauxMonth: 1,
    loanAmount: financed ? Math.round(l.price * (1 - s.financing.apportPct / 100)) : 0,
    loanRate: s.financing.rate,
    loanRepayment: 'prorata',
    chargesMonthly: Math.round(chargesM),
    diagnostics: a.costs.diagnostics,
    division: a.costs.division,
    lots: l.lots.map((lot, i) => ({
      label: lot.label || `${lot.type}${lot.surface ? ' ' + lot.surface + ' m²' : ''}`,
      resale: a.lots[i].mid,
      month: (lot.resaleMonths ?? s.resaleMonths[lot.type] ?? 6) + (l.needsDivision ? 3 : 0),
      saleCostsPct: s.fees.agenceRevPct,
    })),
  };
}
