'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Analysis, ListingInput } from '@/lib/types';
import { api } from '@/lib/api';
import { rowToListing } from '@/lib/providers/listing';
import { downloadCsv } from '@/lib/csv';
import { LOT_LABELS, SELLER_LABELS, SOURCE_LABELS } from '@/lib/defaults';
import { NETWORK_BY_ID } from '@/lib/networks';
import { pdfToText } from '@/lib/pdf';
import { eur, pct } from '@/lib/util';

type Preview = { input: ListingInput & { parseNotes: string[] }; analysis: Analysis; zone?: string; existing?: { id: string; price: number; title: string } };

const EXAMPLE = `Appartement T3 58 m² avec cave et parking
12 rue de Coulmiers 44000 Nantes
Prix : 168 000 € – Charges : 1 400 €/an – DPE : E – Copropriété de 24 lots. Particulier.
---
Lot de 3 boxes fermés
22 avenue Rosa Bonheur 85100 Les Sables-d'Olonne
Prix 32 000 €. Succession, vente rapide.`;

const TEMPLATE = [
  { titre: 'T3 58 m² + cave + parking', prix: 168000, url: 'https://www.leboncoin.fr/…', source: 'leboncoin', numero: '12', rue: 'rue de Coulmiers', cp: '44000', ville: 'Nantes', insee: '44109', surface: 58, pieces: 3, type: 'appartement', lots: 'appartement:58:3|cave|parking', dpe: 'E', charges: 1400, vendeur: 'particulier', date: '2026-10-01', description: 'Vendu avec cave et parking', travaux: 9000 },
  { titre: 'Garage fermé', prix: 12000, url: '', source: 'pap', numero: '8', rue: 'rue Paul Bellamy', cp: '44000', ville: 'Nantes', insee: '', surface: 14, pieces: '', type: 'garage', lots: 'garage:14', dpe: '', charges: '', vendeur: 'particulier', date: '2026-10-08', description: '', travaux: '' },
];

const EMPTY_MANUAL = { titre: '', prix: '', numero: '', rue: '', cp: '', ville: '', surface: '', type: 'appartement', lots: '', dpe: '', charges: '', vendeur: 'agence', source: 'manuel', url: '', date: new Date().toISOString().slice(0, 10), description: '', travaux: '' };

const isArtifact = typeof window !== 'undefined' && !!(window as unknown as { __SCANNER_ARTIFACT__?: boolean }).__SCANNER_ARTIFACT__;

