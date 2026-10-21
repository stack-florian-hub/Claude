// Immonot (annonces des offices notariaux). robots.txt : tout autorisé sauf /api, /account… (vérifié le 13/10/2026).
// Les pages département contiennent chaque annonce en JSON-LD (nom, description complète, prix, office) : pas de fiche à ouvrir.
import type { ListingInput, LotType } from '../types';
import { parseListingText } from '../detect';
import { DEPT_SLUGS, get, decodeEntities, type CollectLog, type CollectResult } from './http';

const BASE = 'https://www.immonot.com/immobilier-notaire/annonces/';

interface Product { name?: string; description?: string; url?: string; sku?: string; offers?: { price?: string | number; seller?: { name?: string } } }

export function products(html: string): Product[] {
  const out: Product[] = [];
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const j = JSON.parse(m[1]);
      const roots = Array.isArray(j) ? j : j['@graph'] ? j['@graph'] : [j];
      for (const node of roots) {
        const list = node['@type'] === 'ItemList' ? node : node.mainEntity?.['@type'] === 'ItemList' ? node.mainEntity : null;
        const items = list?.itemListElement ?? [];
        for (const it of items || []) if (it?.item?.['@type'] === 'Product') out.push(it.item);
      }
    } catch {
      /* bloc non JSON */
    }
  }
  return out;
}

const TYPE: [RegExp, LotType][] = [[/^appartement/i, 'appartement'], [/^maison|^propri[ée]t[ée]|^villa/i, 'maison'], [/^garage|^parking|^box/i, 'garage'], [/^immeuble/i, 'maison'], [/^local|^commerce|^bureau/i, 'local']];
const SKIP = /^(terrain|bien agricole|for[êe]t|[ée]tang|viager|fonds|domaine)/i;

export function productToInput(p: Product, dept: string): ListingInput | null {
  const name = decodeEntities(p.name || '');
  if (!/en vente/i.test(name) || SKIP.test(name)) return null;
  const m = name.match(/^(.+?) en vente (.+?) \((\d{5})\)/i);
  const type = TYPE.find(([re]) => re.test(name))?.[1];
  const price = Number(p.offers?.price);
  if (!m || !type || !price) return null;
  const desc = decodeEntities(p.description || '');
  const parsed = parseListingText(`${name}\n${m[3]} ${m[2]}\nPrix : ${price} €\n${desc}`, p.url);
  const { parseNotes: _n, ...rest } = parsed;
  const lots = parsed.lots.length && parsed.lots[0].type === type ? parsed.lots : [{ id: `l${p.sku}`, type, surface: parsed.surface }, ...parsed.lots.filter((l) => l.type !== type && l.type !== 'maison' && l.type !== 'appartement' && type !== 'maison')]; // un seul logement : la description peut dire « maison » pour un bien classé appartement
  return {
    ...rest,
    title: name.replace(/ en vente /i, ' à vendre – '),
    source: 'notaires', network: 'immonot', sourceRef: p.sku, url: p.url, price,
    agency: p.offers?.seller?.name, seller: 'notaire',
    address: { ...parsed.address, postalCode: m[3], city: m[2], dept },
    lots,
  };
}

/** « Fonds et/ou murs commerciaux » : seuls les murs (immobilier) sont gardés, les fonds de commerce seuls sont écartés. */
export function productToProInput(p: Product, dept: string): ListingInput | null {
  const name = decodeEntities(p.name || '');
  const m = name.match(/^(.+?) en vente (.+?) \((\d{5})\)/i);
  const price = Number(p.offers?.price);
  const desc = decodeEntities(p.description || '').replace(/fonds et\/ou murs commerciaux/gi, '');
  if (!m || !price) return null;
  const murs = /\bmurs\b|local|entrep[ôo]t|b[âa]timent|hangar|atelier|bureaux?|immeuble|surface de \d/i.test(desc);
  if (!murs || (/fonds de commerce|droit au bail|cession de (?:fonds|bail)|pas[- ]de[- ]porte|chiffre d'affaires|\bCA\b|reprise (?:du bail|de l'activit)/i.test(desc) && !/\bmurs\b/i.test(desc))) return null;
  const parsed = parseListingText(`${name}\n${m[3]} ${m[2]}\nPrix : ${price} €\n${desc}`, p.url);
  const { parseNotes: _n, ...rest } = parsed;
  const type = /entrep[ôo]t|local d'activit|locaux d'activit|hangar|atelier|stockage|b[âa]timent (?:industriel|d'activit)/i.test(desc) ? 'entrepot' : 'local';
  return {
    ...rest,
    title: `${type === 'entrepot' ? 'Local d’activité / entrepôt' : 'Murs commerciaux'} à vendre – ${m[2]} (${m[3]})`,
    source: 'notaires', network: 'immonot', sourceRef: p.sku, url: p.url, price,
    agency: p.offers?.seller?.name, seller: 'notaire',
    address: { ...parsed.address, postalCode: m[3], city: m[2], dept },
    lots: [{ id: `l${p.sku}`, type, surface: parsed.surface }],
  };
}

export async function collectImmonot(opts: { depts: string[]; log?: CollectLog; maxPages?: number }): Promise<CollectResult> {
  const { depts, log = () => {}, maxPages = 40 } = opts;
  const inputs: ListingInput[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  let pages = 0, cards = 0;
  for (const d of depts) {
    const slug = DEPT_SLUGS[d]?.immonot;
    if (!slug) continue;
    let n = 0;
    for (let page = 1; page <= maxPages; page++) {
      let html: string;
      try {
        html = await get(`${BASE}${slug}.html${page > 1 ? `?page=${page}` : ''}`);
      } catch (e) {
        errors.push((e as Error).message);
        break;
      }
      pages++;
      const ps = products(html).filter((p) => p.url && !seen.has(p.url));
      if (!ps.length) break;
      for (const p of ps) {
        seen.add(p.url!);
        cards++;
        const i = productToInput(p, d);
        if (i) { inputs.push(i); n++; }
      }
    }
    log(`  Immonot ${d} : ${n} annonces (hors terrains, biens agricoles, viagers)`);
    // murs commerciaux et locaux d'activité (onglet Entrepôts)
    const [code, name] = slug.split('/');
    // la liste générale contient aussi ces annonces (écartées comme « fonds ») : suivi séparé
    const seenPro = new Set<string>();
    let np = 0;
    for (let page = 1; page <= 10; page++) {
      let html: string;
      try {
        html = await get(`${BASE}${code}/achat-fonds-et-ou-murs-commerciaux-${name}.html${page > 1 ? `?page=${page}` : ''}`);
      } catch (e) {
        if (!/404/.test((e as Error).message)) errors.push((e as Error).message);
        break;
      }
      pages++;
      const ps = products(html).filter((p) => p.url && !seenPro.has(p.url));
      if (!ps.length) break;
      for (const p of ps) {
        seenPro.add(p.url!);
        cards++;
        const i = productToProInput(p, d);
        if (i) { inputs.push(i); np++; }
      }
    }
    log(`  Immonot ${d} : ${np} murs commerciaux / locaux (fonds de commerce seuls écartés)`);
  }
  return { network: 'immonot', label: 'Immonot (notaires)', pages, cards, inputs, details: 0, errors };
}
