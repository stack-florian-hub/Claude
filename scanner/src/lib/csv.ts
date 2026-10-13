// CSV : lecture tolérante (; , ou tabulation, guillemets) et export (séparateur ; pour Excel FR).

export function parseCsv(text: string): string[][] {
  const t = text.replace(/^﻿/, '');
  const firstLine = t.split('\n')[0];
  const delim = [';', '\t', ','].map((d) => [d, firstLine.split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = [];
  let row: string[] = [], cell = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) {
      if (c === '"' && t[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}

export function toObjects(rows: string[][]): Record<string, string>[] {
  const [h, ...rest] = rows;
  const keys = h.map((k) => k.trim());
  return rest.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])));
}

const esc = (v: unknown) => {
  const s = v == null ? '' : typeof v === 'number' ? String(v).replace('.', ',') : String(v);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(rows: Record<string, unknown>[], columns?: string[]): string {
  const cols = columns ?? Object.keys(rows[0] ?? {});
  return '﻿' + [cols.map(esc).join(';'), ...rows.map((r) => cols.map((c) => esc(r[c])).join(';'))].join('\n');
}

/** Téléchargement côté navigateur (dans l'artefact : capacité « downloads », le lecteur confirme l'enregistrement). */
export function downloadCsv(name: string, rows: Record<string, unknown>[], columns?: string[]) {
  const filename = name.endsWith('.csv') ? name : name + '.csv';
  const text = toCsv(rows, columns);
  const w = window as unknown as { __SCANNER_ARTIFACT__?: boolean; claude?: { use(n: string): Promise<{ save(r: { filename: string; data: string }): Promise<unknown> } | null> } };
  if (w.__SCANNER_ARTIFACT__) {
    w.claude?.use('downloads').then((d) => d?.save({ filename, data: text })).catch(() => {});
    return;
  }
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
