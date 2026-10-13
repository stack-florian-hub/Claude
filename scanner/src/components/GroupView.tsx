'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Activity, Deal, GroupData, Settings, Swot } from '@/lib/types';
import { BCG_GROWTH_THRESHOLD, BCG_SHARE_THRESHOLD, netResult, porterIntensity, quadrant, QUADRANT_ADVICE, QUADRANT_LABELS, recommendAllocation, returnOnCapital } from '@/lib/group';
import { project } from '@/lib/treasury';
import { api } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import { COMPANY_LABELS } from '@/lib/defaults';
import { eur, keur, pct } from '@/lib/util';
import { HBar, LineChart } from './Charts';

const COLORS = ['var(--c1)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c2)'];

function Bcg({ acts }: { acts: Activity[] }) {
  const W = 520, H = 340, L = 50, R = 16, T = 16, B = 40;
  // axe horizontal logarithmique, convention BCG : forte part de marché à gauche
  const xs = (v: number) => L + ((Math.log10(4) - Math.log10(Math.max(0.1, Math.min(4, v)))) / (Math.log10(4) - Math.log10(0.1))) * (W - L - R);
  const ys = (g: number) => T + ((15 - Math.max(-2, Math.min(15, g))) / 17) * (H - T - B);
  const maxRev = Math.max(...acts.map((a) => a.revenue), 1);
  const x0 = xs(BCG_SHARE_THRESHOLD), y0 = ys(BCG_GROWTH_THRESHOLD);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Matrice BCG">
      <rect x={L} y={T} width={x0 - L} height={y0 - T} fill="var(--good-soft)" />
      <rect x={x0} y={T} width={W - R - x0} height={y0 - T} fill="var(--warn-soft)" />
      <rect x={L} y={y0} width={x0 - L} height={H - B - y0} fill="var(--accent-soft)" />
      <rect x={x0} y={y0} width={W - R - x0} height={H - B - y0} fill="var(--bg)" />
      <text x={L + 6} y={T + 14} className="muted">★ Étoiles</text>
      <text x={W - R - 6} y={T + 14} textAnchor="end" className="muted">? Points d’interrogation</text>
      <text x={L + 6} y={H - B - 6} className="muted">€ Vaches à lait</text>
      <text x={W - R - 6} y={H - B - 6} textAnchor="end" className="muted">✕ Poids morts</text>
      <line x1={L} x2={W - R} y1={H - B} y2={H - B} className="axis" />
      <line x1={L} x2={L} y1={T} y2={H - B} className="axis" />
      {[0.1, 0.25, 0.5, 1, 2, 4].map((v) => <text key={v} x={xs(v)} y={H - B + 14} textAnchor="middle" className="muted">{v}</text>)}
      {[0, 5, 10, 15].map((g) => <text key={g} x={L - 6} y={ys(g) + 4} textAnchor="end" className="muted">{g} %</text>)}
      <text x={(L + W) / 2} y={H - 6} textAnchor="middle" className="muted">part de marché relative visée (échelle log, forte à gauche)</text>
      <text x={12} y={(T + H - B) / 2} transform={`rotate(-90 12 ${(T + H - B) / 2})`} textAnchor="middle" className="muted">croissance du marché</text>
      {acts.map((a, i) => {
        const r = 8 + 26 * Math.sqrt(a.revenue / maxRev);
        return (
          <g key={a.id}>
            <circle cx={xs(a.relativeShare)} cy={ys(a.marketGrowth)} r={r} fill={COLORS[i % COLORS.length]} opacity={0.35} stroke={COLORS[i % COLORS.length]} strokeWidth={1.5}>
              <title>{`${a.name} : CA ${keur(a.revenue)}, croissance ${a.marketGrowth} %, part relative ${a.relativeShare}`}</title>
            </circle>
            <text x={xs(a.relativeShare)} y={ys(a.marketGrowth) + 4} textAnchor="middle" style={{ fontWeight: 600 }}>{a.name.split(' ')[0]}</text>
          </g>
        );
      })}
    </svg>
  );
}

function PorterRadar({ forces }: { forces: GroupData['porter'] }) {
  const W = 440, S = 270, c = S / 2, cx = W / 2, R = 95;
  const pt = (i: number, v: number) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / forces.length;
    return [cx + Math.cos(a) * (R * v) / 5, c + Math.sin(a) * (R * v) / 5];
  };
  return (
    <svg viewBox={`0 0 ${W} ${S}`} width="100%" style={{ maxWidth: 460, margin: '0 auto', display: 'block' }} role="img" aria-label="Radar des 5 forces">
      {[1, 2, 3, 4, 5].map((k) => <polygon key={k} points={forces.map((_, i) => pt(i, k).join(',')).join(' ')} fill="none" className="axis" stroke="var(--line)" />)}
      {forces.map((_, i) => <line key={i} x1={cx} y1={c} x2={pt(i, 5)[0]} y2={pt(i, 5)[1]} stroke="var(--line)" />)}
      <polygon points={forces.map((f, i) => pt(i, f.score).join(',')).join(' ')} fill="var(--c3)" opacity={0.25} stroke="var(--c3)" strokeWidth={2} />
      {forces.map((f, i) => {
        const [x, y] = pt(i, 6.3);
        return <text key={f.id} x={x} y={y + 4} textAnchor="middle" style={{ fontSize: 10 }}>{f.label.replace('Pouvoir des ', '').replace('Menace des ', '').replace('Rivalité entre concurrents', 'Rivalité')} ({f.score})</text>;
      })}
    </svg>
  );
}

