'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Deal, Settings } from '@/lib/types';
import { parallelCapacity, project, upcomingInflows } from '@/lib/treasury';
import { dealMetrics, STAGES } from '@/lib/deals';
import { api } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import { STAGE_LABELS } from '@/lib/defaults';
import { eur, frDate, keur, uid } from '@/lib/util';
import { LineChart } from './Charts';

export default function TreasuryView({ deals, settings }: { deals: Deal[]; settings: Settings }) {
  const router = useRouter();
  const [s, setS] = useState<Settings>(settings);
  const [months, setMonths] = useState(24);
  const [includeOffers, setIncludeOffers] = useState(false);
  const [exclude, setExclude] = useState<Set<string>>(new Set());
  const [dirty, setDirty] = useState(false);
  const t = s.treasury;
  const setT = (p: Partial<Settings['treasury']>) => {
    setS({ ...s, treasury: { ...t, ...p } });
    setDirty(true);
  };

  const inflows = useMemo(() => upcomingInflows(deals, s, new Date().toISOString().slice(0, 10), includeOffers), [deals, s, includeOffers]);
  const base = useMemo(() => project({ s, deals, months, includeOffers }), [s, deals, months, includeOffers]);
  const without = useMemo(() => (exclude.size ? project({ s, deals, months, includeOffers, exclude }) : null), [s, deals, months, includeOffers, exclude]);
  const scen = useMemo(() => s.group.scenarios.map((sc) => ({ sc, p: project({ s, deals, months, includeOffers, scenario: sc }) })), [s, deals, months, includeOffers]);

  const metrics = deals.map((d) => ({ d, m: dealMetrics(d, s) }));
  const engaged = metrics.reduce((a, x) => a + x.m.cashEngaged, 0);
  const bfr = s.group.allocation.bfrRecurrent;
  const free = t.startCash - t.reserveSecurite - bfr;

  async function saveSettings() {
    await api('/api/settings', 'PUT', s);
    setDirty(false);
    router.refresh();
  }

  const byStage = STAGES.map((st) => {
    const ds = metrics.filter((x) => x.d.stage === st);
    const active = st === 'signe' || st === 'revente';
    return { st, n: ds.length, cash: ds.reduce((a, x) => a + (active ? x.m.cashEngaged : st === 'clos' ? 0 : x.m.equity), 0), gain: ds.reduce((a, x) => a + (x.m.realizedGain ?? x.m.plannedGain), 0), active };
  });

  return (
    <>
      <div className="kpis">
        <div className="kpi"><div className="l">Cash disponible</div><div className="v">{eur(t.startCash)}</div><div className="s">+ {eur(t.monthlySavings)}/mois d’épargne</div></div>
        <div className="kpi"><div className="l">Réserve de sécurité</div><div className="v">{eur(t.reserveSecurite)}</div><div className="s">+ BFR activités récurrentes {keur(bfr)}</div></div>
        <div className="kpi"><div className="l">Cash libre pour l’A/R</div><div className={'v ' + (free > 0 ? 'pos' : 'neg')}>{eur(free)}</div><div className="s">après réserve et BFR</div></div>
        <div className="kpi"><div className="l">Cash immobilisé dans les opérations</div><div className="v">{eur(engaged)}</div><div className="s">en plus du cash disponible</div></div>
        {s.group.scenarios.map((sc) => (
          <div key={sc.id} className="kpi"><div className="l">Coups en parallèle ({sc.label}, {keur(sc.cashPerDeal)}/coup)</div><div className="v">{parallelCapacity(t.startCash, t.reserveSecurite, bfr, sc.cashPerDeal)}</div></div>
        ))}
      </div>

      <div className="panel">
        <div className="row between">
          <h2>Trajectoire de trésorerie ({months} mois)</h2>
          <div className="row">
            <select value={months} onChange={(e) => setMonths(+e.target.value)}><option value={12}>12 mois</option><option value={24}>24 mois</option><option value={36}>36 mois</option></select>
            <label className="row small"><input type="checkbox" checked={includeOffers} onChange={(e) => setIncludeOffers(e.target.checked)} /> Inclure les offres en cours</label>
            <button onClick={() => downloadCsv('tresorerie', base.labels.map((l, i) => ({ mois: l, pipeline_seul: base.cash[i], ...Object.fromEntries(scen.map(({ sc, p }) => [sc.label, p.cash[i]])), cash_immobilise: base.engaged[i] })))}>Export CSV</button>
          </div>
        </div>
        <LineChart
          xLabels={base.labels}
          series={[
            { label: 'Pipeline seul (aucun nouveau coup)', color: 'var(--c2)', values: base.cash },
            ...(without ? [{ label: 'Sans les ventes décochées', color: 'var(--bad)', values: without.cash, dashed: true }] : []),
            ...scen.map(({ sc, p }) => ({ label: `Scénario ${sc.label}`, color: sc.color, values: p.cash })),
          ]}
          refLines={[{ value: t.reserveSecurite, label: 'réserve de sécurité', color: 'var(--warn)' }]}
          height={260}
        />
        <table style={{ marginTop: 8 }}>
          <thead><tr><th>Scénario</th><th className="num">Coups/an visés</th><th className="num">Cash/coup</th><th className="num">Durée</th><th className="num">Gain/coup</th><th className="num">Coups lancés</th><th className="num">Gains A/R cumulés</th><th className="num">Point bas</th><th className="num">Cash à {months} mois</th></tr></thead>
          <tbody>
            <tr><td>Pipeline seul</td><td className="num">—</td><td className="num">—</td><td className="num">—</td><td className="num">—</td><td className="num">0</td><td className="num">—</td><td className={'num' + (base.minCash < t.reserveSecurite ? ' neg' : '')}>{eur(base.minCash)}</td><td className="num">{eur(base.endCash)}</td></tr>
            {scen.map(({ sc, p }) => (
              <tr key={sc.id}><td><span style={{ color: sc.color }}>●</span> {sc.label}</td><td className="num">{sc.dealsPerYear}</td><td className="num">{keur(sc.cashPerDeal)}</td><td className="num">{sc.monthsPerDeal} mois</td><td className="num">{keur(sc.avgGainPerDeal)}</td><td className="num">{p.launched}</td><td className="num pos">{eur(p.gains)}</td><td className={'num' + (p.minCash < t.reserveSecurite ? ' neg' : '')}>{eur(p.minCash)}</td><td className="num"><b>{eur(p.endCash)}</b></td></tr>
            ))}
          </tbody>
        </table>
        <p className="small muted">Un nouveau coup n’est lancé que si le cash reste au-dessus de la réserve de sécurité après l’apport. Scénarios modifiables dans l’écran Groupe.</p>
      </div>

      <div className="grid g2">
        <div className="panel">
          <h2>Entrées de cash à venir (ventes de lots)</h2>
          <p className="small muted">Décocher une vente pour mesurer son impact (ex. sortie du garage New Port).</p>
          <table>
            <thead><tr><th></th><th>Opération / lot</th><th>Mois</th><th className="num">Prix</th><th className="num">Net vendeur</th><th className="num">Remb. emprunt</th><th className="num">Cash libéré</th></tr></thead>
            <tbody>
              {inflows.map((f) => (
                <tr key={f.key} style={exclude.has(f.key) ? { opacity: 0.45 } : undefined}>
                  <td><input type="checkbox" checked={!exclude.has(f.key)} onChange={() => { const e = new Set(exclude); if (e.has(f.key)) e.delete(f.key); else e.add(f.key); setExclude(e); }} /></td>
                  <td className="wrap">{f.lot}<div className="small muted">{f.deal} · {f.status.replace('_', ' ')}</div></td>
                  <td>{frDate(f.date).slice(3)}</td>
                  <td className="num">{eur(f.gross)}</td>
                  <td className="num">{eur(f.net)}</td>
                  <td className="num neg">{f.repayment ? '−' + eur(f.repayment) : '—'}</td>
                  <td className={'num ' + (f.net - f.repayment >= 0 ? 'pos' : 'neg')}><b>{eur(f.net - f.repayment)}</b></td>
                </tr>
              ))}
              {!inflows.length && <tr><td colSpan={7} className="muted">Aucune vente prévue (opérations signées ou en revente).</td></tr>}
            </tbody>
          </table>
          {without && <p className="small">Impact des ventes décochées sur le cash à {months} mois : <b className="neg">{eur(without.endCash - base.endCash)}</b> · point bas {eur(without.minCash)} (au lieu de {eur(base.minCash)}).</p>}
        </div>

        <div className="panel">
          <h2>Cash bloqué par phase</h2>
          <table>
            <thead><tr><th>Phase</th><th className="num">Opérations</th><th className="num">Cash</th><th className="num">Gain prévu / réalisé</th></tr></thead>
            <tbody>
              {byStage.map((x) => (
                <tr key={x.st}><td>{STAGE_LABELS[x.st]}</td><td className="num">{x.n}</td><td className="num">{x.st === 'clos' ? '—' : eur(x.cash)}<div className="small muted">{x.st === 'clos' ? '' : x.active ? 'engagé' : 'apport à prévoir'}</div></td><td className="num">{eur(x.gain)}</td></tr>
              ))}
            </tbody>
          </table>
          <h2 style={{ marginTop: 14 }}>Hypothèses</h2>
          <div className="formgrid">
            <label className="field">Cash disponible aujourd’hui<input type="number" value={t.startCash} step={1000} onChange={(e) => setT({ startCash: +e.target.value })} /></label>
            <label className="field">Épargne nette mensuelle<input type="number" value={t.monthlySavings} step={250} onChange={(e) => setT({ monthlySavings: +e.target.value })} /></label>
            <label className="field">Réserve de sécurité<input type="number" value={t.reserveSecurite} step={1000} onChange={(e) => setT({ reserveSecurite: +e.target.value })} /></label>
          </div>
          <h3 style={{ marginTop: 10 }}>Mouvements ponctuels</h3>
          <table>
            <thead><tr><th>Libellé</th><th className="num">Mois (0 = maintenant)</th><th className="num">Montant (+/−)</th><th></th></tr></thead>
            <tbody>
              {t.events.map((e, i) => (
                <tr key={e.id}>
                  <td><input value={e.label} onChange={(x) => setT({ events: t.events.map((y, j) => (j === i ? { ...y, label: x.target.value } : y)) })} /></td>
                  <td className="num"><input type="number" value={e.month} style={{ width: 60 }} onChange={(x) => setT({ events: t.events.map((y, j) => (j === i ? { ...y, month: +x.target.value } : y)) })} /></td>
                  <td className="num"><input type="number" value={e.amount} step={1000} onChange={(x) => setT({ events: t.events.map((y, j) => (j === i ? { ...y, amount: +x.target.value } : y)) })} /></td>
                  <td><button className="danger" onClick={() => setT({ events: t.events.filter((_, j) => j !== i) })}>×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="row" style={{ marginTop: 6 }}>
            <button onClick={() => setT({ events: [...t.events, { id: uid('e'), label: 'Ex. dividende, impôt, apport', month: 3, amount: -5000 }] })}>+ Mouvement</button>
            <button className="primary" disabled={!dirty} onClick={saveSettings}>Enregistrer les hypothèses</button>
          </div>
        </div>
      </div>
    </>
  );
}
