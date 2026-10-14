// Outils communs des collecteurs : requêtes espacées (politesse), repli curl, conversion HTML → texte.
import { execFileSync } from 'node:child_process';
import type { ListingInput } from '../types';

export const UA = 'Mozilla/5.0 (compatible; scanner-mdb/1.0; usage personnel, 1 req/s)';
export type CollectLog = (msg: string) => void;

export interface CollectResult { network: string; label: string; pages: number; cards: number; inputs: ListingInput[]; details: number; errors: string[] }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const last = new Map<string, number>();

/** GET poli : au plus une requête par hôte toutes les `delayMs`. */
export async function get(url: string, delayMs = 900): Promise<string> {
  const host = new URL(url).host;
  const wait = (last.get(host) ?? 0) + delayMs - Date.now();
  if (wait > 0) await sleep(wait);
  last.set(host, Date.now());
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'fr-FR' }, signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } catch (e) {
    try {
      return execFileSync('curl', ['-sSfL', '-m', '30', '-A', UA, url], { maxBuffer: 30 * 1024 * 1024 }).toString('utf8');
    } catch {
      throw new Error(`${url} : ${(e as Error).message}`);
    }
  }
}

export function decodeEntities(s: string) {
  return s
    .replace(/&nbsp;|&#160;|&thinsp;|&#8201;|&nnbsp;/g, ' ').replace(/&Agrave;/g, 'À').replace(/&Eacute;/g, 'É').replace(/&ocirc;/g, 'ô').replace(/&icirc;/g, 'î').replace(/&ugrave;/g, 'ù').replace(/&amp;/g, '&').replace(/&#0?39;|&apos;|&rsquo;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&euro;/g, '€').replace(/&bull;/g, '•').replace(/&eacute;/g, 'é').replace(/&egrave;/g, 'è').replace(/&agrave;/g, 'à').replace(/&ecirc;/g, 'ê').replace(/&ccedil;/g, 'ç')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

/** Retire les balises en respectant les guillemets des attributs (balises sur plusieurs lignes, « > » dans un attribut). */
function stripTags(html: string) {
  let out = '';
  let i = 0;
  const n = html.length;
  while (i < n) {
    const c = html[i];
    if (c === '<' && /[a-zA-Z!\/]/.test(html[i + 1] || '')) {
      let q = '';
      i++;
      while (i < n) {
        const d = html[i];
        if (q) { if (d === q) q = ''; }
        else if (d === '"' || d === "'") {
          // une apostrophe n'ouvre une chaîne que juste après « = » (valeur d'attribut)
          if (d === '"' || /=\s*$/.test(html.slice(Math.max(0, i - 3), i))) q = d;
        } else if (d === '>') break;
        i++;
      }
      out += '\n';
      i++;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

export function htmlToText(html: string) {
  return decodeEntities(stripTags(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<svg[\s\S]*?<\/svg>|<!--[\s\S]*?-->/gi, '').replace(/<br\s*\/?>/gi, '\n')))
    .split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
}

export const num = (s?: string) => (s ? parseFloat(s.replace(/[\s  .]/g, '').replace(',', '.')) || undefined : undefined);

export const DEPT_SLUGS: Record<string, { name: string; c21: string; laforet: string; immonot: string }> = {
  '44': { name: 'Loire-Atlantique', c21: 'd-44_loire_atlantique', laforet: 'loire-atlantique', immonot: 'D44/loire-atlantique' },
  '85': { name: 'Vendée', c21: 'd-85_vendee', laforet: 'vendee', immonot: 'D85/vendee' },
  '49': { name: 'Maine-et-Loire', c21: 'd-49_maine_et_loire', laforet: 'maine-et-loire', immonot: 'D49/maine-et-loire' },
  '37': { name: 'Indre-et-Loire', c21: 'd-37_indre_et_loire', laforet: 'indre-et-loire', immonot: 'D37/indre-et-loire' },
  '41': { name: 'Loir-et-Cher', c21: 'd-41_loir_et_cher', laforet: 'loir-et-cher', immonot: 'D41/loir-et-cher' },
  '72': { name: 'Sarthe', c21: 'd-72_sarthe', laforet: 'sarthe', immonot: 'D72/sarthe' },
  '53': { name: 'Mayenne', c21: 'd-53_mayenne', laforet: 'mayenne', immonot: 'D53/mayenne' },
  '86': { name: 'Vienne', c21: 'd-86_vienne', laforet: 'vienne', immonot: 'D86/vienne' },
};

/** Cache disque des fiches détaillées (un fichier texte par annonce), lu à la demande. */
export class DiskCache extends Map<string, string> {
  constructor(private dir: string, private fsMod: typeof import('node:fs'), private pathMod: typeof import('node:path')) {
    super();
    fsMod.mkdirSync(dir, { recursive: true });
  }
  private file(k: string) { return this.pathMod.join(this.dir, k.replace(/[^\w.-]/g, '_') + '.txt'); }
  override get(k: string) {
    if (super.has(k)) return super.get(k);
    const f = this.file(k);
    if (this.fsMod.existsSync(f)) { const v = this.fsMod.readFileSync(f, 'utf8'); super.set(k, v); return v; }
    return undefined;
  }
  override set(k: string, v: string) {
    this.fsMod.writeFileSync(this.file(k), v);
    return super.set(k, v);
  }
}
