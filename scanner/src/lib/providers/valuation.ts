// ValuationProvider : qui dit combien vaut un lot revendu séparément.
// Chaîne par ordre de priorité : valeur forcée → connecteurs pro (si activés) → DVF → valeurs par défaut.
import type { Listing, LotValuation, PricePoint, Range, Settings, SubLot } from '../types';
import type { DvfSource } from '../dvf-query';
import { valueLotFromDvf } from '../dvf-query';
import { round } from '../util';

export interface ValuationContext {
  listing: Listing;
  lot: SubLot;
  settings: Settings;
  tension: 1 | 2 | 3;
  dvf: DvfSource;
}

export interface ValuationProvider {
  id: string;
  label: string;
  description: string;
  enabled(s: Settings): boolean;
  valueLot(ctx: ValuationContext): LotValuation | null;
}

const ForcedProvider: ValuationProvider = {
  id: 'force', label: 'Valeur saisie', description: 'Valeur de revente forcée sur le lot (offre reçue, estimation d’agent).',
  enabled: () => true,
  valueLot: ({ lot }) =>
    lot.resaleOverride
      ? { lotId: lot.id, type: lot.type, low: round(lot.resaleOverride * 0.95), mid: lot.resaleOverride, high: round(lot.resaleOverride * 1.05), source: 'force', n: 0, confidence: 0.9, comparables: [] }
      : null,
};

/** Connecteur Castorus premium (non branché) : historique des prix affichés et annonces retirées. */
export const CastorusProvider: ValuationProvider & { priceHistory(l: Listing): Promise<PricePoint[]> } = {
  id: 'castorus', label: 'Castorus (premium)', description: 'Historique des prix affichés, baisses successives, annonces retirées. Abonnement requis ; à brancher quand un accès existe.',
  enabled: (s) => s.connectors.castorus.enabled && !!s.connectors.castorus.apiKey,
  valueLot: () => null, // Castorus ne donne pas de valeur de revente : il alimente priceHistory
  async priceHistory() {
    throw new Error('Connecteur Castorus non configuré (Paramètres → Connecteurs). En attendant, saisir les baisses de prix dans la fiche.');
  },
};

/** Connecteur MeilleursAgents (non branché). */
export const MeilleursAgentsProvider: ValuationProvider = {
  id: 'meilleursagents', label: 'MeilleursAgents (pro)', description: 'Estimation à l’adresse. Accès pro requis ; à brancher plus tard. En attendant : saisir l’estimation dans « Estimation externe » de la fiche.',
  enabled: (s) => s.connectors.meilleursAgents.enabled && !!s.connectors.meilleursAgents.apiKey,
  valueLot: () => null,
};

const DvfProvider: ValuationProvider = {
  id: 'dvf', label: 'DVF (data.gouv.fr)', description: 'Ventes réelles : même rue, puis commune, puis département.',
  enabled: () => true,
  valueLot: ({ listing, lot, settings, tension, dvf }) => {
    const d = settings.defaults[tension] as unknown as Record<string, Range>;
    return valueLotFromDvf(lot, listing, dvf.slice(listing.address), settings, d[lot.type]);
  },
};

const DefaultProvider: ValuationProvider = {
  id: 'defaut', label: 'Valeurs par défaut', description: 'Fourchettes garage / parking / cave selon la tension de la zone.',
  enabled: () => true,
  valueLot: ({ lot, settings, tension }) => {
    const d = (settings.defaults[tension] as unknown as Record<string, Range>)[lot.type];
    if (!d) return null;
    return { lotId: lot.id, type: lot.type, ...d, source: 'defaut', n: 0, confidence: 0.15, comparables: [], note: `Valeur par défaut (zone de tension ${tension})` };
  },
};

export const VALUATION_PROVIDERS: ValuationProvider[] = [ForcedProvider, CastorusProvider, MeilleursAgentsProvider, DvfProvider, DefaultProvider];

export function valueLot(ctx: ValuationContext): LotValuation {
  for (const p of VALUATION_PROVIDERS) {
    if (!p.enabled(ctx.settings)) continue;
    const v = p.valueLot(ctx);
    if (v) return v;
  }
  return { lotId: ctx.lot.id, type: ctx.lot.type, low: 0, mid: 0, high: 0, source: 'defaut', n: 0, confidence: 0, comparables: [], note: 'Aucune donnée : charger la DVF du département ou saisir une valeur' };
}
