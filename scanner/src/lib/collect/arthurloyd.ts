// Arthur Loyd : entrepôts et locaux d'activité à vendre. Les offres sont listées par le plan de site
// (/sitemap-offer.xml, déclaré dans robots.txt ; les pages de recherche à paramètres sont interdites et ne sont pas utilisées).
// Prix souvent « sur demande » mais donné au m² hors droits (HD) dans le tableau des surfaces : prix = surface × €/m².
import type { ListingInput } from '../types';
import { parseListingText } from '../detect';
import { get, htmlToText, num, type CollectLog, type CollectResult } from './http';

const BASE = 'https://www.arthur-loyd.com';
const REGIONS: Record<string, string> = { '44': 'pays-de-la-loire', '85': 'pays-de-la-loire', '49': 'pays-de-la-loire', '53': 'pays-de-la-loire', '72': 'pays-de-la-loire', '37': 'centre-val-de-loire', '41': 'centre-val-de-loire' };

export interface AlOffer { url: string; ref: string; title: string; city: string; cp: string; price: number; priceFrom: 'affiche' | 'm2'; surface?: number; description: string; vat: boolean }

const n2 = (s?: string) => (s ? parseFloat(s.replace(/[\s  ]/g, '').replace(',', '.')) || undefined : undefined);

export function parseAlOffer(html: string, url: string): AlOffer | null {
  const t = htmlToText(html);
  const title = htmlToText(html.match(/<h1[^>]*offer-header__title[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? '');
  const addr = htmlToText(html.match(/offer-header__address[^>]*>([\s\S]*?)<a /)?.[1] ?? '').replace(/–\s*$/, '').trim();
  const loc = addr.match(/^(.*?)\s+(\d{5})/);
  if (!title || !loc) return null;
  // en-tête de l'offre : « Référence : … / titre / VILLE CP – / prix / surface »
  const i = Math.max(0, t.indexOf('Référence :'));
  const head = t.slice(i, i + 500);
  const surface = num(head.match(/(\d[\d\s ]*)\s*m²/)?.[1]);
  let price = num(head.match(/(\d[\d\s  ]{2,12})\s*€(?!\s*\/)/)?.[1]) ?? 0;
  let priceFrom: AlOffer['priceFrom'] = 'affiche';
  if (!price && surface) {
    const ppm = n2(t.match(/(\d[\d\s ]*(?:,\d+)?)\s*(?:€\s*)?HD\s*\/\s*m²/)?.[1]);
    if (ppm && ppm > 50 && ppm < 20000) { price = Math.round((ppm * surface) / 100) * 100; priceFrom = 'm2'; }
  }
  const d0 = t.indexOf('\nDescription\n'), d1 = t.indexOf('Toutes les surfaces disponibles');
  const description = d0 >= 0 ? t.slice(d0 + 13, d1 > d0 ? d1 : d0 + 4000).replace(/Demander plus d'informations au conseiller\n?/, '').slice(0, 4000) : '';
  return { url, ref: url.match(/ref-([\w-]+)$/)?.[1] ?? url, title, city: loc[1].replace(/\b\w/g, (x) => x.toUpperCase()).replace(/\B\w+/g, (x) => x.toLowerCase()), cp: loc[2], price, priceFrom, surface, description, vat: /\bTVA\b/.test(t.slice(d1 > 0 ? d1 : 0, (d1 > 0 ? d1 : 0) + 1500)) };
}

export function alToInput(o: AlOffer): ListingInput | null {
  if (!o.price) return null;
  // neuf vendu HT (TVA en sus) : prix ramené au TTC pour le comparer aux valeurs DVF, qui incluent la TVA
  const price = o.vat ? Math.round(o.price * 1.2) : o.price;
  const notes = [o.priceFrom === 'm2' ? `Prix sur demande : estimé à surface × €/m² hors droits affiché (${o.price.toLocaleString('fr-FR')} €)` : '', o.vat ? 'Prix HT + TVA 20 % (vente soumise à TVA, frais de notaire réduits) : comparé TTC' : ''].filter(Boolean);
  const text = `${o.title}\n${o.cp} ${o.city}\nPrix : ${price} €\n${o.description}`;
  const p = parseListingText(text, o.url);
  const { parseNotes: _n, ...rest } = p;
  const type = /bureaux?\b|commerc/i.test(o.title) && !/activit|entrep|stockage|atelier|industri/i.test(o.title) ? 'local' : 'entrepot';
  return {
    ...rest,
    title: `${o.title.replace(/\s+/g, ' ').trim()} – ${o.city}`,
    description: [notes.join('. '), o.description].filter(Boolean).join('\n'),
    source: 'reseau', network: 'arthurloyd', sourceRef: o.ref, url: o.url, price, seller: 'agence', agency: 'Arthur Loyd',
    surface: o.surface ?? p.surface,
    address: { postalCode: o.cp, city: o.city, dept: o.cp.slice(0, 2) },
    lots: [{ id: `l${o.ref}`, type, surface: o.surface ?? p.surface }],
  };
}

export async function collectArthurLoyd(opts: { depts: string[]; log?: CollectLog; cache: Map<string, string> }): Promise<CollectResult> {
  const { depts, log = () => {}, cache } = opts;
  const inputs: ListingInput[] = [];
  const errors: string[] = [];
  const regions = [...new Set(depts.map((d) => REGIONS[d]).filter(Boolean))];
  let xml = '';
  try {
    xml = await get(`${BASE}/sitemap-offer.xml`, 1200);
  } catch (e) {
    return { network: 'arthurloyd', label: 'Arthur Loyd', pages: 0, cards: 0, inputs, details: 0, errors: [(e as Error).message] };
  }
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])
    .filter((u) => regions.some((r) => u.includes(`/locaux-activite-entrepots-vente/${r}/`)))
    // centre-val-de-loire : seulement les départements suivis (le slug contient le nom du département)
    .filter((u) => !u.includes('/centre-val-de-loire/') || depts.some((d) => (d === '37' && u.includes('/indre-et-loire')) || (d === '41' && u.includes('/loir-et-cher'))));
  let details = 0;
  for (const u of urls) {
    let html = cache.get(u.split('/').pop()!);
    if (html == null) {
      try {
        html = await get(u, 1200);
        details++;
      } catch (e) {
        if (!/404|410/.test((e as Error).message)) errors.push((e as Error).message);
        continue;
      }
    }
    const o = parseAlOffer(html, u);
    if (!o) continue;
    // fiche gardée en cache (texte utile seulement) : l'offre ne change pas de semaine en semaine
    cache.set(u.split('/').pop()!, html.length > 300000 ? html.slice(0, 300000) : html);
    if (!depts.includes(o.cp.slice(0, 2))) continue;
    const input = alToInput(o);
    if (input) inputs.push(input);
  }
  log(`  Arthur Loyd : ${urls.length} offres dans les régions suivies, ${inputs.length} retenues avec prix (${details} fiches lues)`);
  return { network: 'arthurloyd', label: 'Arthur Loyd', pages: urls.length, cards: urls.length, inputs, details, errors };
}
