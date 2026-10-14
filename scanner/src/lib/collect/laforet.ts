// Laforêt : listes par département et par type (/departement/achat-appartement-vendee?page=N), autorisées par robots.txt
// (seuls /acheter/rechercher?*, /*?slug et les PDF sont interdits, vérifié le 13/10/2026). Fiche lue pour les appartements.
import type { ListingInput, LotType } from '../types';
import { parseListingText } from '../detect';
import { DEPT_SLUGS, get, htmlToText, type CollectLog, type CollectResult } from './http';

const BASE = 'https://www.laforet.com';
const TYPES: [string, LotType][] = [['appartement', 'appartement'], ['maison', 'maison'], ['immeuble', 'maison'], ['parking', 'garage']];

export interface LaforetCard { id: string; url: string; type: LotType; label: string; city: string; cp?: string; price: number; surface?: number; rooms?: number; land?: number }

const f = (s?: string) => (s ? parseFloat(s.replace(/[\s  ]/g, '').replace(',', '.')) || undefined : undefined);

export function parseLaforetPage(html: string, type: LotType): LaforetCard[] {
  const out: LaforetCard[] = [];
  const seen = new Set<string>();
  const linkRe = /href="(https:\/\/www\.laforet\.com\/agence-immobiliere\/[a-z0-9-]+\/acheter\/([a-z0-9-]+)\/[a-z0-9-]+-(\d{6,}))"/g;
  const links = [...html.matchAll(linkRe)].map((m) => ({ i: m.index!, url: m[1], citySlug: m[2], id: m[3] }));
  // chaque carte porte son libellé dans data-gtm-click-vignette-param, suivi du prix, de la ville, du code postal et de la surface
  for (const v of html.matchAll(/data-gtm-click-vignette-param="([^"]+)"/g)) {
    const link = [...links].reverse().find((l) => l.i < v.index!) ?? links.find((l) => l.i > v.index!);
    if (!link || seen.has(link.id)) continue;
    const tagEnd = html.indexOf('>', v.index!);
    const text = htmlToText(html.slice(tagEnd + 1, tagEnd + 2500)).split('\n').slice(0, 12).join('\n');
    const price = f(text.match(/(\d[\d\s\u00a0\u202f]{2,10})\s*€/)?.[1]) ?? 0;
    if (!price) continue;
    seen.add(link.id);
    const loc = text.match(/([A-ZÀ-Ý][A-ZÀ-Ý' -]+)\s*\n?\s*\((\d{5})\)/);
    out.push({
      id: link.id, url: link.url, type, label: v[1], price,
      city: loc ? loc[1].trim() : link.citySlug.replace(/-/g, ' '), cp: loc?.[2],
      surface: f(text.match(/(\d{1,4}(?:[,.]\d+)?)\s*m²/)?.[1]),
      rooms: f(text.match(/(\d{1,2})\s*pi[eè]ces?/)?.[1]),
      land: f(text.match(/terrain\s*:\s*(\d[\d\s]*)\s*m²/i)?.[1]),
    });
  }
  return out;
}

export function laforetToInput(c: LaforetCard, dept: string, detail?: string): ListingInput {
  const text = `${c.label || c.type}${c.surface ? ` ${c.surface} m²` : ''}${c.rooms ? ` ${c.rooms} pièces` : ''}\n${c.cp ?? ''} ${c.city}\nPrix : ${c.price} €\n${detail ?? ''}`;
  const p = parseListingText(text, c.url);
  const { parseNotes: _n, ...rest } = p;
  const lots = p.lots.length && p.lots[0].type === c.type ? p.lots : [{ id: `l${c.id}`, type: c.type, surface: c.surface }];
  return {
    ...rest,
    title: `${(c.label || c.type).replace(/ à vendre$/i, '')} à vendre${c.surface ? ` – ${c.surface} m²` : ''}`,
    source: 'reseau', network: 'laforet', sourceRef: c.id, url: c.url, price: c.price, seller: 'agence',
    surface: c.surface ?? p.surface, landSurface: c.land ?? p.landSurface,
    agency: `Laforêt ${c.url.split('/agence-immobiliere/')[1]?.split('/')[0] ?? ''}`.trim(),
    address: { ...p.address, postalCode: c.cp ?? '', city: c.city.replace(/\b\w/g, (x) => x.toUpperCase()).replace(/\B\w+/g, (x) => x.toLowerCase()), dept },
    lots,
  };
}

export async function collectLaforet(opts: { depts: string[]; log?: CollectLog; maxPages?: number; cache: Map<string, string> }): Promise<CollectResult> {
  const { depts, log = () => {}, maxPages = 30, cache } = opts;
  const inputs: ListingInput[] = [];
  const errors: string[] = [];
  let pages = 0, cards = 0, details = 0;
  for (const d of depts) {
    const slug = DEPT_SLUGS[d]?.laforet;
    if (!slug) continue;
    let n = 0;
    for (const [kind, type] of TYPES) {
      const seen = new Set<string>();
      for (let page = 1; page <= maxPages; page++) {
        let html: string;
        try {
          html = await get(`${BASE}/departement/achat-${kind}-${slug}${page > 1 ? `?page=${page}` : ''}`);
        } catch (e) {
          if (!/404/.test((e as Error).message)) errors.push((e as Error).message);
          break;
        }
        pages++;
        const cs = parseLaforetPage(html, type).filter((c) => !seen.has(c.id));
        if (!cs.length) break;
        for (const c of cs) {
          seen.add(c.id);
          cards++;
          let detail = type === 'appartement' ? cache.get(c.id) : undefined;
          if (type === 'appartement' && detail == null) {
            try {
              const t = htmlToText(await get(c.url));
              const i = t.search(/\n(?:Description|Descriptif|Le bien)/i);
              detail = i >= 0 ? t.slice(i, i + 5000) : t.slice(0, 5000);
              cache.set(c.id, detail);
              details++;
            } catch (e) {
              errors.push((e as Error).message);
            }
          }
          inputs.push(laforetToInput(c, d, detail));
          n++;
        }
      }
    }
    log(`  Laforêt ${d} : ${n} biens`);
  }
  return { network: 'laforet', label: 'Laforêt', pages, cards, inputs, details, errors };
}
