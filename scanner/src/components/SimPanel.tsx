'use client';
import { useMemo, useState } from 'react';
import type { Settings } from '@/lib/types';
import { simulate, type SimInput } from '@/lib/simulation';
import { downloadCsv } from '@/lib/csv';
import { eur, keur, num, pct } from '@/lib/util';
import { LineChart } from './Charts';

const N = ({ v, set, step = 1000, w = 100 }: { v: number; set: (x: number) => void; step?: number; w?: number }) => (
  <input type="number" value={Number.isFinite(v) ? v : 0} step={step} style={{ width: w }} onChange={(e) => set(parseFloat(e.target.value) || 0)} />
);

export default function SimPanel({ initial, settings, name }: { initial: SimInput; settings: Settings; name: string }) {
  const [inp, setInp] = useState<SimInput>(initial);
  const [budget, setBudget] = useState(settings.budget.cash - settings.budget.reserve);
  const r = useMemo(() => simulate(inp, settings, budget), [inp, settings, budget]);
  const set = <K extends keyof SimInput>(k: K, v: SimInput[K]) => setInp({ ...inp, [k]: v });
  const setLot = (i: number, patch: Partial<SimInput['lots'][number]>) => set('lots', inp.lots.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  return (
    <div>
      <div className="formgrid">
        <label className="field">Prix d’achat<N v={inp.price} set={(v) => set('price', v)} /></label>
        <label className="field">Frais d’acquisition<N v={inp.acquisitionFees} set={(v) => set('acquisitionFees', v)} step={500} /></label>
        <label className="field">Travaux<N v={inp.travaux} set={(v) => set('travaux', v)} step={500} /></label>
        <label className="field">Mois des travaux<N v={inp.travauxMonth} set={(v) => set('travauxMonth', v)} step={1} w={60} /></label>
        <label className="field">Emprunt<N v={inp.loanAmount} set={(v) => set('loanAmount', v)} step={5000} /></label>
        <label className="field">Taux (%/an)<N v={inp.loanRate} set={(v) => set('loanRate', v)} step={0.1} w={60} /></label>
        <label className="field">Remboursement
          <select value={inp.loanRepayment} onChange={(e) => set('loanRepayment', e.target.value as SimInput['loanRepayment'])}>
            <option value="prorata">À chaque vente (prorata)</option><option value="in_fine">À la dernière vente</option>
          </select>
        </label>
        <label className="field">Portage (€/mois)<N v={inp.chargesMonthly} set={(v) => set('chargesMonthly', v)} step={50} /></label>
        <label className="field">Budget disponible (rotation)<N v={budget} set={setBudget} step={5000} /></label>
      </div>
      <table style={{ marginTop: 10 }}>
        <thead><tr><th>Lot</th><th className="num">Prix de revente</th><th className="num">Mois de vente</th><th className="num">Frais de vente %</th><th></th></tr></thead>
        <tbody>
          {inp.lots.map((l, i) => (
            <tr key={i}>
              <td><input value={l.label} onChange={(e) => setLot(i, { label: e.target.value })} /></td>
              <td className="num"><N v={l.resale} set={(v) => setLot(i, { resale: v })} step={1000} /></td>
              <td className="num"><N v={l.month} set={(v) => setLot(i, { month: Math.max(1, v) })} step={1} w={60} /></td>
              <td className="num"><N v={l.saleCostsPct} set={(v) => setLot(i, { saleCostsPct: v })} step={0.5} w={60} /></td>
              <td><button className="danger" onClick={() => set('lots', inp.lots.filter((_, j) => j !== i))}>×</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row" style={{ margin: '6px 0 10px' }}>
        <button onClick={() => set('lots', [...inp.lots, { label: 'Lot', resale: 10000, month: 3, saleCostsPct: settings.fees.agenceRevPct }])}>+ Lot</button>
        <button onClick={() => setInp(initial)}>Rétablir</button>
      </div>

      <div className="kpis">
        <div className="kpi"><div className="l">Gain brut (avant IS)</div><div className={'v ' + (r.grossGain >= 0 ? 'pos' : 'neg')}>{eur(r.grossGain)}</div><div className="s">{r.tva ? `dont TVA sur marge −${keur(r.tva)}` : 'TVA sur marge : non'}</div></div>
        <div className="kpi"><div className="l">Gain net après IS</div><div className={'v ' + (r.netGain >= 0 ? 'pos' : 'neg')}>{eur(r.netGain)}</div><div className="s">IS {eur(r.tax)}</div></div>
        <div className="kpi"><div className="l">Besoin en fonds de roulement (pic)</div><div className="v">{eur(r.peakCash)}</div><div className="s">cash maximal immobilisé</div></div>
        <div className="kpi"><div className="l">TRI annualisé (fonds propres)</div><div className="v">{pct(r.irr)}</div><div className="s">multiple {num(r.moic, 2)}</div></div>
        <div className="kpi"><div className="l">Durée</div><div className="v">{r.duration} mois</div><div className="s">rendement annualisé {pct(r.roiAnnual)}</div></div>
        <div className="kpi"><div className="l">Rotation avec {keur(budget)}</div><div className="v">{r.rotation.parallel} en parallèle</div><div className="s">{num(r.rotation.perYear, 1)} opérations/an · {keur(r.rotation.annualGain)}/an</div></div>
      </div>

      <LineChart
        xLabels={r.rows.map((x) => `M${x.m}`)}
        series={[
          { label: 'Trésorerie cumulée de l’opération', color: 'var(--c1)', values: r.rows.map((x) => x.cumul), area: true },
          { label: 'Flux du mois', color: 'var(--c3)', values: r.rows.map((x) => x.net), dashed: true },
        ]}
        refLines={[{ value: -budget, label: `budget −${keur(budget)}`, color: 'var(--bad)' }]}
      />

      <details style={{ marginTop: 8 }}>
        <summary className="muted">Cash-flow mensuel détaillé</summary>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead><tr><th>Mois</th><th className="num">Achat + frais</th><th className="num">Emprunt</th><th className="num">Travaux</th><th className="num">Portage</th><th className="num">Intérêts</th><th className="num">Ventes nettes</th><th className="num">Remboursement</th><th className="num">Impôts</th><th className="num">Net</th><th className="num">Cumul</th></tr></thead>
            <tbody>
              {r.rows.map((x) => (
                <tr key={x.m}>
                  <td>M{x.m}</td>
                  {[x.achat, x.emprunt, x.travaux, x.portage, x.interets, x.ventes, x.remboursement, x.impots, x.net, x.cumul].map((v, i) => <td key={i} className={'num ' + (v < 0 ? 'neg' : v > 0 ? 'pos' : 'muted')}>{v ? eur(v) : '·'}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button style={{ marginTop: 6 }} onClick={() => downloadCsv(`simulation-${name}`, r.rows.map((x) => ({ mois: x.m, achat: Math.round(x.achat), emprunt: Math.round(x.emprunt), travaux: Math.round(x.travaux), portage: Math.round(x.portage), interets: Math.round(x.interets), ventes: Math.round(x.ventes), remboursement: Math.round(x.remboursement), impots: Math.round(x.impots), net: Math.round(x.net), cumul: Math.round(x.cumul) })))}>Export CSV</button>
      </details>
      <p className="muted small">IS au taux réduit {settings.tax.isReducedRate} % jusqu’à {keur(settings.tax.isReducedCap)} puis {settings.tax.isRate} %, calculé sur l’opération seule (en réalité sur le résultat de la société). TVA sur marge : {settings.tax.tvaSurMarge ? 'activée' : 'désactivée'} (Paramètres).</p>
    </div>
  );
}
