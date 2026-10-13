// Trajectoire de trésorerie : cash de départ + épargne récurrente + opérations du pipeline + nouveaux coups simulés.
import type { Deal, Scenario, Settings } from './types';
import { dealMetrics, loanShare, lotNet } from './deals';
import { addMonths } from './util';

export interface Inflow { key: string; deal: string; lot: string; month: number; date: string; gross: number; net: number; repayment: number; status: string }

function monthIndex(fromIso: string, toIso: string) {
  const a = new Date(fromIso), b = new Date(toIso);
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

/** Ventes de lots à venir des opérations signées, avec le remboursement d'emprunt associé. */
export function upcomingInflows(deals: Deal[], s: Settings, today: string, includeOffers = false): Inflow[] {
  const out: Inflow[] = [];
  for (const d of deals) {
    const active = d.stage === 'signe' || d.stage === 'revente';
    const offer = includeOffers && d.stage === 'offre';
    if (!active && !offer) continue;
    const start = active ? d.signedAt || today : addMonths(today, 1);
    const unsold = d.lots.filter((l) => l.status !== 'vendu' && l.status !== 'conserve');
    const lastMonth = Math.max(...unsold.map((l) => l.plannedMonth));
    for (const l of unsold) {
      let m = monthIndex(today, addMonths(start, l.plannedMonth));
      if (m < 1) m = 1; // vente en retard : reportée au mois prochain
      const gross = l.actualResale ?? l.plannedResale;
      const net = lotNet(l, s);
      const remaining = d.loanAmount - (d.loanRepayment === 'prorata' ? d.lots.filter((x) => x.status === 'vendu').reduce((a, x) => a + loanShare(d, x), 0) : 0);
      const repayment = d.loanRepayment === 'prorata' ? loanShare(d, l) : l.plannedMonth === lastMonth && l === unsold.find((x) => x.plannedMonth === lastMonth) ? remaining : 0;
      out.push({ key: `${d.id}:${l.id}`, deal: d.name, lot: l.label, month: m, date: addMonths(today, m), gross, net, repayment, status: l.status });
    }
  }
  return out.sort((a, b) => a.month - b.month);
}

export interface Projection {
  labels: string[];
  cash: number[];
  engaged: number[];
  launched: number;
  gains: number;
  minCash: number;
  endCash: number;
}

export function project(opts: {
  s: Settings; deals: Deal[]; months: number; scenario?: Scenario | null; exclude?: Set<string>; includeOffers?: boolean; today?: string;
}): Projection {
  const { s, deals, months, scenario, exclude = new Set(), includeOffers = false } = opts;
  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  const t = s.treasury;
  const flows = new Array(months + 1).fill(0);
  const engagedDelta = new Array(months + 1).fill(0);

  // opérations en cours : ventes à venir, intérêts tant que l'emprunt court
  const inflows = upcomingInflows(deals, s, today, includeOffers);
  for (const f of inflows) {
    if (exclude.has(f.key) || f.month > months) continue;
    flows[f.month] += f.net - f.repayment;
  }
  for (const d of deals) {
    const active = d.stage === 'signe' || d.stage === 'revente';
    const offer = includeOffers && d.stage === 'offre';
    if (!active && !offer) continue;
    const m = dealMetrics(d, s);
    if (offer) {
      flows[1] -= m.equity;
      engagedDelta[1] += m.equity;
    }
    const outstanding = offer ? d.loanAmount : m.loanOutstanding;
    const mine = inflows.filter((f) => f.key.startsWith(d.id + ':'));
    const end = Math.max(1, ...mine.map((f) => f.month));
    for (let k = 1; k <= Math.min(end, months); k++) flows[k] -= (outstanding * d.loanRate) / 100 / 12;
    const engagedNow = offer ? 0 : m.cashEngaged;
    engagedDelta[0] += engagedNow;
    for (const f of mine) if (f.month <= months) engagedDelta[f.month] -= ((offer ? m.equity : engagedNow) * f.gross) / (mine.reduce((a, x) => a + x.gross, 0) || 1);
  }
  for (const e of t.events) if (e.month >= 0 && e.month <= months) flows[e.month] += e.amount;

  const cash: number[] = [];
  const engaged: number[] = [];
  let c = t.startCash, eng = 0, launched = 0, gains = 0, lastLaunch = -99;
  const pending: { at: number; amount: number }[] = [];
  for (let m = 0; m <= months; m++) {
    if (m > 0) c += t.monthlySavings * (scenario?.recurringFactor ?? 1);
    c += flows[m];
    eng += engagedDelta[m];
    // nouveaux coups simulés
    if (scenario && scenario.dealsPerYear > 0) {
      for (const p of pending.filter((x) => x.at === m)) {
        c += p.amount;
        eng -= scenario.cashPerDeal;
        gains += scenario.avgGainPerDeal;
      }
      const gap = 12 / scenario.dealsPerYear;
      while (m - lastLaunch >= gap - 1e-9 && c - scenario.cashPerDeal >= t.reserveSecurite && m + scenario.monthsPerDeal <= months + 6) {
        c -= scenario.cashPerDeal;
        eng += scenario.cashPerDeal;
        pending.push({ at: m + scenario.monthsPerDeal, amount: scenario.cashPerDeal + scenario.avgGainPerDeal });
        launched++;
        lastLaunch = m;
      }
    }
    cash.push(Math.round(c));
    engaged.push(Math.max(0, Math.round(eng)));
  }
  const labels = cash.map((_, m) => {
    const d = new Date(addMonths(today, m));
    return d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
  });
  return { labels, cash, engaged, launched, gains, minCash: Math.min(...cash), endCash: cash[cash.length - 1] };
}

/** Capacité : nombre de coups finançables en parallèle avec le cash libre. */
export function parallelCapacity(cash: number, reserve: number, bfr: number, cashPerDeal: number) {
  return cashPerDeal > 0 ? Math.max(0, Math.floor((cash - reserve - bfr) / cashPerDeal)) : 0;
}
