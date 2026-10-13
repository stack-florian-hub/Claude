'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Analysis, Deal, Listing, LotType, Settings, SubLot } from '@/lib/types';
import type { CheckItem } from '@/lib/checklist';
import type { SimInput } from '@/lib/simulation';
import type { marketStats } from '@/lib/dvf-query';
import { api } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import { LOT_LABELS, SELLER_LABELS, SOURCE_LABELS } from '@/lib/defaults';
import { eur, frDate, keur, num, pct, uid } from '@/lib/util';
import SimPanel from './SimPanel';

const SRC_LABEL: Record<string, string> = {
  force: 'valeur saisie', manuel: 'manuel', 'dvf-rue': 'DVF même rue', 'dvf-proche': 'DVF < 300 m', 'dvf-quartier': 'DVF < 800 m', 'dvf-commune': 'DVF commune', 'dvf-dept': 'DVF département', defaut: 'valeur par défaut', castorus: 'Castorus', meilleursagents: 'MeilleursAgents',
};

interface Props {
  listing: Listing; analysis: Analysis; zone?: string; tension: number; settings: Settings; stats: ReturnType<typeof marketStats>;
  checklist: CheckItem[]; sim: SimInput; newDeal: Deal; dealId?: string;
}

export default function ListingDetail({ listing: l, analysis: a, zone, tension, settings: s, stats, checklist, sim, newDeal, dealId }: Props) {
  const router = useRouter();
  const [draft, setDraft] = useState<Listing>(l);
  const [dirty, setDirty] = useState(false);
  const [lotTab, setLotTab] = useState(0);
  const [msg, setMsg] = useState('');
  const [newPrice, setNewPrice] = useState({ date: new Date().toISOString().slice(0, 10), price: '' });

  const edit = (patch: Partial<Listing>) => {
    setDraft({ ...draft, ...patch });
    setDirty(true);
  };
  const editLot = (i: number, patch: Partial<SubLot>) => edit({ lots: draft.lots.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  const editAddr = (patch: Partial<Listing['address']>) => edit({ address: { ...draft.address, ...patch } });

  async function save(patch?: Partial<Listing>) {
    // sans priceHistory : un changement de prix depuis le formulaire ajoute un point d'historique
    const { priceHistory: _h, ...rest } = draft;
    await api(`/api/listings/${l.id}`, 'PATCH', patch ?? rest);
    setDirty(false);
    router.refresh();
  }
  async function toggleCheck(id: string) {
    const checklistState = { ...(l.checklist || {}), [id]: !l.checklist?.[id] };
    await api(`/api/listings/${l.id}`, 'PATCH', { checklist: checklistState });
    router.refresh();
  }
  async function toPipeline() {
    await api('/api/deals', 'POST', newDeal);
    router.push('/pipeline');
  }
  async function geocode() {
    try {
      const r = await api<{ label: string }>(`/api/listings/${l.id}`, 'PATCH', { geocode: true });
      setMsg(`Géocodé : ${r.label}`);
      router.refresh();
    } catch (e) {
      setMsg((e as Error).message);
    }
  }
  async function remove() {
    if (!confirm('Supprimer cette annonce ?')) return;
    await api(`/api/listings/${l.id}`, 'DELETE');
    router.push('/opportunites');
  }

  const c = a.costs;
  const agency = s.fees.agenceRevPct / 100;
  const lotVal = a.lots[lotTab];
  const done = checklist.filter((x) => l.checklist?.[x.id]).length;
  const first = l.priceHistory[0]?.price;

  return (
    <>
      <div className="head">
        <div style={{ maxWidth: 820 }}>
          <div className="small muted"><Link href="/opportunites">← Opportunités</Link> · {SOURCE_LABELS[l.source]} · {SELLER_LABELS[l.seller]} · publiée le {frDate(l.publishedAt)}{l.demo ? ' · DÉMO' : ''}</div>
          <h1>{l.title}</h1>
          <div className="muted">
            {[l.address.number, l.address.street].filter(Boolean).join(' ')} {l.address.postalCode} {l.address.city} · {zone ? `${zone} (tension ${tension}/3)` : 'hors zones paramétrées'}
            {l.address.insee ? ` · INSEE ${l.address.insee}` : ''}{l.address.lat != null ? ' · géocodé' : ''}
            {l.url && <> · <a href={l.url} target="_blank" rel="noreferrer">voir l’annonce ↗</a></>}
            {l.alsoOn?.map((o, i) => <span key={i}> · <a href={o.url} target="_blank" rel="noreferrer">aussi sur {SOURCE_LABELS[o.source]} ({keur(o.price)}) ↗</a></span>)}
          </div>
        </div>
        <div className="row">
          {a.flagged && <span className="tag good">⚑ Alerte</span>}
          <select value={l.status} onChange={(e) => save({ status: e.target.value as Listing['status'] })}>
            <option value="nouveau">Nouveau</option><option value="suivi">Suivi</option><option value="pipeline">En pipeline</option><option value="ecarte">Écarté</option>
          </select>
          {dealId ? <Link className="btn" href="/pipeline">Voir dans le pipeline</Link> : <button className="primary" onClick={toPipeline}>→ Ajouter au pipeline</button>}
          <button className="danger" onClick={remove}>Supprimer</button>
        </div>
      </div>

      {l.auction && (
        <div className="info">
          <b>Vente judiciaire</b> · TJ {l.auction.tribunal} · audience {l.auction.date ? l.auction.date.replace('T', ' à ') : 'date à confirmer'} · mise à prix <b>{eur(l.auction.map)}</b>
          {l.auction.ratio ? <> · prix retenu = adjudication probable (×{l.auction.ratio.toFixed(2)})</> : null} · occupation : {l.auction.occupation || 'inconnue'}
          {l.auction.visite ? <> · {l.auction.visite}</> : null}{l.auction.avocat ? <div className="small">Avocat poursuivant : {l.auction.avocat}</div> : null}
        </div>
      )}
      <div className="kpis">
        <div className="kpi"><div className="l">Prix affiché</div><div className="v">{eur(l.price)}</div><div className="s">{first && first > l.price ? `initial ${eur(first)} (−${pct(1 - l.price / first)})` : `${l.lots.length} lot(s)`}</div></div>
        <div className="kpi"><div className="l">Valeur des lots séparés (moy.)</div><div className="v">{eur(a.total.mid)}</div><div className="s">bas {keur(a.total.low)} · haut {keur(a.total.high)}</div></div>
        <div className="kpi"><div className="l">Écart (Σ lots − prix)</div><div className={'v ' + (a.ecart > 0 ? 'pos' : 'neg')}>{eur(a.ecart)}</div><div className="s">{pct(a.ecart / l.price)} du prix</div></div>
        <div className="kpi"><div className="l">Gain brut (moyen)</div><div className={'v ' + (a.gain.mid > 0 ? 'pos' : 'neg')}>{eur(a.gain.mid)}</div><div className="s">bas {keur(a.gain.low)} · haut {keur(a.gain.high)}</div></div>
        <div className="kpi"><div className="l">Gain / prix · ratio</div><div className="v">{pct(a.gainPct)}</div><div className="s">ratio {num(a.ratio, 2)} (&gt; 1 = rentable)</div></div>
        <div className="kpi"><div className="l">Score · confiance</div><div className="v">{a.score}/100</div><div className="s">confiance {pct(a.confidence)}</div></div>
        <div className="kpi" title="Prix d’achat maximal pour garder le seuil d’alerte (gain ≥ seuil en € OU marge ≥ seuil en %), à frais et travaux identiques.">
          <div className="l">{l.seller === 'justice' ? 'Enchère maximale' : 'Offre maximale'}</div>
          <div className={'v ' + (a.priceCaps.max >= l.price ? 'pos' : 'neg')}>{eur(a.priceCaps.max)}</div>
          <div className="s">{a.priceCaps.max >= l.price ? `prix affiché ${pct(1 - l.price / a.priceCaps.max)} sous le plafond` : `${pct(a.priceCaps.max / l.price - 1)} vs prix affiché`} · équilibre {keur(a.priceCaps.breakEven)}</div>
        </div>
        <div className="kpi"><div className="l">Cash nécessaire</div><div className={'v' + (a.cashNeeded > s.budget.cash ? ' neg' : '')}>{eur(a.cashNeeded)}</div><div className="s">revente en ~{a.resaleMonths} mois</div></div>
      </div>

      <div className="grid g2">
        <div className="panel">
          <div className="row between"><h2>Valeur de revente lot par lot</h2>{dirty && <button className="primary" onClick={() => save()}>Enregistrer et recalculer</button>}</div>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead><tr><th>Type</th><th>Libellé</th><th className="num">m²</th><th className="num">Bas</th><th className="num">Moyen</th><th className="num">Haut</th><th className="num">€/m²</th><th>Source</th><th className="num">Délai</th><th className="num">Valeur forcée</th><th></th></tr></thead>
              <tbody>
                {draft.lots.map((lot, i) => {
                  const v = a.lots.find((x) => x.lotId === lot.id);
                  return (
                    <tr key={lot.id}>
                      <td><select value={lot.type} onChange={(e) => editLot(i, { type: e.target.value as LotType })}>{Object.entries(LOT_LABELS).map(([k, lb]) => <option key={k} value={k}>{lb}</option>)}</select></td>
                      <td><input value={lot.label || ''} onChange={(e) => editLot(i, { label: e.target.value })} style={{ width: 120 }} /></td>
                      <td className="num"><input type="number" value={lot.surface ?? ''} onChange={(e) => editLot(i, { surface: e.target.value ? +e.target.value : undefined })} style={{ width: 60 }} /></td>
                      <td className="num">{v ? keur(v.low) : '…'}</td>
                      <td className="num"><b>{v ? eur(v.mid) : '…'}</b></td>
                      <td className="num">{v ? keur(v.high) : '…'}</td>
                      <td className="num">{v?.pricePerM2 ? num(v.pricePerM2.mid) : '—'}</td>
                      <td className="small">{v ? <>{SRC_LABEL[v.source]}<div className="muted">n={v.n} · conf. {pct(v.confidence)}</div></> : 'à recalculer'}</td>
                      <td className="num"><input type="number" value={lot.resaleMonths ?? s.resaleMonths[lot.type]} onChange={(e) => editLot(i, { resaleMonths: +e.target.value })} style={{ width: 50 }} /></td>
                      <td className="num"><input type="number" value={lot.resaleOverride ?? ''} placeholder="—" onChange={(e) => editLot(i, { resaleOverride: e.target.value ? +e.target.value : undefined })} style={{ width: 90 }} /></td>
                      <td><button className="danger" title="Retirer le lot" onClick={() => edit({ lots: draft.lots.filter((_, j) => j !== i) })}>×</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="row" style={{ marginTop: 6 }}>
            {(['garage', 'parking', 'cave', 'appartement'] as LotType[]).map((t) => (
              <button key={t} onClick={() => edit({ lots: [...draft.lots, { id: uid('l'), type: t }] })}>+ {LOT_LABELS[t]}</button>
            ))}
          </div>
          {a.lots.some((v) => v.note) && <ul className="plain small muted" style={{ marginTop: 6 }}>{[...new Set(a.lots.map((v) => v.note).filter(Boolean))].map((n) => <li key={n}>{n}</li>)}</ul>}
        </div>

        <div className="panel">
          <h2>Calcul du gain (scénario moyen)</h2>
          <table>
            <tbody>
              <tr><td>Σ valeurs des lots séparés</td><td className="num">{eur(a.total.mid)}</td></tr>
              <tr><td>− Agence à la revente ({s.fees.agenceRevPct} %)</td><td className="num neg">−{eur(c.resaleAgency)}</td></tr>
              <tr><td>− Prix d’achat affiché</td><td className="num neg">−{eur(l.price)}</td></tr>
              <tr><td>− Frais d’acquisition ({s.fees.useMdbRegime ? `régime MdB ${s.fees.notaireMdbPct}` : `droit commun ${s.fees.notaireDroitCommunPct}`} %)</td><td className="num neg">−{eur(c.acquisitionFees)}</td></tr>
              <tr><td>− Travaux</td><td className="num neg">−{eur(c.travaux)}</td></tr>
              <tr><td>− Diagnostics ({l.lots.length} lot{l.lots.length > 1 ? 's' : ''})</td><td className="num neg">−{eur(c.diagnostics)}</td></tr>
              {c.division > 0 && <tr><td>− Division / modificatif EDD</td><td className="num neg">−{eur(c.division)}</td></tr>}
              <tr><td>− Portage {a.resaleMonths} mois (charges, taxe foncière, intérêts)</td><td className="num neg">−{eur(c.carrying)}</td></tr>
              <tr><td><b>= Gain brut avant impôt</b></td><td className={'num ' + (a.gain.mid > 0 ? 'pos' : 'neg')}><b>{eur(a.gain.mid)}</b></td></tr>
              <tr><td className="muted">Ratio (Σ lots − frais − travaux − coûts de revente) / prix</td><td className="num">{num(a.ratio, 2)}</td></tr>
              <tr><td className="muted">Prix plafond : gain ≥ {keur(s.thresholds.minGain)} / marge ≥ {s.thresholds.minGainPct} % / gain nul</td><td className="num muted">{keur(a.priceCaps.forMinGain)} / {keur(a.priceCaps.forMinPct)} / {keur(a.priceCaps.breakEven)}</td></tr>
              <tr><td className="muted">Seuils d’alerte</td><td className="num muted">&gt; {keur(s.thresholds.minGain)} ou &gt; {s.thresholds.minGainPct} %</td></tr>
            </tbody>
          </table>
          <p className="small muted">Fourchette : bas {eur(a.gain.low)} · haut {eur(a.gain.high)} (scénarios sur la valeur des lots ; agence {pct(agency)} appliquée à chaque scénario).</p>
          {a.signals.length > 0 && <div style={{ marginTop: 6 }}>{a.signals.map((x) => <span key={x} className="tag good">{x}</span>)}</div>}
          {a.warnings.length > 0 && <div style={{ marginTop: 4 }}>{a.warnings.map((x) => <span key={x} className="tag warn">{x}</span>)}</div>}
        </div>
      </div>

      <div className="panel">
        <div className="row between">
          <h2>Comparables DVF</h2>
          <span className="small muted">
            DVF {stats.kind === 'demo' ? 'de démonstration (fictive)' : stats.kind === 'reel' ? 'réelle' : 'absente'} · ventes du {frDate(stats.since)} au {frDate(stats.refDate)}
            {l.address.lat == null && <> · <button onClick={geocode}>Géocoder l’adresse</button></>} {msg}
          </span>
        </div>
        <div className="kpis" style={{ marginTop: 8 }}>
          <div className="kpi"><div className="l">Appartements (commune) €/m²</div><div className="v">{num(stats.A.med)}</div><div className="s">P25 {num(stats.A.p25)} · P75 {num(stats.A.p75)} · n={stats.A.n}</div></div>
          <div className="kpi"><div className="l">Maisons (commune) €/m²</div><div className="v">{num(stats.M.med)}</div><div className="s">P25 {num(stats.M.p25)} · P75 {num(stats.M.p75)} · n={stats.M.n}</div></div>
          <div className="kpi"><div className="l">Dépendance vendue seule</div><div className="v">{eur(stats.D.med)}</div><div className="s">P25 {keur(stats.D.p25)} · P75 {keur(stats.D.p75)} · n={stats.D.n}</div></div>
          <div className="kpi" title="Valeur implicite = prix d’une vente appartement + 1 dépendance − surface × €/m² médian des appartements de même taille. L’écart avec la dépendance vendue seule mesure ce que rapporte la revente séparée.">
            <div className="l">Dépendance vendue AVEC un logement (implicite)</div>
            <div className="v">{eur(stats.implied.med)}</div>
            <div className="s">n={stats.implied.n}{stats.implied.n > 0 && stats.D.n > 0 ? <> · prime de vente séparée <b className={stats.D.med - stats.implied.med > 0 ? 'pos' : 'neg'}>{keur(stats.D.med - stats.implied.med)}</b></> : null}</div>
          </div>
        </div>
        <div className="tabs">
          {a.lots.map((v, i) => <button key={v.lotId} className={lotTab === i ? 'on' : ''} onClick={() => setLotTab(i)}>{l.lots[i]?.label || LOT_LABELS[v.type]} ({v.comparables.length})</button>)}
        </div>
        {lotVal && lotVal.comparables.length > 0 ? (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead><tr><th>Date</th><th>Adresse</th><th>CP</th><th>Type</th><th className="num">Surface</th><th className="num">Valeur</th><th className="num">€/m²</th><th className="num">Distance</th></tr></thead>
                <tbody>
                  {lotVal.comparables.map((m, i) => (
                    <tr key={i}><td>{frDate(m.date)}</td><td>{m.address}</td><td>{m.postalCode}</td><td>{m.type}</td><td className="num">{m.surface ? `${m.surface} m²` : '—'}</td><td className="num">{eur(m.value)}</td><td className="num">{m.pricePerM2 ? num(m.pricePerM2) : '—'}</td><td className="num">{m.distanceM != null ? `${m.distanceM} m` : '—'}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button style={{ marginTop: 6 }} onClick={() => downloadCsv(`comparables-${l.id}-${lotTab}`, lotVal.comparables as unknown as Record<string, unknown>[])}>Export CSV</button>
          </>
        ) : (
          <p className="muted">Aucun comparable pour ce lot ({lotVal ? SRC_LABEL[lotVal.source] : '—'}).</p>
        )}
      </div>

      <div className="grid g2">
        <div className="panel">
          <h2>Historique du prix affiché</h2>
          <p className="small muted">Saisir les baisses repérées (Castorus gratuit, captures, alertes). Une annonce qui baisse = vendeur motivé. Le connecteur Castorus premium remplira cette liste quand il sera activé.</p>
          <table>
            <thead><tr><th>Date</th><th className="num">Prix</th><th className="num">Variation</th><th>Source</th></tr></thead>
            <tbody>
              {l.priceHistory.map((p, i) => (
                <tr key={i}><td>{frDate(p.date)}</td><td className="num">{eur(p.price)}</td><td className="num">{i ? pct(p.price / l.priceHistory[i - 1].price - 1, 1) : '—'}</td><td className="muted">{p.source || ''}</td></tr>
              ))}
            </tbody>
          </table>
          <div className="row" style={{ marginTop: 6 }}>
            <input type="date" value={newPrice.date} onChange={(e) => setNewPrice({ ...newPrice, date: e.target.value })} />
            <input type="number" placeholder="nouveau prix" value={newPrice.price} onChange={(e) => setNewPrice({ ...newPrice, price: e.target.value })} />
            <button disabled={!newPrice.price} onClick={() => save({ price: +newPrice.price, priceHistory: [...l.priceHistory, { date: newPrice.date, price: +newPrice.price, source: 'saisie' }].sort((x, y) => x.date.localeCompare(y.date)) })}>Ajouter</button>
          </div>

          <h2 style={{ marginTop: 14 }}>Estimation externe (MeilleursAgents, agent, notaire)</h2>
          <div className="row">
            {(['low', 'mid', 'high'] as const).map((k) => (
              <label key={k} className="field">{{ low: 'Basse', mid: 'Moyenne', high: 'Haute' }[k]}
                <input type="number" value={draft.manualValuation?.[k] ?? ''} onChange={(e) => edit({ manualValuation: { low: 0, mid: 0, high: 0, source: 'MeilleursAgents', date: new Date().toISOString().slice(0, 10), ...draft.manualValuation, [k]: +e.target.value } })} />
              </label>
            ))}
            <label className="field">Source<input value={draft.manualValuation?.source ?? ''} onChange={(e) => edit({ manualValuation: { low: 0, mid: 0, high: 0, date: new Date().toISOString().slice(0, 10), ...draft.manualValuation, source: e.target.value } })} style={{ width: 120 }} /></label>
          </div>
          {l.manualValuation && l.manualValuation.mid > 0 && (
            <p className="small">Écart estimation externe / Σ lots DVF : <b>{pct(l.manualValuation.mid / a.total.mid - 1)}</b> ({l.manualValuation.source}, {frDate(l.manualValuation.date)}) — l’estimation externe porte souvent sur le bien principal seul : comparer au lot correspondant.</p>
          )}
        </div>

        <div className="panel">
          <div className="row between"><h2>Données de l’annonce</h2>{dirty && <button className="primary" onClick={() => save()}>Enregistrer</button>}</div>
          <div className="formgrid">
            <label className="field">Prix affiché<input type="number" value={draft.price} onChange={(e) => edit({ price: +e.target.value })} /></label>
            <label className="field">Surface principale<input type="number" value={draft.surface ?? ''} onChange={(e) => edit({ surface: e.target.value ? +e.target.value : undefined })} /></label>
            <label className="field">Travaux globaux<input type="number" value={draft.travaux ?? ''} onChange={(e) => edit({ travaux: e.target.value ? +e.target.value : undefined })} /></label>
            <label className="field">Charges (€/an)<input type="number" value={draft.chargesAnnual ?? ''} onChange={(e) => edit({ chargesAnnual: e.target.value ? +e.target.value : undefined })} /></label>
            <label className="field">DPE<select value={draft.dpe ?? ''} onChange={(e) => edit({ dpe: (e.target.value || undefined) as Listing['dpe'] })}><option value="">—</option>{'ABCDEFG'.split('').map((x) => <option key={x}>{x}</option>)}</select></label>
            <label className="field">Vendeur<select value={draft.seller} onChange={(e) => edit({ seller: e.target.value as Listing['seller'] })}>{Object.entries(SELLER_LABELS).map(([k, lb]) => <option key={k} value={k}>{lb}</option>)}</select></label>
            <label className="field">Lots en copro<input type="number" value={draft.coproLots ?? ''} onChange={(e) => edit({ coproLots: e.target.value ? +e.target.value : undefined })} /></label>
            <label className="field">N°<input value={draft.address.number ?? ''} onChange={(e) => editAddr({ number: e.target.value })} /></label>
            <label className="field">Rue<input value={draft.address.street ?? ''} onChange={(e) => editAddr({ street: e.target.value })} /></label>
            <label className="field">Code postal<input value={draft.address.postalCode} onChange={(e) => editAddr({ postalCode: e.target.value, dept: e.target.value.slice(0, 2) })} /></label>
            <label className="field">Ville<input value={draft.address.city} onChange={(e) => editAddr({ city: e.target.value })} /></label>
            <label className="field">Code INSEE<input value={draft.address.insee ?? ''} onChange={(e) => editAddr({ insee: e.target.value || undefined })} /></label>
            <label className="field">URL<input value={draft.url ?? ''} onChange={(e) => edit({ url: e.target.value })} /></label>
            <label className="field">Publication<input type="date" value={draft.publishedAt ?? ''} onChange={(e) => edit({ publishedAt: e.target.value })} /></label>
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <label className="row"><input type="checkbox" checked={!!draft.needsDivision} onChange={(e) => edit({ needsDivision: e.target.checked })} /> Lots à créer (division / modificatif EDD)</label>
            <label className="row"><input type="checkbox" checked={!!draft.coproProcedure} onChange={(e) => edit({ coproProcedure: e.target.checked })} /> Copro en difficulté</label>
          </div>
          <label className="field" style={{ marginTop: 8 }}>Notes<textarea rows={3} value={draft.notes ?? ''} onChange={(e) => edit({ notes: e.target.value })} /></label>
          <details style={{ marginTop: 6 }}><summary className="muted">Description de l’annonce</summary><p style={{ whiteSpace: 'pre-wrap' }}>{l.description}</p></details>
        </div>
      </div>

      <div className="panel">
        <div className="row between"><h2>Checklist achat-revente</h2><span className="muted small">{done}/{checklist.length} vérifiés</span></div>
        <div className="grid g2">
          {[...new Set(checklist.map((x) => x.group))].map((g) => (
            <div key={g}>
              <h3>{g}</h3>
              {checklist.filter((x) => x.group === g).map((x) => (
                <label key={x.id} className="check">
                  <input type="checkbox" checked={!!l.checklist?.[x.id]} onChange={() => toggleCheck(x.id)} />
                  <span>{x.critical && <span className="tag bad">bloquant</span>}{x.label}{x.detail && <div className="small muted">{x.detail}</div>}</span>
                </label>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <h2>Simulation achat-revente</h2>
        <SimPanel key={JSON.stringify(sim)} initial={sim} settings={s} name={l.id} />
      </div>
    </>
  );
}
