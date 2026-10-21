// BureauxLocaux : entrepôts et locaux d'activité à vendre, listes départementales
// (/immobilier-d-entreprise/annonces/loire-atlantique-44/vente-entrepots[/page/N]) autorisées par robots.txt
// (vérifié le 21/10/2026 : seuls alertes, PDF, statistiques et favoris sont interdits). Les cartes portent titre,
// adresse précise, description complète et prix : pas besoin d'ouvrir les fiches.
import type { ListingInput } from '../types';
import { parseListingText } from '../detect';
import { decodeEntities, get, htmlToText, num, type CollectLog, type CollectResult } from './http';

const BASE = 'https://www.bureauxlocaux.com';
const SLUGS: Record<string, string> = { '44': 'loire-atlantique-44', '85': 'vendee-85', '49': 'maine-et-loire-49', '37': 'indre-et-loire-37', '41': 'loir-et-cher-41', '72': 'sarthe-72', '53': 'mayenne-53', '86': 'vienne-86' };

export interface BlCard { id: string; url: string; title: string; address: string; description: string; price: number }

export function parseBlPage(html: string): BlCard[] {
  const out: BlCard[] = [];
  const starts = [...html.matchAll(/<div class="listing__card" data-gtm-listing_id="(\d+)"/g)];
  starts.forEach((m, i) => {
    const block = html.slice(m.index!, starts[i + 1]?.index ?? m.index! + 20000);
    const href = block.match(/href="(\/annonce\/[^"]+)"/)?.[1];
    const title = decodeEntities(block.match(/<h2[^>]*>([\s\S]*?)<\/h2>/)?.[1] ?? '').trim();
    const address = htmlToText(block.match(/svg_icon-cursor2"><\/use><\/svg>([\s\S]*?)<\/div>/)?.[1] ?? '').trim();
    const description = htmlToText(block.match(/<div class="description">([\s\S]*?)<div class="lazyload-placeholder"/)?.[1] ?? '');
    const priceTxt = htmlToText(block.match(/<div class="price">([\s\S]*?)<\/a>/)?.[1] ?? '');
    const price = num(priceTxt.match(/(\d[\d\s  ]{2,12})\s*€/)?.[1]) ?? 0;
    if (href) out.push({ id: m[1], url: BASE + href, title, address, description, price });
  });
  return out;
}

export function blToInput(c: BlCard, dept: string): ListingInput | null {
  if (!c.price) return null; // prix sur demande
  const text = `${c.title}\n${c.address}\n${c.description}`;
  const p = parseListingText(text, c.url);
  const { parseNotes: _n, ...rest } = p;
  // la rubrique est « entrepôts / locaux d'activité » : local commercial seulement si le titre le dit
  const type = /bureau|commerce|boutique/i.test(c.title) ? 'local' : 'entrepot';
  // prix hors taxes avec TVA applicable : ramené au TTC pour le comparer aux valeurs DVF
  const vat = /TVA applicable|assujetti à la TVA|TVA en sus|\+ ?TVA/i.test(c.description);
  const price = vat ? Math.round(c.price * 1.2) : c.price;
  const surface = num(c.title.match(/(\d[\d\s ]*)\s*m²/)?.[1]) ?? p.surface;
  return {
    ...rest,
    title: c.title.replace(/^Vente /, '') + (c.address ? ` – ${c.address.split(',').pop()!.trim()}` : ''),
    source: 'reseau', network: 'bureauxlocaux', sourceRef: c.id, url: c.url, price, seller: 'agence',
    surface, description: (vat ? `Prix HT ${c.price.toLocaleString('fr-FR')} € + TVA 20 % : comparé TTC. ` : '') + c.description,
    address: { ...p.address, dept: p.address.postalCode.startsWith(dept) ? dept : p.address.dept || dept },
    lots: [{ id: `l${c.id}`, type, surface }],
  };
}

export async function collectBureauxLocaux(opts: { depts: string[]; log?: CollectLog; maxPages?: number }): Promise<CollectResult> {
  const { depts, log = () => {}, maxPages = 20 } = opts;
  const inputs: ListingInput[] = [];
  const errors: string[] = [];
  let pages = 0, cards = 0;
  for (const d of depts) {
    const slug = SLUGS[d];
    if (!slug) continue;
    const seen = new Set<string>();
    let n = 0;
    for (let page = 1; page <= maxPages; page++) {
      let html: string;
      try {
        html = await get(`${BASE}/immobilier-d-entreprise/annonces/${slug}/vente-entrepots${page > 1 ? `/page/${page}` : ''}`, 1200);
      } catch (e) {
        if (!/404/.test((e as Error).message)) errors.push((e as Error).message);
        break;
      }
      pages++;
      const cs = parseBlPage(html).filter((c) => !seen.has(c.id));
      if (!cs.length) break;
      for (const c of cs) {
        seen.add(c.id);
        cards++;
        const input = blToInput(c, d);
        if (input) { inputs.push(input); n++; }
      }
      if (!html.includes(`/vente-entrepots/page/${page + 1}"`)) break;
    }
    log(`  BureauxLocaux ${d} : ${seen.size} annonces, ${n} avec prix`);
  }
  return { network: 'bureauxlocaux', label: 'BureauxLocaux', pages, cards, inputs, details: 0, errors };
}
