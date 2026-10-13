// Matrices stratégiques du groupe et recommandation d'allocation de la trésorerie.
import type { Activity, Settings } from './types';

export const BCG_GROWTH_THRESHOLD = 6; // % de croissance du marché
export const BCG_SHARE_THRESHOLD = 1; // part de marché relative

export type Quadrant = 'etoile' | 'vache' | 'dilemme' | 'poids_mort';
export const QUADRANT_LABELS: Record<Quadrant, string> = { etoile: 'Étoile', vache: 'Vache à lait', dilemme: 'Point d’interrogation', poids_mort: 'Poids mort' };
export const QUADRANT_ADVICE: Record<Quadrant, string> = {
  etoile: 'Investir : c’est le moteur de croissance, il consomme du cash mais en rapporte vite.',
  vache: 'Rentabiliser : peu d’investissement, le cash dégagé finance les étoiles.',
  dilemme: 'Tester à petit budget, fixer un critère de go / no-go à 6-12 mois.',
  poids_mort: 'Maintenir sans investir, ou céder / arrêter si le capital immobilisé rapporte peu.',
};

export function quadrant(a: Activity): Quadrant {
  const g = a.marketGrowth >= BCG_GROWTH_THRESHOLD, s = a.relativeShare >= BCG_SHARE_THRESHOLD;
  return g && s ? 'etoile' : g ? 'dilemme' : s ? 'vache' : 'poids_mort';
}

export const netResult = (a: Activity) => (a.revenue * a.margin) / 100;
export const returnOnCapital = (a: Activity) => (a.capital > 0 ? netResult(a) / a.capital : Infinity);

/** Recommandation d'allocation du cash disponible entre réserve, fonds de roulement récurrent et A/R. */
export function recommendAllocation(s: Settings) {
  const cash = s.treasury.startCash;
  const acts = s.group.activities;
  const rev = (id: string) => acts.find((a) => a.id === id)?.revenue ?? 0;
  const reserve = s.treasury.reserveSecurite;
  // un mois de chiffre d'affaires des activités récurrentes à immobilisation (LCD, coloc, conciergerie)
  const bfrRecurrent = Math.round((rev('lcd') + rev('coloc') + rev('conciergerie')) / 12 / 500) * 500;
  // provision renouvellement mobilier / remise en état LCD : ~8 % du CA annuel
  const lcd = Math.round((rev('lcd') * 0.08) / 500) * 500;
  const ar = Math.max(0, cash - reserve - bfrRecurrent - lcd);
  return {
    reserve, bfrRecurrent, lcd, ar,
    why: [
      `Réserve de sécurité ${reserve.toLocaleString('fr-FR')} € : environ 3 mois de charges fixes du groupe et un aléa travaux ; jamais engagée dans un coup.`,
      `Fonds de roulement des activités récurrentes ${bfrRecurrent.toLocaleString('fr-FR')} € : 1 mois de chiffre d’affaires LCD + colocation + conciergerie (vacance, ménage, impayés).`,
      `Provision LCD ${lcd.toLocaleString('fr-FR')} € : renouvellement du mobilier et remise en état (~8 % du CA LCD).`,
      `Reste pour l’achat-revente ${ar.toLocaleString('fr-FR')} € : l’activité la plus rentable par euro immobilisé, mais à rotation rapide (petits lots, garages, lots groupés finançables).`,
    ],
  };
}

export function porterIntensity(s: Settings) {
  const f = s.group.porter;
  return f.reduce((a, x) => a + x.score, 0) / (f.length || 1);
}
