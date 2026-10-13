'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Deal, DealLot, DealStage, LotType, Settings } from '@/lib/types';
import { dealMetrics, STAGES } from '@/lib/deals';
import { api } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import { COMPANY_LABELS, LOT_LABELS, STAGE_LABELS } from '@/lib/defaults';
import { eur, frDate, keur, pct, uid } from '@/lib/util';

const LOT_STATUS: Record<DealLot['status'], string> = { a_vendre: 'À vendre', en_vente: 'En vente', sous_compromis: 'Sous compromis', vendu: 'Vendu', conserve: 'Conservé' };

const blank = (): Deal => ({
  id: uid('d'), name: 'Nouvelle opération', company: 'immobiliere', stage: 'repere', city: '', purchasePrice: 0, acquisitionFees: 0, travaux: 0,
  loanAmount: 0, loanRate: 0, loanRepayment: 'prorata', createdAt: new Date().toISOString().slice(0, 10), lots: [],
});

export default function PipelineBoard({ deals, settings: s }: { deals: Deal[]; settings: Settings }) {
  const router = useRouter();
  const [sel, setSel] = useState<Deal | null>(null);
  const [view, setView] = useState<'kanban' | 'table'>('kanban');
  const [showClosed, setShowClosed] = useState(true);
  const metrics = new Map(deals.map((d) => [d.id, dealMetrics(d, s)]));
  const visible = deals.filter((d) => showClosed || (d.stage !== 'clos' && d.stage !== 'abandonne'));

  const active = deals.filter((d) => d.stage === 'signe' || d.stage === 'revente');
  const prospects = deals.filter((d) => ['repere', 'visite', 'offre'].includes(d.stage));
  const closed = deals.filter((d) => d.stage === 'clos');
  const engaged = active.reduce((a, d) => a + metrics.get(d.id)!.cashEngaged, 0);
  const sum = (ds: Deal[], f: (m: ReturnType<typeof dealMetrics>) => number) => ds.reduce((a, d) => a + f(metrics.get(d.id)!), 0);

  async function save(d: Deal) {
    await api('/api/deals', 'POST', d);
    setSel(null);
    router.refresh();
  }
  async function move(d: Deal, stage: DealStage) {
    await api('/api/deals', 'POST', { ...d, stage, signedAt: stage === 'signe' && !d.signedAt ? new Date().toISOString().slice(0, 10) : d.signedAt });
    router.refresh();
  }
  async function remove(d: Deal) {
    if (!confirm(`Supprimer « ${d.name} » ?`)) return;
    await api(`/api/deals/${d.id}`, 'DELETE');
    setSel(null);
    router.refresh();
  }

  function exportCsv() {
    downloadCsv('pipeline', deals.map((d) => {
      const m = metrics.get(d.id)!;
      return {
        operation: d.name, societe: COMPANY_LABELS[d.company], etape: STAGE_LABELS[d.stage], ville: d.city, prix_achat: d.purchasePrice, frais: d.acquisitionFees, travaux: d.travaux,
        emprunt: d.loanAmount, apport: Math.round(m.equity), cash_engage: Math.round(m.cashEngaged), revente_prevue: Math.round(m.plannedRevenue), gain_prevu: Math.round(m.plannedGain),
        ventes_realisees: Math.round(m.soldRevenue), gain_realise: m.realizedGain == null ? '' : Math.round(m.realizedGain), avancement_pct: Math.round(m.progress * 100), signature: d.signedAt || '',
        lots: d.lots.map((l) => `${l.label} (${LOT_STATUS[l.status]}${l.actualResale ? ' ' + l.actualResale : ''})`).join(' | '),
      };
    }));
  }

  return (
    <>
      <div className="kpis">
        <div className="kpi"><div className="l">Cash engagé (signé / en revente)</div><div className="v">{eur(engaged)}</div><div className="s">{active.length} opération(s) · emprunt restant {keur(sum(active, (m) => m.loanOutstanding))}</div></div>
        <div className="kpi"><div className="l">Apport à prévoir (repéré → offre)</div><div className="v">{eur(sum(prospects, (m) => m.equity))}</div><div className="s">{prospects.length} piste(s)</div></div>
        <div className="kpi"><div className="l">Gain prévu (opérations en cours)</div><div className="v pos">{eur(sum(active, (m) => m.plannedGain))}</div><div className="s">ventes encaissées {keur(sum(active, (m) => m.soldRevenue))}</div></div>
        <div className="kpi"><div className="l">Gains réalisés (clos)</div><div className="v pos">{eur(sum(closed, (m) => m.realizedGain ?? 0))}</div><div className="s">prévu à l’origine {keur(sum(closed, (m) => m.plannedGain))}</div></div>
      </div>
      <div className="row between" style={{ marginBottom: 8 }}>
        <div className="tabs" style={{ marginBottom: 0, borderBottom: 'none' }}>
          <button className={view === 'kanban' ? 'on' : ''} onClick={() => setView('kanban')}>Tableau de bord</button>
          <button className={view === 'table' ? 'on' : ''} onClick={() => setView('table')}>Liste détaillée</button>
        </div>
        <div className="row">
          <label className="row small"><input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} /> Afficher les clos</label>
          <button onClick={exportCsv}>Export CSV</button>
          <button className="primary" onClick={() => setSel(blank())}>+ Nouvelle opération</button>
        </div>
      </div>

      {view === 'kanban' ? (
        <div className="kanban">
          {STAGES.filter((st) => showClosed || st !== 'clos').map((st) => {
            const ds = visible.filter((d) => d.stage === st);
            return (
              <div key={st} className="col">
                <div className="row between"><b>{STAGE_LABELS[st]}</b><span className="muted small">{ds.length}</span></div>
                <div className="small muted" style={{ marginBottom: 6 }}>{keur(ds.reduce((a, d) => a + (st === 'signe' || st === 'revente' ? metrics.get(d.id)!.cashEngaged : metrics.get(d.id)!.equity), 0))} {st === 'signe' || st === 'revente' ? 'engagés' : st === 'clos' ? '' : 'à engager'}</div>
                {ds.map((d) => {
                  const m = metrics.get(d.id)!;
                  return (
                    <div key={d.id} className="card" onClick={() => setSel(structuredClone(d))}>
                      <div style={{ fontWeight: 600 }}>{d.name}</div>
                      <div className="small muted">{COMPANY_LABELS[d.company].replace(' TUÉ et Fils', '')} · {keur(d.purchasePrice)}</div>
                      <div className="small">{m.realizedGain != null ? <>réalisé <b className="pos">{keur(m.realizedGain)}</b> / prévu {keur(m.plannedGain)}</> : <>gain prévu <b className={m.plannedGain > 0 ? 'pos' : 'neg'}>{keur(m.plannedGain)}</b></>}</div>
                      {d.lots.length > 1 && (
                        <>
                          <div className="bar" style={{ marginTop: 4 }}><div style={{ width: `${m.progress * 100}%`, background: 'var(--good)' }} /></div>
                          <div className="small muted">{d.lots.filter((l) => l.status === 'vendu').length}/{d.lots.length} lots vendus</div>
                        </>
                      )}
                      <div className="row" style={{ marginTop: 4, gap: 4 }} onClick={(e) => e.stopPropagation()}>
                        {STAGES.indexOf(st) > 0 && <button className="small" onClick={() => move(d, STAGES[STAGES.indexOf(st) - 1])}>←</button>}
                        {STAGES.indexOf(st) < STAGES.length - 1 && <button className="small" onClick={() => move(d, STAGES[STAGES.indexOf(st) + 1])}>→ {STAGE_LABELS[STAGES[STAGES.indexOf(st) + 1]]}</button>}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="tablewrap">
          <table>
            <thead><tr><th>Opération</th><th>Étape</th><th>Société</th><th className="num">Prix</th><th className="num">Apport</th><th className="num">Cash engagé</th><th className="num">Revente prévue</th><th className="num">Gain prévu</th><th className="num">Encaissé</th><th className="num">Gain réalisé</th><th className="num">Écart</th><th>Lots</th></tr></thead>
            <tbody>
              {visible.map((d) => {
                const m = metrics.get(d.id)!;
                return (
                  <tr key={d.id} className="click" onClick={() => setSel(structuredClone(d))}>
                    <td>{d.name}<div className="small muted">{d.city} · signé {frDate(d.signedAt)}</div></td>
                    <td>{STAGE_LABELS[d.stage]}</td>
                    <td className="small">{COMPANY_LABELS[d.company]}</td>
                    <td className="num">{eur(d.purchasePrice)}</td>
                    <td className="num">{eur(m.equity)}</td>
                    <td className="num">{eur(m.cashEngaged)}</td>
                    <td className="num">{eur(m.plannedRevenue)}</td>
                    <td className={'num ' + (m.plannedGain > 0 ? 'pos' : 'neg')}>{eur(m.plannedGain)}</td>
                    <td className="num">{eur(m.soldRevenue)}</td>
                    <td className="num pos">{m.realizedGain == null ? '—' : eur(m.realizedGain)}</td>
                    <td className="num">{m.realizedGain == null ? '—' : pct(m.realizedGain / m.plannedGain - 1)}</td>
                    <td className="wrap small">{d.lots.map((l) => <span key={l.id} className={'tag ' + (l.status === 'vendu' ? 'good' : l.status === 'sous_compromis' ? 'warn' : 'grey')}>{l.label}</span>)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {sel && <DealEditor deal={sel} settings={s} onSave={save} onCancel={() => setSel(null)} onDelete={remove} isNew={!deals.some((d) => d.id === sel.id)} />}
    </>
  );
}

function DealEditor({ deal, settings: s, onSave, onCancel, onDelete, isNew }: { deal: Deal; settings: Settings; onSave: (d: Deal) => void; onCancel: () => void; onDelete: (d: Deal) => void; isNew: boolean }) {
  const [d, setD] = useState<Deal>(deal);
  const m = dealMetrics(d, s);
  const set = (p: Partial<Deal>) => setD({ ...d, ...p });
  const setLot = (i: number, p: Partial<DealLot>) => set({ lots: d.lots.map((l, j) => (j === i ? { ...l, ...p } : l)) });
  const n = (v: number | undefined, f: (x: number) => void, w = 100) => <input type="number" value={v ?? ''} style={{ width: w }} onChange={(e) => f(e.target.value === '' ? 0 : +e.target.value)} />;
  return (
    <div className="panel" style={{ marginTop: 12, borderColor: 'var(--accent)' }}>
      <div className="row between">
        <h2>{isNew ? 'Nouvelle opération' : d.name}</h2>
        <div className="row">
          {d.listingId && <Link href={`/opportunites/${d.listingId}`}>Fiche annonce</Link>}
          {!isNew && <button className="danger" onClick={() => onDelete(d)}>Supprimer</button>}
          <button onClick={onCancel}>Annuler</button>
          <button className="primary" onClick={() => onSave(d)}>Enregistrer</button>
        </div>
      </div>
      <div className="formgrid">
        <label className="field">Nom<input value={d.name} onChange={(e) => set({ name: e.target.value })} /></label>
        <label className="field">Ville<input value={d.city} onChange={(e) => set({ city: e.target.value })} /></label>
        <label className="field">Société<select value={d.company} onChange={(e) => set({ company: e.target.value as Deal['company'] })}>{Object.entries(COMPANY_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label className="field">Étape<select value={d.stage} onChange={(e) => set({ stage: e.target.value as DealStage })}>{Object.entries(STAGE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label className="field">Date de signature<input type="date" value={d.signedAt ?? ''} onChange={(e) => set({ signedAt: e.target.value || undefined })} /></label>
        <label className="field">Prix d’achat{n(d.purchasePrice, (x) => set({ purchasePrice: x }))}</label>
        <label className="field">Frais d’acquisition{n(d.acquisitionFees, (x) => set({ acquisitionFees: x }))}</label>
        <label className="field">Travaux{n(d.travaux, (x) => set({ travaux: x }))}</label>
        <label className="field">Emprunt{n(d.loanAmount, (x) => set({ loanAmount: x }))}</label>
        <label className="field">Taux %{n(d.loanRate, (x) => set({ loanRate: x }), 60)}</label>
        <label className="field">Remboursement<select value={d.loanRepayment} onChange={(e) => set({ loanRepayment: e.target.value as Deal['loanRepayment'] })}><option value="prorata">À chaque vente</option><option value="in_fine">À la dernière vente</option></select></label>
      </div>
      <h3 style={{ marginTop: 12 }}>Revente par lot</h3>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead><tr><th>Lot</th><th>Type</th><th className="num">Revente prévue</th><th className="num">Mois prévu</th><th>Statut</th><th className="num">Prix réel</th><th>Date de vente</th><th className="num">Frais vente %</th><th></th></tr></thead>
          <tbody>
            {d.lots.map((l, i) => (
              <tr key={l.id}>
                <td><input value={l.label} onChange={(e) => setLot(i, { label: e.target.value })} /></td>
                <td><select value={l.type} onChange={(e) => setLot(i, { type: e.target.value as LotType })}>{Object.entries(LOT_LABELS).map(([k, lb]) => <option key={k} value={k}>{lb}</option>)}</select></td>
                <td className="num">{n(l.plannedResale, (x) => setLot(i, { plannedResale: x }))}</td>
                <td className="num">{n(l.plannedMonth, (x) => setLot(i, { plannedMonth: x }), 50)}</td>
                <td><select value={l.status} onChange={(e) => setLot(i, { status: e.target.value as DealLot['status'], soldAt: e.target.value === 'vendu' && !l.soldAt ? new Date().toISOString().slice(0, 10) : l.soldAt })}>{Object.entries(LOT_STATUS).map(([k, lb]) => <option key={k} value={k}>{lb}</option>)}</select></td>
                <td className="num"><input type="number" value={l.actualResale ?? ''} style={{ width: 100 }} onChange={(e) => setLot(i, { actualResale: e.target.value ? +e.target.value : undefined })} /></td>
                <td><input type="date" value={l.soldAt ?? ''} onChange={(e) => setLot(i, { soldAt: e.target.value || undefined })} /></td>
                <td className="num"><input type="number" value={l.saleCostsPct ?? s.fees.agenceRevPct} style={{ width: 55 }} onChange={(e) => setLot(i, { saleCostsPct: +e.target.value })} /></td>
                <td><button className="danger" onClick={() => set({ lots: d.lots.filter((_, j) => j !== i) })}>×</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button style={{ marginTop: 6 }} onClick={() => set({ lots: [...d.lots, { id: uid('dl'), label: 'Lot', type: 'garage', plannedResale: 0, plannedMonth: 3, status: 'a_vendre' }] })}>+ Lot</button>
      <label className="field" style={{ marginTop: 8 }}>Notes<textarea rows={2} value={d.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} /></label>
      <p className="small muted" style={{ marginTop: 8 }}>
        Coût total {eur(m.cost)} · apport {eur(m.equity)} · intérêts estimés {eur(m.interest)} · revente nette prévue {eur(m.plannedRevenue)} → <b>gain prévu {eur(m.plannedGain)}</b>
        {m.realizedGain != null && <> · <b className="pos">gain réalisé {eur(m.realizedGain)}</b></>} · cash engagé {eur(m.cashEngaged)}
      </p>
    </div>
  );
}