export default function ImportPanel() {
  const [tab, setTab] = useState<'collage' | 'pdf' | 'csv' | 'json' | 'manuel' | 'bookmarklet'>('collage');
  const [pdfMsg, setPdfMsg] = useState('');
  const [content, setContent] = useState('');
  const [preview, setPreview] = useState<Preview[]>([]);
  const [keep, setKeep] = useState<boolean[]>([]);
  const [msg, setMsg] = useState<{ t: string; ids?: string[] } | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState<Record<string, string>>(EMPTY_MANUAL);
  const [origin, setOrigin] = useState('http://localhost:3000');

  useEffect(() => {
    setOrigin(window.location.origin);
    const h = window.location.hash;
    if (h.startsWith('#capture=')) {
      setContent(decodeURIComponent(h.slice(9)));
      setTab('collage');
      history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  async function analyse(provider: string, text: string) {
    setErr('');
    setMsg(null);
    setBusy(true);
    try {
      const p = await api<Preview[]>('/api/import', 'POST', { provider, content: text });
      setPreview(p);
      setKeep(p.map(() => true));
      if (!p.length) setErr('Aucune annonce reconnue.');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    try {
      const listings = preview.filter((_, i) => keep[i]).map((p) => p.input);
      const r = await api<{ added: number; skipped: number; geocoded: number; ids: string[]; priceUpdates: { title: string; from: number; to: number }[] }>('/api/listings', 'POST', { listings });
      const pu = r.priceUpdates.map((u) => `« ${u.title.slice(0, 40)} » ${eur(u.from)} → ${eur(u.to)}`).join(' ; ');
      setMsg({ t: `${r.added} annonce(s) ajoutée(s)${r.priceUpdates.length ? `, ${r.priceUpdates.length} changement(s) de prix enregistré(s) : ${pu}` : ''}${r.skipped ? `, ${r.skipped} doublon(s) sans changement` : ''}${r.geocoded ? `, ${r.geocoded} géocodée(s)` : ''}.`, ids: r.ids });
      setPreview([]);
      setContent('');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  /** Une fiche PDF = une annonce ; plusieurs fiches sont séparées par --- avant analyse. */
  async function onPdfs(files: FileList | File[] | null) {
    const list = [...(files || [])].filter((f) => /\.pdf$/i.test(f.name) || f.type === 'application/pdf');
    if (!list.length) return;
    setErr('');
    setPdfMsg(`Lecture de ${list.length} fiche(s)…`);
    const texts: string[] = [];
    const empty: string[] = [];
    for (const f of list) {
      try {
        const t = await pdfToText(f);
        if (t.replace(/\s/g, '').length < 40) empty.push(f.name);
        else texts.push(t);
      } catch (e) {
        empty.push(`${f.name} (${(e as Error).message})`);
      }
    }
    setPdfMsg(empty.length ? `Texte illisible pour : ${empty.join(', ')} (PDF scanné en image : saisir l’annonce à la main).` : '');
    if (!texts.length) return;
    const joined = texts.join('\n---\n');
    setContent(joined);
    analyse('collage', joined);
  }

  function onFile(f: File | undefined) {
    if (!f) return;
    f.text().then((t) => {
      setContent(t);
      analyse(tab === 'json' || f.name.endsWith('.json') ? 'json' : 'csv', t);
    });
  }

  const bookmarklet = `javascript:(()=>{const t=(document.title+'\\n'+location.href+'\\n'+document.body.innerText).slice(0,12000);window.open('${origin}/import#capture='+encodeURIComponent(t))})()`;

  return (
    <>
      <div className="tabs">
        {([['collage', 'Coller du texte'], ['pdf', 'Fiche PDF'], ['csv', 'Fichier CSV'], ['json', 'Fichier JSON'], ['manuel', 'Saisie manuelle'], ['bookmarklet', 'Capture navigateur']] as const).filter(([k]) => !(k === 'bookmarklet' && isArtifact)).map(([k, l]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {tab === 'collage' && (
        <div className="panel">
          <p className="muted">Copiez le texte d’une annonce (SeLoger, Leboncoin, Logic-Immo, Bien’ici, PAP, AJP…) et collez-le ici. Plusieurs annonces : séparez-les par une ligne <code>---</code>. Le prix, la surface, l’adresse, le DPE, les charges, le type de vendeur et les <b>lots vendus ensemble</b> (cave, garage, box, parking) sont détectés.</p>
          <textarea rows={12} value={content} onChange={(e) => setContent(e.target.value)} placeholder={EXAMPLE} />
          <div className="row" style={{ marginTop: 8 }}>
            <button className="primary" disabled={busy || !content.trim()} onClick={() => analyse('collage', content)}>Analyser</button>
            <button onClick={() => setContent(EXAMPLE)}>Exemple</button>
          </div>
        </div>
      )}

      {(tab === 'csv' || tab === 'json') && (
        <div className="panel">
          <p className="muted">
            {tab === 'csv'
              ? 'Séparateur ; , ou tabulation. Colonnes reconnues : titre, prix, url, source, numero, rue, cp, ville, insee, surface, pieces, type, lots, dpe, charges, vendeur, date, description, travaux, lat, lon. La colonne lots décrit un lot groupé : appartement:58:3|cave|parking (type:surface:pièces).'
              : 'Tableau d’objets avec les mêmes champs que le CSV, ou le format interne (ListingInput).'}
          </p>
          <div className="row">
            <input type="file" accept={tab === 'csv' ? '.csv,.txt' : '.json'} onChange={(e) => onFile(e.target.files?.[0])} />
            {tab === 'csv' && <button onClick={() => downloadCsv('modele-annonces.csv', TEMPLATE)}>Télécharger le modèle CSV</button>}
          </div>
          <details style={{ marginTop: 8 }}>
            <summary className="muted">… ou coller le contenu</summary>
            <textarea rows={8} value={content} onChange={(e) => setContent(e.target.value)} />
            <button style={{ marginTop: 6 }} disabled={!content.trim() || busy} onClick={() => analyse(tab, content)}>Analyser</button>
          </details>
        </div>
      )}

      {tab === 'pdf' && (
        <div className="panel">
          <p className="muted">Fiche commerciale ou fiche de visite envoyée par un agent ou un notaire (PDF). Le texte est lu dans votre navigateur puis analysé comme une annonce collée : prix, surface, adresse, DPE, charges, réseau et lots vendus ensemble. Une fiche par bien ; plusieurs fiches à la fois possibles.</p>
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); onPdfs(e.dataTransfer.files); }}
            style={{ border: '2px dashed var(--line)', borderRadius: 8, padding: 24, textAlign: 'center' }}
          >
            <p>Déposez les fiches PDF ici, ou</p>
            <input id="pdf-input" type="file" accept="application/pdf,.pdf" multiple onChange={(e) => onPdfs(e.target.files)} />
          </div>
          {pdfMsg && <p className="small muted" style={{ marginTop: 6 }}>{pdfMsg}</p>}
          {content && (
            <details style={{ marginTop: 8 }}>
              <summary className="muted">Texte extrait (modifiable, puis « Analyser »)</summary>
              <textarea rows={10} value={content} onChange={(e) => setContent(e.target.value)} />
              <button style={{ marginTop: 6 }} disabled={busy} onClick={() => analyse('collage', content)}>Analyser</button>
            </details>
          )}
        </div>
      )}

      {tab === 'manuel' && (
        <div className="panel">
          <div className="formgrid">
            {([['titre', 'Titre'], ['prix', 'Prix affiché (€)'], ['numero', 'N°'], ['rue', 'Rue'], ['cp', 'Code postal'], ['ville', 'Ville'], ['surface', 'Surface (m²)'], ['travaux', 'Travaux estimés (€)'], ['charges', 'Charges (€/an)'], ['url', 'URL'], ['date', 'Date de publication']] as const).map(([k, l]) => (
              <label key={k} className="field">{l}<input value={manual[k]} type={k === 'date' ? 'date' : 'text'} onChange={(e) => setManual({ ...manual, [k]: e.target.value })} /></label>
            ))}
            <label className="field">Type principal
              <select value={manual.type} onChange={(e) => setManual({ ...manual, type: e.target.value })}>{Object.entries(LOT_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            </label>
            <label className="field">DPE
              <select value={manual.dpe} onChange={(e) => setManual({ ...manual, dpe: e.target.value })}><option value="">—</option>{'ABCDEFG'.split('').map((x) => <option key={x}>{x}</option>)}</select>
            </label>
            <label className="field">Vendeur
              <select value={manual.vendeur} onChange={(e) => setManual({ ...manual, vendeur: e.target.value })}>{Object.entries(SELLER_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            </label>
            <label className="field">Source
              <select value={manual.source} onChange={(e) => setManual({ ...manual, source: e.target.value })}>{Object.entries(SOURCE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            </label>
          </div>
          <label className="field" style={{ marginTop: 8 }}>Lots (vide = détection auto ; ex. <code>appartement:92:4|garage|parking|cave</code>)<input value={manual.lots} onChange={(e) => setManual({ ...manual, lots: e.target.value })} /></label>
          <label className="field" style={{ marginTop: 8 }}>Description<textarea rows={4} value={manual.description} onChange={(e) => setManual({ ...manual, description: e.target.value })} /></label>
          <div className="row" style={{ marginTop: 8 }}>
            <button className="primary" disabled={!manual.prix || !manual.cp} onClick={() => analyse('json', JSON.stringify([rowToListing(manual)]))}>Analyser</button>
            <button onClick={() => setManual(EMPTY_MANUAL)}>Vider</button>
          </div>
        </div>
      )}

      {tab === 'bookmarklet' && (
        <div className="panel">
          <p>Capture « encadrée » : vous ouvrez l’annonce dans votre navigateur, vous cliquez sur le favori, le texte affiché à l’écran est envoyé ici pour analyse. Aucun robot ne parcourt les sites : c’est l’équivalent d’un copier-coller, déclenché par vous, une page à la fois (respect des conditions d’utilisation des portails).</p>
          <p><b>Installation :</b> glissez ce lien dans la barre de favoris : <a href={bookmarklet} onClick={(e) => e.preventDefault()} className="btn primary">➕ Capturer l’annonce</a></p>
          <p className="muted small">Si le glisser-déposer ne marche pas, créez un favori et collez ce code comme adresse :</p>
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{bookmarklet}</pre>
        </div>
      )}

      {err && <div className="note">{err}</div>}
      {msg && (
        <div className="info">
          {msg.t} {msg.ids?.length ? <Link href="/opportunites">Voir les opportunités →</Link> : null}
        </div>
      )}

      {preview.length > 0 && (
        <div className="panel">
          <div className="row between" style={{ marginBottom: 6 }}>
            <h2>Aperçu ({preview.length})</h2>
            <button className="primary" disabled={busy || !keep.some(Boolean)} onClick={save}>Importer {keep.filter(Boolean).length} annonce(s)</button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr><th></th><th>Annonce</th><th className="num">Prix</th><th>Lieu</th><th>Lots détectés</th><th className="num">Σ lots</th><th className="num">Gain brut</th><th className="num">Score</th><th>À vérifier</th></tr>
              </thead>
              <tbody>
                {preview.map((p, i) => (
                  <tr key={i} className={p.analysis.flagged ? 'flag' : ''}>
                    <td><input type="checkbox" checked={keep[i]} onChange={(e) => setKeep(keep.map((k, j) => (j === i ? e.target.checked : k)))} /></td>
                    <td className="wrap" style={{ maxWidth: 280 }}>{p.existing && <span className={'tag ' + (p.existing.price !== p.input.price ? (p.input.price < p.existing.price ? 'good' : 'warn') : 'grey')}>{p.existing.price !== p.input.price ? `déjà connue : ${eur(p.existing.price)} → ${eur(p.input.price)}` : 'déjà connue, prix inchangé'}</span>}{p.input.title}<div className="muted small">{p.input.network ? NETWORK_BY_ID[p.input.network]?.name : SOURCE_LABELS[p.input.source]} · {SELLER_LABELS[p.input.seller]}{p.input.dpe ? ` · DPE ${p.input.dpe}` : ''}</div></td>
                    <td className="num">{eur(p.input.price)}</td>
                    <td>{p.input.address.postalCode} {p.input.address.city}<div className="muted small">{p.zone || 'hors zone'}</div></td>
                    <td className="wrap">{p.input.lots.map((l, j) => <span key={j} className="tag">{LOT_LABELS[l.type]}{l.surface ? ` ${l.surface} m²` : ''}</span>)}</td>
                    <td className="num">{eur(p.analysis.total.mid)}</td>
                    <td className={'num ' + (p.analysis.gain.mid > 0 ? 'pos' : 'neg')}>{eur(p.analysis.gain.mid)}<div className="small muted">{pct(p.analysis.gainPct)}</div></td>
                    <td className="num"><b>{p.analysis.score}</b></td>
                    <td className="wrap small">{[...p.input.parseNotes, ...p.analysis.warnings.slice(0, 2)].map((n, j) => <div key={j} className="neg">{n}</div>)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted small">Les lots, la surface et l’adresse se corrigent ensuite dans la fiche de chaque annonce.</p>
        </div>
      )}
    </>
  );
}
