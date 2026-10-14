// Century 21 : listes par département (/annonces/f/achat/d-85_vendee/page-N/), autorisées par robots.txt
// (seuls /annonces/achat/cp-… et /a/*/… sont interdits, vérifié le 13/10/2026). Fiche détaillée lue pour les appartements.
import type { ListingInput, LotType } from '../types';
import { parseListingText } from '../detect';
import { DEPT_SLUGS, get, htmlToText, num, type CollectLog, type CollectResult } from './http';

const BASE = 'https://www.century21.fr';
const TYPE: [RegExp, LotType][] = [[/^appartement/i, 'appartement'], [/^maison|^propri[ée]t[ée]/i, 'maison'], [/^parking|^garage|^box/i, 'garage'], [/^immeuble/i, 'maison'], [/^local|^commerce|^bureau/i, 'local']];
const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase()).replace(/\b(Sur|De|Du|Des|La|Le|Les|En|Et|Sous)\b/g, (w) => w.toLowerCase());

export interface C21Card { id: string; url: string; label: string; type?: LotType; city: string; dept: string; price: number; surface?: number; rooms?: number; excerpt: string }

export function parseC21Page(html: string, dept: string): C21Card[] {
  const out: C21Card[] = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(/href="(\/trouver_logement\/detail\/(\d+)\/)"\s+aria-label="([^"]+)"/g)) {
    if (seen.has(m[2])) continue;
    seen.add(m[2]);
    const start = html.lastIndexOf('<', m.index!);
    const text = htmlToText(html.slice(start, start + 7000)).split('\n').slice(0, 30).join('\n');
    const label = m[3].replace(/&nbsp;/g, ' ');
    const type = TYPE.find(([re]) => re.test(label))?.[1];
    const city = label.replace(/^.*? à vendre\s*/i, '').trim();
    const price = num(text.match(/(\d[\d\s  ]{2,10})\s*€/)?.[1]) ?? 0;
    const sm = text.match(/(\d{1,4}(?:[,.]\d+)?)\s*m\s*\n?\s*2/);
    const surface = sm ? Math.round(parseFloat(sm[1].replace(',', '.')) * 10) / 10 : undefined;
    const rooms = num(text.match(/(\d{1,2})\s*pi[eè]ces?/)?.[1]);
    const excerpt = text.split('\n').filter((l) => l.length > 60).join(' ');
    out.push({ id: m[2], url: BASE + m[1], label, type, city: titleCase(city), dept, price, surface, rooms, excerpt });
  }
  return out;
}

export function c21ToInput(c: C21Card, detail?: string): ListingInput | null {
  if (!c.type || !c.price) return null;
  const text = `${c.label}${c.surface ? ` ${c.surface} m²` : ''}${c.rooms ? ` ${c.rooms} pièces` : ''}\n${c.city}\nPrix : ${c.price} €\n${detail || c.excerpt}`;
  const p = parseListingText(text, c.url);
  const { parseNotes: _n, ...rest } = p;
  const lots = p.lots.length && p.lots[0].type === c.type ? p.lots : [{ id: `l${c.id}`, type: c.type, surface: c.surface }];
  return {
    ...rest,
    title: `${c.label}${c.surface ? ` – ${c.surface} m²` : ''}`,
    source: 'reseau', network: 'century21', sourceRef: c.id, url: c.url, price: c.price, seller: 'agence',
    surface: c.surface ?? p.surface,
    // la fiche cite l'adresse de l'agence, pas celle du bien : commune seulement (valorisation prudente à l'échelle de la commune)
    address: { postalCode: '', city: c.city, dept: c.dept },
    lots,
  };
}

const DETAIL = new Set<LotType>(['appartement', 'garage', 'local']);

export async function collectCentury21(opts: { depts: string[]; log?: CollectLog; maxPages?: number; cache: Map<string, string> }): Promise<CollectResult> {
  const { depts, log = () => {}, maxPages = 60, cache } = opts;
  const inputs: ListingInput[] = [];
  const errors: string[] = [];
  let pages = 0, cards = 0, details = 0;
  for (const d of depts) {
    const slug = DEPT_SLUGS[d]?.c21;
    if (!slug) continue;
    const all: C21Card[] = [];
    for (let page = 1; page <= maxPages; page++) {
      let html: string;
      try {
        html = await get(`${BASE}/annonces/f/achat/${slug}/${page > 1 ? `page-${page}/` : ''}`);
      } catch (e) {
        errors.push((e as Error).message);
        break;
      }
      pages++;
      const cs = parseC21Page(html, d).filter((c) => !all.some((x) => x.id === c.id));
      if (!cs.length) break;
      all.push(...cs);
    }
    cards += all.length;
    for (const c of all) {
      let detail = c.type && DETAIL.has(c.type) ? cache.get(c.id) : undefined;
      if (c.type && DETAIL.has(c.type) && detail == null) {
        try {
          const t = htmlToText(await get(c.url));
          const i = t.search(/\n(?:Description|Descriptif)/i);
          detail = (i >= 0 ? t.slice(i, i + 5000) : t.slice(0, 5000)).replace(/ m\n2\b/g, ' m²');
          cache.set(c.id, detail);
          details++;
        } catch (e) {
          errors.push((e as Error).message);
        }
      }
      const input = c21ToInput(c, detail);
      if (input) inputs.push(input);
    }
    log(`  Century 21 ${d} : ${all.length} biens, ${inputs.filter((i) => i.address.dept === d).length} retenus`);
  }
  return { network: 'century21', label: 'Century 21', pages, cards, inputs, details, errors };
}
