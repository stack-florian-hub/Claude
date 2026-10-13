// Connecteur AJP Immobilier (www.ajp-immobilier.com) : robots.txt sans restriction (vérifié le 13/10/2026).
// Parcours poli : 1 requête toutes les ~0,8 s, cache local des fiches, identifiant de navigateur explicite.
// 1. plan du site « acheter avec AJP » → agences des départements suivis
// 2. page de chaque agence → cartes (type, prix, ville, surface) de tous ses biens en vente
// 3. fiche détaillée seulement pour les biens où un lot groupé est possible (le prix est relu à chaque passage sur la carte)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { ListingInput, LotType } from '../types';
import { parseListingText } from '../detect';

const BASE = 'https://www.ajp-immobilier.com';
const UA = 'Mozilla/5.0 (compatible; scanner-mdb/1.0; usage personnel, 1 req/s)';

export interface AjpCard { url: string; id: string; type: string; city: string; dept: string; price: number; surface?: number; land?: number; agencyUrl: string }

export interface CollectLog { (msg: string): void }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function htmlToText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<svg[\s\S]*?<\/svg>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&#039;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&euro;/g, '€')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .split('\n').map((l) => l.trim()).filter(Boolean).join('\n');
}

let last = 0;
async function get(url: string, delayMs: number): Promise<string> {
  const wait = last + delayMs - Date.now();
  if (wait > 0) await sleep(wait);
  last = Date.now();
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'fr-FR' }, signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } catch (e) {
    // repli curl (proxy d'entreprise…)
    try {
      return execFileSync('curl', ['-sSfL', '-m', '30', '-A', UA, url], { maxBuffer: 20 * 1024 * 1024 }).toString('utf8');
    } catch {
      throw new Error(`${url} : ${(e as Error).message}`);
    }
  }
}

export async function ajpAgencies(depts: string[], delayMs = 800) {
  const html = await get(`${BASE}/plan-du-site/acheter-avec-ajp`, delayMs);
  const urls = [...new Set([...html.matchAll(/href="(https:\/\/www\.ajp-immobilier\.com\/immobilier\/achat\/immo-([a-z0-9-]+)-(\d{2,3})\/\d+)"/g)].filter((m) => depts.includes(m[3])).map((m) => m[1]))];
  return urls;
}