export default function GroupView({ settings, deals }: { settings: Settings; deals: Deal[] }) {
  const router = useRouter();
  const [s, setS] = useState<Settings>(settings);
  const [dirty, setDirty] = useState(false);
  const g = s.group;
  const setG = (p: Partial<GroupData>) => {
    setS({ ...s, group: { ...g, ...p } });
    setDirty(true);
  };
  const setAct = (i: number, p: Partial<Activity>) => setG({ activities: g.activities.map((a, j) => (j === i ? { ...a, ...p } : a)) });
  const reco = recommendAllocation(s);
  const alloc = g.allocation;
  const allocTotal = alloc.reserve + alloc.bfrRecurrent + alloc.lcd + alloc.ar;
  const totalRev = g.activities.reduce((a, x) => a + x.revenue, 0);
  const totalNet = g.activities.reduce((a, x) => a + netResult(x), 0);

  // trajectoire 24 mois : le cash consacré à l'A/R est celui de l'allocation (réserve = tout le reste)
  const projections = useMemo(() => {
    const reserveEff = s.treasury.startCash - alloc.ar;
    const s2: Settings = { ...s, treasury: { ...s.treasury, reserveSecurite: Math.max(0, reserveEff) } };
    return g.scenarios.map((sc) => ({ sc, p: project({ s: s2, deals, months: 24, scenario: sc }) }));
  }, [s, deals, g.scenarios, alloc.ar]);

  async function save() {
    await api('/api/settings', 'PUT', s);
    setDirty(false);
    router.refresh();
  }
  const swotKeys: [keyof Swot, string, string][] = [['strengths', 'Forces', 'var(--good-soft)'], ['weaknesses', 'Faiblesses', 'var(--bad-soft)'], ['opportunities', 'Opportunités', 'var(--accent-soft)'], ['threats', 'Menaces', 'var(--warn-soft)']];
  const [editSwot, setEditSwot] = useState(false);

  return (
    <>
      {dirty && <div className="info row between"><span>Modifications non enregistrées.</span><button className="primary" onClick={save}>Enregistrer</button></div>}

      <div className="panel">
        <div className="row between">
          <h2>Portefeuille d’activités</h2>
          <button onClick={() => downloadCsv('activites-groupe', g.activities.map((a) => ({ activite: a.name, societe: COMPANY_LABELS[a.company], ca: a.revenue, marge_pct: a.margin, resultat: Math.round(netResult(a)), capital: a.capital, croissance_marche_pct: a.marketGrowth, part_relative: a.relativeShare, bcg: QUADRANT_LABELS[quadrant(a)], role: a.role })))}>Export CSV</button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead><tr><th>Activité</th><th>Société</th><th className="num">CA/an</th><th className="num">Marge %</th><th className="num">Résultat</th><th className="num">Capital immobilisé</th><th className="num">Rendement du capital</th><th className="num">Croiss. marché %</th><th className="num">Part relative</th><th>BCG</th><th>Rôle</th></tr></thead>
            <tbody>
              {g.activities.map((a, i) => (
                <tr key={a.id}>
                  <td><span style={{ color: COLORS[i % COLORS.length] }}>●</span> {a.name}</td>
                  <td className="small">{COMPANY_LABELS[a.company]}</td>
                  <td className="num"><input type="number" value={a.revenue} step={1000} style={{ width: 85 }} onChange={(e) => setAct(i, { revenue: +e.target.value })} /></td>
                  <td className="num"><input type="number" value={a.margin} style={{ width: 55 }} onChange={(e) => setAct(i, { margin: +e.target.value })} /></td>
                  <td className="num">{eur(netResult(a))}</td>
                  <td className="num"><input type="number" value={a.capital} step={5000} style={{ width: 90 }} onChange={(e) => setAct(i, { capital: +e.target.value })} /></td>
                  <td className="num">{Number.isFinite(returnOnCapital(a)) ? pct(returnOnCapital(a)) : '∞'}</td>
                  <td className="num"><input type="number" value={a.marketGrowth} style={{ width: 55 }} onChange={(e) => setAct(i, { marketGrowth: +e.target.value })} /></td>
                  <td className="num"><input type="number" value={a.relativeShare} step={0.1} style={{ width: 55 }} onChange={(e) => setAct(i, { relativeShare: +e.target.value })} /></td>
                  <td><span className={'tag ' + { etoile: 'good', vache: '', dilemme: 'warn', poids_mort: 'grey' }[quadrant(a)]}>{QUADRANT_LABELS[quadrant(a)]}</span></td>
                  <td className="wrap small" style={{ minWidth: 180 }}><input value={a.role} onChange={(e) => setAct(i, { role: e.target.value })} style={{ width: '100%' }} /></td>
                </tr>
              ))}
              <tr><td><b>Total groupe</b></td><td></td><td className="num"><b>{eur(totalRev)}</b></td><td className="num">{pct(totalNet / totalRev)}</td><td className="num"><b>{eur(totalNet)}</b></td><td className="num">{eur(g.activities.reduce((a, x) => a + x.capital, 0))}</td><td colSpan={5}></td></tr>
            </tbody>
          </table>
        </div>
        <p className="small muted">Marges et capitaux immobilisés : estimations à affiner avec les comptes. Seuils BCG : croissance {BCG_GROWTH_THRESHOLD} %, part relative {BCG_SHARE_THRESHOLD}.</p>
      </div>

      <div className="grid g2">
        <div className="panel">
          <h2>Matrice BCG simplifiée</h2>
          <Bcg acts={g.activities} />
          <ul className="plain small">
            {g.activities.map((a) => <li key={a.id}><b>{a.name}</b> — {QUADRANT_LABELS[quadrant(a)]} : {QUADRANT_ADVICE[quadrant(a)]}</li>)}
          </ul>
        </div>
        <div className="panel">
          <div className="row between"><h2>5 forces de Porter (marchand de biens, zones 44/85/49/37)</h2><span className="tag warn">intensité {porterIntensity(s).toFixed(1)}/5</span></div>
          <div className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
            <PorterRadar forces={g.porter} />
          </div>
          {g.porter.map((f, i) => (
            <div key={f.id} style={{ marginBottom: 8 }}>
              <div className="row between"><b>{f.label}</b><span className="row small">menace <input type="range" min={1} max={5} value={f.score} onChange={(e) => setG({ porter: g.porter.map((x, j) => (j === i ? { ...x, score: +e.target.value } : x)) })} /> {f.score}/5</span></div>
              <HBar value={f.score} color={f.score >= 4 ? 'var(--bad)' : f.score >= 3 ? 'var(--warn)' : 'var(--good)'} />
              <textarea rows={2} style={{ marginTop: 3, fontFamily: 'inherit' }} value={f.comment} onChange={(e) => setG({ porter: g.porter.map((x, j) => (j === i ? { ...x, comment: e.target.value } : x)) })} />
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="row between"><h2>SWOT du groupe</h2><button onClick={() => setEditSwot(!editSwot)}>{editSwot ? 'Terminer' : 'Modifier'}</button></div>
        <div className="swot">
          {swotKeys.map(([k, label, bg]) => (
            <div key={k} style={{ background: bg }}>
              <h3>{label}</h3>
              {editSwot ? (
                <textarea rows={6} style={{ fontFamily: 'inherit' }} value={g.swot[k].join('\n')} onChange={(e) => setG({ swot: { ...g.swot, [k]: e.target.value.split('\n') } })} />
              ) : (
                <ul>{g.swot[k].filter(Boolean).map((x, i) => <li key={i}>{x}</li>)}</ul>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="row between">
          <h2>Arbitrage de trésorerie ({eur(s.treasury.startCash)} disponibles)</h2>
          <button onClick={() => setG({ allocation: { reserve: reco.reserve, bfrRecurrent: reco.bfrRecurrent, lcd: reco.lcd, ar: reco.ar } })}>Appliquer la recommandation</button>
        </div>
        <div className="grid g2">
          <div>
            <div style={{ display: 'flex', height: 26, borderRadius: 6, overflow: 'hidden', margin: '6px 0 8px' }}>
              {([['reserve', 'Réserve', 'var(--c2)'], ['bfrRecurrent', 'BFR récurrent', 'var(--c4)'], ['lcd', 'Provision LCD', 'var(--c5)'], ['ar', 'Achat-revente', 'var(--c1)']] as const).map(([k, l, col]) => (
                <div key={k} title={`${l} : ${eur(alloc[k])}`} style={{ width: `${(alloc[k] / Math.max(allocTotal, 1)) * 100}%`, background: col, color: '#fff', fontSize: 11, padding: '5px 4px', whiteSpace: 'nowrap', overflow: 'hidden' }}>{l}</div>
              ))}
            </div>
            <table>
              <thead><tr><th>Poste</th><th className="num">Allocation</th><th className="num">Recommandé</th></tr></thead>
              <tbody>
                {([['reserve', 'Réserve de sécurité'], ['bfrRecurrent', 'Fonds de roulement activités récurrentes'], ['lcd', 'Provision LCD'], ['ar', 'Achat-revente (A/R)']] as const).map(([k, l]) => (
                  <tr key={k}><td>{l}</td><td className="num"><input type="number" value={alloc[k]} step={1000} onChange={(e) => setG({ allocation: { ...alloc, [k]: +e.target.value } })} /></td><td className="num muted">{eur(reco[k])}</td></tr>
                ))}
                <tr><td><b>Total</b></td><td className={'num ' + (allocTotal > s.treasury.startCash ? 'neg' : '')}><b>{eur(allocTotal)}</b></td><td className="num muted">{eur(s.treasury.startCash)}</td></tr>
              </tbody>
            </table>
            {allocTotal > s.treasury.startCash && <p className="neg small">L’allocation dépasse le cash disponible de {eur(allocTotal - s.treasury.startCash)}.</p>}
          </div>
          <div>
            <h3>Pourquoi</h3>
            <ul className="plain small">{reco.why.map((w) => <li key={w}>{w}</li>)}</ul>
            <h3 style={{ marginTop: 8 }}>Lecture</h3>
            <ul className="plain small">
              <li>Le <b>conseil en achats</b> (vache à lait, sans capital) finance le temps de prospection et l’épargne mensuelle : c’est lui qui permet de refaire un coup.</li>
              <li>L’<b>A/R</b> est l’étoile : meilleur rendement par euro, à condition de tourner vite. Priorité aux petits lots et aux lots groupés dont un lot liquide (garage, parking) rembourse vite une partie de la mise.</li>
              <li>La <b>LCD</b> et la <b>colocation</b> immobilisent beaucoup de capital pour un rendement moyen : ne pas y injecter de cash nouveau tant que l’A/R n’a pas tourné 2-3 fois.</li>
              <li>La <b>conciergerie</b> se teste sans cash (temps + clients LCD existants), critère de go : 10 k€ de CA récurrent à 12 mois.</li>
              <li>Formaliser l’<b>objet marchand de biens</b> de l’Immobilière avant d’enchaîner : droits réduits et sécurité fiscale.</li>
            </ul>
          </div>
        </div>

        <h3 style={{ marginTop: 12 }}>Trajectoire de cash sur 24 mois selon le scénario (A/R plafonné à {eur(alloc.ar)})</h3>
        <LineChart
          xLabels={projections[0]?.p.labels ?? []}
          series={projections.map(({ sc, p }) => ({ label: sc.label, color: sc.color, values: p.cash }))}
          refLines={[{ value: s.treasury.startCash - alloc.ar, label: 'cash hors A/R', color: 'var(--warn)' }]}
          height={240}
        />
        <div style={{ overflowX: 'auto' }}>
          <table style={{ marginTop: 8 }}>
            <thead><tr><th>Scénario</th><th className="num">Coups/an</th><th className="num">Gain moyen/coup</th><th className="num">Cash/coup</th><th className="num">Durée (mois)</th><th className="num">Coeff. récurrent</th><th className="num">Coups lancés</th><th className="num">Gains A/R</th><th className="num">Cash à 12 mois</th><th className="num">Cash à 24 mois</th></tr></thead>
            <tbody>
              {projections.map(({ sc, p }, i) => (
                <tr key={sc.id}>
                  <td><span style={{ color: sc.color }}>●</span> <input value={sc.label} style={{ width: 90 }} onChange={(e) => setG({ scenarios: g.scenarios.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} /></td>
                  {(['dealsPerYear', 'avgGainPerDeal', 'cashPerDeal', 'monthsPerDeal', 'recurringFactor'] as const).map((k) => (
                    <td key={k} className="num"><input type="number" value={sc[k]} step={k === 'recurringFactor' ? 0.05 : k.includes('PerDeal') && k !== 'monthsPerDeal' ? 1000 : 1} style={{ width: k.includes('Per') && k !== 'monthsPerDeal' && k !== 'dealsPerYear' ? 85 : 55 }} onChange={(e) => setG({ scenarios: g.scenarios.map((x, j) => (j === i ? { ...x, [k]: +e.target.value } : x)) })} /></td>
                  ))}
                  <td className="num">{p.launched}</td>
                  <td className="num pos">{eur(p.gains)}</td>
                  <td className="num">{eur(p.cash[12])}</td>
                  <td className="num"><b>{eur(p.endCash)}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="small muted">Inclut les opérations du pipeline déjà signées et l’épargne mensuelle ({eur(s.treasury.monthlySavings)} × coefficient récurrent). Gains A/R avant IS.</p>
      </div>
    </>
  );
}
