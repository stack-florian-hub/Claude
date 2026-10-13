// Statistiques DVF partagées (scripts, fiche, valorisation).
import type { DvfMutation } from './types';
import { quantile } from './util';

export function quantiles(values: number[], ps: number[]) {
  const v = values.filter((x) => isFinite(x)).sort((a, b) => a - b);
  return { n: v.length, q: ps.map((p) => (v.length ? quantile(v, p) : NaN)) };
}

/**
 * Valeur implicite d'UNE dépendance vendue avec un appartement :
 * (prix de la vente groupée − surface × €/m² médian des appartements vendus seuls de taille comparable).
 * Ne garde que les ventes avec exactement une dépendance ; écarte les valeurs aberrantes.
 */
export function impliedDependency(m: DvfMutation[], ps = [0.25, 0.5, 0.75]) {
  const alone = m.filter((x) => x.t === 'A' && x.nd === 0 && x.s && x.s >= 9 && x.v / x.s > 300 && x.v / x.s < 20000);
  if (alone.length < 15) return { n: 0, q: ps.map(() => NaN) };
  // €/m² médian par tranche de surface (les petites surfaces se vendent plus cher au m²)
  const bands = [0, 30, 50, 70, 90, 1e9];
  const med = bands.slice(0, -1).map((lo, i) => {
    const v = alone.filter((x) => x.s! >= lo && x.s! < bands[i + 1]).map((x) => x.v / x.s!).sort((a, b) => a - b);
    return v.length >= 5 ? quantile(v, 0.5) : NaN;
  });
  const all = alone.map((x) => x.v / x.s!).sort((a, b) => a - b);
  const global = quantile(all, 0.5);
  const ppmFor = (s: number) => {
    const i = bands.findIndex((lo, j) => s >= lo && s < bands[j + 1]);
    return isFinite(med[i]) ? med[i] : global;
  };
  const implied = m
    .filter((x) => x.t === 'A' && x.nd === 1 && x.s && x.s >= 9)
    .map((x) => x.v - x.s! * ppmFor(x.s!))
    .filter((v) => v > -50000 && v < 150000);
  return quantiles(implied, ps);
}
