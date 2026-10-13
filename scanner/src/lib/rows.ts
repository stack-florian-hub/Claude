// Lignes compactes de la liste d'opportunités (partagées entre l'appli locale et l'artefact).
import type { Analysis, Listing } from './types';
import type { OppRow } from '@/components/OpportunitiesTable';
import { daysBetween } from './util';
import { NETWORK_BY_ID } from './networks';

export function toOppRow(l: Listing, a: Analysis, zone: string | undefined, tension: number): OppRow {
  return {
    id: l.id, title: l.title, url: l.url, source: l.source, network: l.network, networkName: l.network ? NETWORK_BY_ID[l.network]?.name : undefined, agency: l.agency,
    seller: l.seller, city: l.address.city, cp: l.address.postalCode, dept: l.address.dept, zone, tension,
    lots: l.lots.map((x) => ({ type: x.type, surface: x.surface })), price: l.price, low: a.total.low, mid: a.total.mid, high: a.total.high, ecart: a.ecart,
    gain: a.gain.mid, gainLow: a.gain.low, gainHigh: a.gain.high, gainPct: a.gainPct, ratio: a.ratio, score: a.score, confidence: a.confidence, flagged: a.flagged,
    cash: a.cashNeeded, priceMax: a.priceCaps.max, age: l.publishedAt ? daysBetween(l.publishedAt) : 0, status: l.status, signals: a.signals, warnings: a.warnings, dpe: l.dpe,
    drop: l.priceHistory[0] ? 1 - l.price / l.priceHistory[0].price : 0, demo: l.demo, offMarket: !!l.offMarketAt, strategy: a.strategy,
  };
}
