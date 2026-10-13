// Construction de l'index DVF compact à partir des fichiers data.gouv.fr.
// Deux formats acceptés :
//  - geo-dvf (CSV « , » par département et par année, avec id_mutation et coordonnées) ;
//  - DVF brut (ValeursFoncieres-AAAA.txt, séparateur « | », national ou départemental).
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import zlib from 'node:zlib';
import type { DvfIndex, DvfMutation } from '../src/lib/types';

export const DATA_DIR = process.env.SCANNER_DATA_DIR || path.join(process.cwd(), 'data');
export const DVF_DIR = path.join(DATA_DIR, 'dvf');
export const RAW_DIR = path.join(DATA_DIR, 'raw');

interface Row {
  key: string; date: string; nature: string; value: number; num?: string; voie: string; cp: string; insee: string; dept: string;
  type: string; surface?: number; rooms?: number; localId: string; terrain: number; lon?: number; lat?: number;
}

const BATI: Record<string, DvfMutation['t']> = { Appartement: 'A', Maison: 'M', 'Local industriel. commercial ou assimilé': 'L' };

function toMutation(rows: Row[]): DvfMutation | null {
  const r0 = rows[0];
  if (!['Vente', 'Adjudication'].includes(r0.nature) || !(r0.value > 0)) return null;
  const locals = new Map<string, Row>();
  let terrain = 0;
  for (const r of rows) {
    if (r.type) locals.set(r.localId || `${r.type}|${r.surface}|${locals.size}`, r);
    terrain = Math.max(terrain, r.terrain || 0);
  }
  const all = [...locals.values()];
  const bati = all.filter((r) => BATI[r.type]);
  const deps = all.filter((r) => r.type === 'Dépendance').length;
  const base = { d: r0.date, v: Math.round(r0.value), cp: r0.cp, c: r0.insee, n: r0.num || undefined, r: r0.voie, x: r0.lon, y: r0.lat };
  if (bati.length === 1) {
    const b = bati[0];
    if (!b.surface) return null;
    return { ...base, t: BATI[b.type], s: b.surface, p: b.rooms || undefined, nd: deps };
  }
  if (bati.length === 0 && deps >= 1 && terrain <= 300) return { ...base, t: 'D', nd: deps };
  return null; // ventes multi-locaux : inutilisables pour un €/m²
}

const f = (s?: string) => {
  if (!s) return undefined;
  const v = parseFloat(s.replace(',', '.'));
  return isFinite(v) ? v : undefined;
};

function splitCsvLine(line: string, delim: string) {
  if (!line.includes('"')) return line.split(delim);
  const out: string[] = [];
  let cell = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') q = !q;
    else if (c === delim && !q) { out.push(cell); cell = ''; }
    else cell += c;
  }
  out.push(cell);
  return out;
}

/** Lit un fichier (txt, csv ou .gz) en flux et renvoie les mutations utiles, filtrées par départements. */
export async function readDvfFile(file: string, depts?: Set<string>): Promise<{ byDept: Map<string, DvfMutation[]>; years: Set<number>; lines: number }> {
  let stream: NodeJS.ReadableStream = fs.createReadStream(file);
  if (file.endsWith('.gz')) stream = stream.pipe(zlib.createGunzip());
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let header: string[] | null = null;
  let delim = ',';
  let geo = false;
  const byDept = new Map<string, DvfMutation[]>();
  const years = new Set<number>();
  let group: Row[] = [];
  let lines = 0;
  const flush = () => {
    if (!group.length) return;
    const m = toMutation(group);
    if (m) {
      const dept = group[0].dept;
      (byDept.get(dept) || byDept.set(dept, []).get(dept)!).push(m);
      years.add(parseInt(m.d.slice(0, 4), 10));
    }
    group = [];
  };
  let idx: Record<string, number> = {};
  for await (const line of rl) {
    if (!header) {
      delim = line.includes('|') ? '|' : line.split(';').length > line.split(',').length ? ';' : ',';
      header = splitCsvLine(line, delim).map((h) => h.trim().replace(/^﻿/, ''));
      geo = header.includes('id_mutation');
      idx = Object.fromEntries(header.map((h, i) => [h, i]));
      continue;
    }
    lines++;
    const c = splitCsvLine(line, delim);
    const g = (k: string) => c[idx[k]]?.trim() ?? '';
    let row: Row;
    if (geo) {
      row = {
        key: g('id_mutation'), date: g('date_mutation'), nature: g('nature_mutation'), value: f(g('valeur_fonciere')) ?? 0,
        num: [g('adresse_numero'), g('adresse_suffixe')].filter(Boolean).join(''), voie: g('adresse_nom_voie'), cp: g('code_postal'),
        insee: g('code_commune'), dept: g('code_departement'), type: g('type_local'), surface: f(g('surface_reelle_bati')),
        rooms: f(g('nombre_pieces_principales')), localId: [g('id_parcelle'), g('lot1_numero'), g('type_local'), g('surface_reelle_bati')].join('|'),
        terrain: f(g('surface_terrain')) ?? 0, lon: f(g('longitude')), lat: f(g('latitude')),
      };
    } else {
      const dept = g('Code departement').padStart(2, '0');
      const [dd, mm, yy] = g('Date mutation').split('/');
      const value = f(g('Valeur fonciere')) ?? 0;
      const commune = g('Code commune').padStart(3, '0');
      row = {
        key: [g('Date mutation'), value, dept, commune].join('|'), date: `${yy}-${mm}-${dd}`, nature: g('Nature mutation'), value,
        num: [g('No voie'), g('B/T/Q')].filter(Boolean).join(''), voie: [g('Type de voie'), g('Voie')].filter(Boolean).join(' '),
        cp: g('Code postal').padStart(5, '0'), insee: dept + commune, dept, type: g('Type local'), surface: f(g('Surface reelle bati')),
        rooms: f(g('Nombre pieces principales')), localId: [g('Section'), g('No plan'), g('1er lot'), g('Identifiant local'), g('Type local'), g('Surface reelle bati')].join('|'),
        terrain: f(g('Surface terrain')) ?? 0,
      };
    }
    if (depts && !depts.has(row.dept)) {
      flush();
      continue;
    }
    if (group.length && group[0].key !== row.key) flush();
    group.push(row);
  }
  flush();
  return { byDept, years, lines };
}

/** Fusionne des mutations dans data/dvf/<dept>.json (remplace les années importées). */
export function mergeIntoIndex(dept: string, muts: DvfMutation[], source: string) {
  fs.mkdirSync(DVF_DIR, { recursive: true });
  const file = path.join(DVF_DIR, `${dept}.json`);
  const newYears = new Set(muts.map((m) => parseInt(m.d.slice(0, 4), 10)));
  let prev: DvfIndex | null = null;
  if (fs.existsSync(file)) prev = JSON.parse(fs.readFileSync(file, 'utf8'));
  const kept = (prev?.mutations || []).filter((m) => !newYears.has(parseInt(m.d.slice(0, 4), 10)));
  const mutations = [...kept, ...muts].sort((a, b) => a.d.localeCompare(b.d));
  const years = [...new Set(mutations.map((m) => parseInt(m.d.slice(0, 4), 10)))].sort();
  const idx: DvfIndex = { dept, years, builtAt: new Date().toISOString(), source, mutations };
  fs.writeFileSync(file, JSON.stringify(idx));
  return { file, n: mutations.length, years };
}