export function parseAgencyPage(html: string, agencyUrl: string): AjpCard[] {
  const cards: AjpCard[] = [];
  const seen = new Set<string>();
  for (const chunk of html.split(/class="property-card card/).slice(1)) {
    const m = chunk.match(/https:\/\/www\.ajp-immobilier\.com\/annonces\/achat\/([a-z_]+)\/([a-z0-9-]+)-(\d{2,3})\/(\d+)/);
    if (!m || seen.has(m[4])) continue;
    seen.add(m[4]);
    const price = chunk.match(/<span>\s*([\d\s  .]+)\s*€\s*<\/span>/);
    const surf = chunk.match(/class="ml-2 amount">\s*([\d.,]+)\s*m²/);
    const land = chunk.match(/terrain-icon[\s\S]{0,200}?class="ml-2 amount">\s*([\d.,\s]+)\s*m²/);
    cards.push({
      url: m[0], type: m[1], city: m[2], dept: m[3], id: m[4], agencyUrl,
      price: price ? parseInt(price[1].replace(/[^\d]/g, ''), 10) : 0,
      surface: surf ? parseFloat(surf[1].replace(',', '.')) || undefined : undefined,
      land: land ? parseFloat(land[1].replace(/\s/g, '').replace(',', '.')) || undefined : undefined,
    });
  }
  return cards;
}

const TYPE: Record<string, LotType> = { appartement: 'appartement', maison: 'maison', parking: 'parking', garage: 'garage', box: 'garage', local: 'local', local_commercial: 'local', immeuble: 'maison', terrain: 'terrain' };
/** Types où un lot groupé ou une décote revendable est plausible : fiche détaillée récupérée. */
// maisons comprises : la description donne l'état (travaux) et le terrain
export const DETAIL_TYPES = new Set(['appartement', 'parking', 'garage', 'box', 'immeuble', 'local', 'local_commercial', 'maison']);
const SKIP_TYPES = new Set(['terrain', 'programme_neuf', 'viager', 'fonds_de_commerce', 'bureau', 'autre']);

export function cardToInput(c: AjpCard, detailText?: string): ListingInput {
  const cityName = c.city.split('-').map((w) => (['sur', 'de', 'les', 'la', 'le', 'en', 'd', 'l', 'du'].includes(w) ? w : w[0].toUpperCase() + w.slice(1))).join('-').replace(/-d-/g, '-d’').replace(/^Les-/, 'Les ');
  if (detailText) {
    const p = parseListingText(detailText, c.url);
    const { parseNotes: _n, ...rest } = p;
    return {
      ...rest,
      source: 'reseau', network: 'ajp', url: c.url, sourceRef: c.id,
      price: c.price || p.price,
      // le code postal lu dans la fiche doit être du bon département, sinon on garde la commune de l'URL
      address: p.address.postalCode.startsWith(c.dept) ? { ...p.address, city: p.address.city || cityName, dept: c.dept } : { number: p.address.number, street: p.address.street, postalCode: '', city: cityName, dept: c.dept },
      surface: p.surface ?? c.surface,
      landSurface: c.land || p.landSurface,
      seller: 'agence',
    };
  }
  const type = TYPE[c.type] ?? 'autre';
  return {
    source: 'reseau', network: 'ajp', url: c.url, sourceRef: c.id,
    title: `${type[0].toUpperCase() + type.slice(1)}${c.surface ? ` ${c.surface} m²` : ''} – ${cityName}`,
    description: '', price: c.price, surface: c.surface, landSurface: c.land,
    address: { postalCode: '', city: cityName, dept: c.dept },
    lots: [{ id: `l${c.id}`, type, surface: c.surface }],
    seller: 'agence', publishedAt: new Date().toISOString().slice(0, 10),
  };
}

export interface AjpResult { agencies: number; cards: AjpCard[]; inputs: ListingInput[]; details: number; errors: string[] }

/** Collecte complète. cacheDir conserve le texte des fiches (une fiche n'est relue que si elle n'est pas en cache). */
export async function collectAjp(opts: { depts: string[]; cacheDir: string; log?: CollectLog; delayMs?: number; maxDetails?: number }): Promise<AjpResult> {
  const { depts, cacheDir, log = () => {}, delayMs = 800, maxDetails = 2000 } = opts;
  fs.mkdirSync(cacheDir, { recursive: true });
  const errors: string[] = [];
  const agencies = await ajpAgencies(depts, delayMs);
  log(`AJP : ${agencies.length} agences dans ${depts.join(', ')}`);
  const cards: AjpCard[] = [];
  const seen = new Set<string>();
  for (const [i, a] of agencies.entries()) {
    try {
      const cs = parseAgencyPage(await get(a, delayMs), a).filter((c) => !seen.has(c.id) && !SKIP_TYPES.has(c.type));
      cs.forEach((c) => seen.add(c.id));
      cards.push(...cs);
      log(`  [${i + 1}/${agencies.length}] ${a.split('/').slice(-2, -1)[0]} : ${cs.length} biens`);
    } catch (e) {
      errors.push((e as Error).message);
      log(`  ✘ ${a} : ${(e as Error).message}`);
    }
  }
  const inputs: ListingInput[] = [];
  let details = 0;
  for (const c of cards) {
    let text: string | undefined;
    const f = path.join(cacheDir, `${c.id}.txt`);
    if (DETAIL_TYPES.has(c.type)) {
      if (fs.existsSync(f)) text = fs.readFileSync(f, 'utf8');
      else if (details < maxDetails) {
        try {
          text = htmlToText(await get(c.url, delayMs));
          // on ne garde que la partie utile de la page (titre → description)
          const end = text.search(/\nLes informations sur les risques|\nSituation et environnement/);
          text = `${c.url}\n${end > 0 ? text.slice(0, end) : text}`.replace(/^(?:ACHATS|VENTES|LOCATIONS|GESTION LOCATIVE|SYNDIC|LMNP|IMMOBILIER NEUF|VACANCES|LOCATIONS DE VACANCES|ENTREPRISES|DEVENIR FRANCHISÉ|AJP Recrute|AJP Actualités|Service Qualité Clients)$\n?/gm, '');
          fs.writeFileSync(f, text);
          details++;
          if (details % 25 === 0) log(`  fiches lues : ${details}`);
        } catch (e) {
          errors.push((e as Error).message);
        }
      }
    }
    inputs.push(cardToInput(c, text));
  }
  log(`AJP : ${cards.length} biens, ${details} nouvelles fiches lues, ${errors.length} erreur(s)`);
  return { agencies: agencies.length, cards, inputs, details, errors };
}
