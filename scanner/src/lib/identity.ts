// Rapprochement d'annonces : même bien vu deux fois (re-collage, autre site). Pur, utilisable côté navigateur.
import type { Listing, ListingInput } from './types';

/** Même bien ? même URL, ou même code postal + même type principal + surface à ±3 % + prix à ±25 %. */
export function findSameProperty(all: Listing[], i: ListingInput): Listing | undefined {
  const host = (u?: string) => { try { return u ? new URL(u).host : ''; } catch { return ''; } };
  if (i.url) {
    const byUrl = all.find((l) => l.url === i.url || l.alsoOn?.some((o) => o.url === i.url));
    if (byUrl) return byUrl;
  }
  // deux annonces différentes du même site sont deux biens différents : rapprochement approximatif seulement entre sites
  const sameSite = (l: Listing) => !!i.url && !!l.url && host(i.url) === host(l.url);
  const main = (x: { lots: { type: string; surface?: number }[]; surface?: number }) => ({ type: x.lots[0]?.type, surface: x.lots[0]?.surface ?? x.surface });
  const mi = main(i);
  return all.find((l) => {
    if (sameSite(l) || l.address.postalCode !== i.address.postalCode || !i.address.postalCode || !i.price || !l.price) return false;
    const ml = main(l);
    if (ml.type !== mi.type || l.lots.length !== i.lots.length) return false;
    const priceClose = Math.abs(l.price - i.price) / l.price <= 0.25;
    if (ml.surface && mi.surface) return Math.abs(ml.surface - mi.surface) / ml.surface <= 0.03 && priceClose;
    return l.title === i.title && priceClose;
  });
}

