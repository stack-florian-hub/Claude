// Extraction du texte d'une fiche PDF (agent immobilier, notaire) dans le navigateur, avec PDF.js chargé à la demande.
// Le « worker » de PDF.js est chargé comme script classique : il tourne dans la page (compatible artefact, sans Worker externe).
const BASE = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';

type PdfLib = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument(src: { data: Uint8Array; isEvalSupported?: boolean }): { promise: Promise<PdfDoc> };
};
type PdfDoc = { numPages: number; getPage(n: number): Promise<{ getTextContent(): Promise<{ items: { str: string; transform: number[]; hasEOL?: boolean }[] }> }> };

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`chargement impossible : ${src}`));
    document.head.appendChild(s);
  });
}

let loading: Promise<PdfLib> | null = null;
function pdfjs(): Promise<PdfLib> {
  const w = window as unknown as { pdfjsLib?: PdfLib; pdfjsWorker?: unknown };
  if (w.pdfjsLib && w.pdfjsWorker) return Promise.resolve(w.pdfjsLib);
  loading ??= (async () => {
    await loadScript(BASE + 'pdf.min.js');
    await loadScript(BASE + 'pdf.worker.min.js');
    const lib = (window as unknown as { pdfjsLib: PdfLib }).pdfjsLib;
    lib.GlobalWorkerOptions.workerSrc = BASE + 'pdf.worker.min.js';
    return lib;
  })();
  return loading;
}

/** Texte du PDF, ligne par ligne (les fragments sont regroupés par hauteur sur la page). */
export async function pdfToText(file: File): Promise<string> {
  const lib = await pdfjs();
  const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
  const pages: string[] = [];
  for (let n = 1; n <= Math.min(doc.numPages, 12); n++) {
    const { items } = await (await doc.getPage(n)).getTextContent();
    const lines = new Map<number, { x: number; s: string }[]>();
    for (const it of items) {
      if (!it.str.trim()) continue;
      const y = Math.round(it.transform[5] / 3) * 3;
      (lines.get(y) || lines.set(y, []).get(y)!).push({ x: it.transform[4], s: it.str });
    }
    pages.push([...lines.entries()].sort((a, b) => b[0] - a[0]).map(([, l]) => l.sort((a, b) => a.x - b.x).map((p) => p.s).join(' ').replace(/\s+/g, ' ').trim()).join('\n'));
  }
  return pages.join('\n');
}
