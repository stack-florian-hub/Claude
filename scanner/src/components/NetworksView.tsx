'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { NETWORKS } from '@/lib/networks';
import { downloadCsv } from '@/lib/csv';
import { keur, pct } from '@/lib/util';
import type { OppRow } from './OpportunitiesTable';

const median = (v: number[]) => {
  const s = v.filter((x) => isFinite(x)).sort((a, b) => a - b);
  return s.length ? s[Math.floor((s.length - 1) / 2)] : NaN;
};

interface Agg { key: string; label: string; n: number; alerts: number; medEcart: number; medGain: number; best?: OppRow; drops: number }

function aggregate(rows: OppRow[], keyOf: (r: OppRow) => string | undefined, labelOf: (k: string) => string): Agg[] {
  const m = new Map<string, OppRow[]>();
  for (const r of rows) {
    const k = keyOf(r);
    if (k) (m.get(k) || m.set(k, []).get(k)!).push(r);
  }
  return [...m].map(([k, rs]) => ({
    key: k, label: labelOf(k), n: rs.length, alerts: rs.filter((r) => r.flagged).length,
    // écart relatif = (Σ lots − prix) / prix, sur les estimations assez fiables
    medEcart: median(rs.filter((r) => r.confidence >= 0.3).map((r) => r.ecart / r.price)),
    medGain: median(rs.filter((r) => r.confidence >= 0.3).map((r) => r.gainPct)),
    best: [...rs].sort((a, b) => b.score - a.score)[0],
    drops: rs.filter((r) => r.drop > 0.03).length,
  }));
}

export default function NetworksView({ rows, lastCollect }: { rows: OppRow[]; lastCollect?: string }) {
  const [net, setNet] = useState('ajp');
  const active = rows.filter((r) => r.status !== 'ecarte' && !r.offMarket);
  const byNet = useMemo(() => new Map(aggregate(active, (r) => r.network, (k) => k).map((a) => [a.key, a])), [active]);
  const agencies = useMemo(() => aggregate(active.filter((r) => r.network === net), (r) => r.agency || r.city, (k) => k).sort((a, b) => b.alerts - a.alerts || a.medEcart - b.medEcart), [active, net]);
  const others = active.filter((r) => !r.network);
  const othersAgg = aggregate(others, () => 'autres', () => 'Particuliers et portails (sans réseau identifié)')[0];

  return (
    <>
      <div className="panel">
        <div className="row between">
          <h2>Réseaux d’agences et canaux notariaux</h2>
          <button onClick={() => downloadCsv('reseaux', NETWORKS.map((n) => { const a = byNet.get(n.id); return { reseau: n.name, type: n.kind, collecte: n.connector ? 'automatique' : 'capture manuelle', annonces: a?.n ?? 0, alertes: a?.alerts ?? 0, ecart_median_pct: a && isFinite(a.medEcart) ? +(a.medEcart * 100).toFixed(1) : '', site: n.site }; }))}>Export CSV</button>
        </div>
        <p className="small muted">Écart médian = (valeur des lots séparés − prix affiché) / prix, sur les annonces dont l’estimation est assez fiable. Un écart médian élevé signale un réseau qui affiche en dessous du marché DVF.{lastCollect ? ` Dernière collecte automatique : ${lastCollect}.` : ''}</p>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead><tr><th>Réseau</th><th>Type</th><th>Collecte</th><th className="num">Annonces</th><th className="num">Alertes</th><th className="num">Écart médian</th><th className="num">Baisses de prix</th><th>Meilleure opportunité</th><th>Site</th></tr></thead>
            <tbody>
              {NETWORKS.map((n) => {
                const a = byNet.get(n.id);
                return (
                  <tr key={n.id} className={a ? 'click' : ''} onClick={() => a && setNet(n.id)} style={net === n.id ? { background: 'var(--accent-soft)' } : undefined}>
                    <td><b>{n.name}</b>{n.note && <div className="small muted wrap" style={{ maxWidth: 320, whiteSpace: 'normal' }}>{n.note}</div>}</td>
                    <td>{n.kind === 'notaires' ? <span className="tag">notaires</span> : <span className="tag grey">agences</span>}</td>
                    <td>{n.connector ? <span className="tag good">automatique (lundi)</span> : <span className="tag grey">capture manuelle</span>}</td>
                    <td className="num">{a?.n ?? 0}</td>
                    <td className="num pos">{a?.alerts || '—'}</td>
                    <td className={'num ' + (a && a.medEcart > 0 ? 'pos' : '')}>{a ? pct(a.medEcart) : '—'}</td>
                    <td className="num">{a?.drops || '—'}</td>
                    <td className="wrap small" style={{ maxWidth: 260 }}>{a?.best ? <Link href={`/opportunites/${a.best.id}`}>{a.best.title.slice(0, 60)}</Link> : ''}</td>
                    <td><a href={n.site} target="_blank" rel="noreferrer">ouvrir ↗</a></td>
                  </tr>
                );
              })}
              {othersAgg && <tr><td colSpan={3} className="muted">{othersAgg.label}</td><td className="num">{othersAgg.n}</td><td className="num pos">{othersAgg.alerts || '—'}</td><td className="num">{pct(othersAgg.medEcart)}</td><td className="num">{othersAgg.drops || '—'}</td><td colSpan={2}></td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <h2>Par agence – {NETWORKS.find((n) => n.id === net)?.name}</h2>
        {agencies.length ? (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead><tr><th>Agence</th><th className="num">Annonces</th><th className="num">Alertes</th><th className="num">Écart médian</th><th className="num">Gain / prix médian</th><th className="num">Baisses</th><th>Meilleure opportunité</th></tr></thead>
              <tbody>
                {agencies.map((a) => (
                  <tr key={a.key}>
                    <td>{a.label}</td>
                    <td className="num">{a.n}</td>
                    <td className="num pos">{a.alerts || '—'}</td>
                    <td className={'num ' + (a.medEcart > 0 ? 'pos' : 'neg')}>{pct(a.medEcart)}</td>
                    <td className="num">{pct(a.medGain)}</td>
                    <td className="num">{a.drops || '—'}</td>
                    <td className="wrap small">{a.best && <Link href={`/opportunites/${a.best.id}`}>{a.best.title.slice(0, 70)} ({keur(a.best.gain)})</Link>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="muted">Aucune annonce de ce réseau pour l’instant. Capturez-en une depuis son site (Import d’annonces) : le réseau est reconnu automatiquement.</p>}
      </div>
    </>
  );
}
