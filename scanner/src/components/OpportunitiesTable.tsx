'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LOT_LABELS, SELLER_LABELS, SOURCE_LABELS } from '@/lib/defaults';
import { downloadCsv } from '@/lib/csv';
import { eur, keur, pct } from '@/lib/util';

export interface OppRow {
  id: string; title: string; url?: string; source: string; seller: string; city: string; cp: string; dept: string; zone?: string; tension: number;
  lots: { type: string; surface?: number }[]; price: number; low: number; mid: number; high: number; ecart: number;
  gain: number; gainLow: number; gainHigh: number; gainPct: number; ratio: number; score: number; confidence: number; flagged: boolean;
  cash: number; age: number; status: string; signals: string[]; warnings: string[]; dpe?: string; drop: number; demo?: boolean;
}

type Key = keyof OppRow;
const scoreColor = (s: number) => (s >= 65 ? 'var(--good)' : s >= 45 ? 'var(--warn)' : 'var(--muted)');
const PREF_KEY = 'scanner.filtres';

export default function OpportunitiesTable({ rows, budget, elargi, minGain, minGainPct }: { rows: OppRow[]; budget: number; elargi: number; minGain: number; minGainPct: number }) {
  const router = useRouter();
  const depts = [...new Set(rows.map((r) => r.dept))].sort();
  const sources = [...new Set(rows.map((r) => r.source))].sort();
  const [f, setF] = useState({ dept: '', city: '', budget: 'tous', type: '', gainMin: '', ageMax: '', flagged: false, status: 'actifs', source: '', q: '' });
  const [sort, setSort] = useState<{ k: Key; dir: 1 | -1 }>({ k: 'score', dir: -1 });

  useEffect(() => {
    try {
      const saved = localStorage.getItem(PREF_KEY);
      if (saved) setF((x) => ({ ...x, ...JSON.parse(saved) }));
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify(f));
    } catch {}
  }, [f]);

  const list = useMemo(() => {
    const out = rows.filter((r) => {
      if (f.dept && r.dept !== f.dept) return false;
      if (f.city && !(r.city + ' ' + r.cp + ' ' + (r.zone || '')).toLowerCase().includes(f.city.toLowerCase())) return false;
      if (f.q && !(r.title + ' ' + r.signals.join(' ')).toLowerCase().includes(f.q.toLowerCase())) return false;
      if (f.budget === 'tresorerie' && r.cash > budget) return false;
      if (f.budget === 'elargi' && r.cash > elargi) return false;
      if (f.type === 'groupe' && r.lots.length < 2) return false;
      if (f.type && f.type !== 'groupe' && !r.lots.some((l) => l.type === f.type)) return false;
      if (f.gainMin && r.gain < +f.gainMin) return false;
      if (f.ageMax && r.age > +f.ageMax) return false;
      if (f.flagged && !r.flagged) return false;
      if (f.source && r.source !== f.source) return false;
      if (f.status === 'actifs' && r.status === 'ecarte') return false;
      if (f.status !== 'actifs' && f.status !== 'tous' && r.status !== f.status) return false;
      return true;
    });
    return out.sort((a, b) => {
      const x = a[sort.k], y = b[sort.k];
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * sort.dir;
    });
  }, [rows, f, sort, budget, elargi]);

  const flagged = list.filter((r) => r.flagged);
  const th = (k: Key, label: string, num = true) => (
    <th className={'sort' + (num ? ' num' : '')} onClick={() => setSort({ k, dir: sort.k === k ? (-sort.dir as 1 | -1) : -1 })}>
      {label}{sort.k === k ? (sort.dir < 0 ? ' ▾' : ' ▴') : ''}
    </th>
  );

  function exportCsv() {
    downloadCsv('opportunites', list.map((r) => ({
      score: r.score, alerte: r.flagged ? 'oui' : '', titre: r.title, ville: r.city, cp: r.cp, zone: r.zone, source: SOURCE_LABELS[r.source], vendeur: SELLER_LABELS[r.seller],
      lots: r.lots.map((l) => LOT_LABELS[l.type] + (l.surface ? ` ${l.surface}m²` : '')).join(' + '), prix: r.price, estimation_basse: r.low, estimation_moyenne: r.mid, estimation_haute: r.high,
      ecart: r.ecart, gain_brut: r.gain, gain_pct: +(r.gainPct * 100).toFixed(1), ratio: +r.ratio.toFixed(2), cash_necessaire: r.cash, confiance: +(r.confidence * 100).toFixed(0), anciennete_j: r.age, statut: r.status, url: r.url,
    })));
  }

  return (
    <>
      <div className="kpis">
        <div className="kpi"><div className="l">Annonces affichées</div><div className="v">{list.length}</div><div className="s">sur {rows.length}</div></div>
        <div className="kpi"><div className="l">Alertes (gain &gt; {keur(minGain)} ou &gt; {minGainPct} %)</div><div className="v pos">{flagged.length}</div></div>
        <div className="kpi"><div className="l">Gain brut potentiel (alertes)</div><div className="v">{keur(flagged.reduce((a, r) => a + r.gain, 0))}</div></div>
        <div className="kpi"><div className="l">Alertes finançables ≤ {keur(budget)}</div><div className="v">{flagged.filter((r) => r.cash <= budget).length}</div><div className="s">cash nécessaire ≤ trésorerie</div></div>
        <div className="kpi"><div className="l">Lots groupés</div><div className="v">{list.filter((r) => r.lots.length > 1).length}</div></div>
      </div>

      <div className="filters">
        <label>Recherche<input value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="mot-clé" style={{ width: 120 }} /></label>
        <label>Département
          <select value={f.dept} onChange={(e) => setF({ ...f, dept: e.target.value })}><option value="">Tous</option>{depts.map((d) => <option key={d}>{d}</option>)}</select>
        </label>
        <label>Ville / zone<input value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} style={{ width: 120 }} /></label>
        <label>Budget (cash nécessaire)
          <select value={f.budget} onChange={(e) => setF({ ...f, budget: e.target.value })}>
            <option value="tous">Tous</option>
            <option value="tresorerie">≤ trésorerie ({keur(budget)})</option>
            <option value="elargi">≤ budget élargi ({keur(elargi)})</option>
          </select>
        </label>
        <label>Type de lot
          <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
            <option value="">Tous</option><option value="groupe">Lot groupé (≥ 2 lots)</option>
            {Object.entries(LOT_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
        <label>Gain min (€)<input type="number" value={f.gainMin} onChange={(e) => setF({ ...f, gainMin: e.target.value })} step={5000} /></label>
        <label>Ancienneté max (j)<input type="number" value={f.ageMax} onChange={(e) => setF({ ...f, ageMax: e.target.value })} style={{ width: 70 }} /></label>
        <label>Source
          <select value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })}><option value="">Toutes</option>{sources.map((s) => <option key={s} value={s}>{SOURCE_LABELS[s]}</option>)}</select>
        </label>
        <label>Statut
          <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
            <option value="actifs">Actifs</option><option value="nouveau">Nouveaux</option><option value="suivi">Suivis</option><option value="pipeline">En pipeline</option><option value="ecarte">Écartés</option><option value="tous">Tous</option>
          </select>
        </label>
        <label className="row" style={{ flexDirection: 'row', alignItems: 'center', paddingBottom: 4 }}><input type="checkbox" checked={f.flagged} onChange={(e) => setF({ ...f, flagged: e.target.checked })} /> Alertes seulement</label>
        <button onClick={() => setF({ dept: '', city: '', budget: 'tous', type: '', gainMin: '', ageMax: '', flagged: false, status: 'actifs', source: '', q: '' })}>Réinitialiser</button>
        <button onClick={exportCsv}>Export CSV</button>
      </div>

      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              {th('score', 'Score')}
              {th('title', 'Annonce', false)}
              {th('city', 'Lieu', false)}
              <th>Lots</th>
              {th('price', 'Prix affiché')}
              {th('mid', 'Σ lots séparés')}
              {th('ecart', 'Écart')}
              {th('gain', 'Gain brut')}
              {th('gainPct', 'Gain / prix')}
              {th('cash', 'Cash nécessaire')}
              {th('confidence', 'Confiance')}
              {th('age', 'Âge')}
              <th>Signaux</th>
            </tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.id} className={'click' + (r.flagged ? ' flag' : '')} onClick={() => router.push(`/opportunites/${r.id}`)} style={r.status === 'ecarte' ? { opacity: 0.5 } : undefined}>
                <td className="num"><span className="score" style={{ color: scoreColor(r.score) }}>{r.score}</span></td>
                <td className="wrap" style={{ minWidth: 240, maxWidth: 340 }}>
                  {r.title}
                  <div className="small muted">{SOURCE_LABELS[r.source]} · {SELLER_LABELS[r.seller]}{r.dpe ? ` · DPE ${r.dpe}` : ''}{r.status !== 'nouveau' ? ` · ${r.status}` : ''}{r.demo ? ' · démo' : ''}</div>
                </td>
                <td>{r.city}<div className="small muted">{r.cp} · {r.zone ? `T${r.tension}` : 'hors zone'}</div></td>
                <td className="wrap" style={{ maxWidth: 200 }}>{r.lots.map((l, i) => <span key={i} className={'tag' + (r.lots.length > 1 ? ' good' : '')}>{LOT_LABELS[l.type]}{l.surface ? ` ${l.surface}` : ''}</span>)}</td>
                <td className="num">{eur(r.price)}</td>
                <td className="num">{eur(r.mid)}<div className="small muted">{keur(r.low)} – {keur(r.high)}</div></td>
                <td className={'num ' + (r.ecart > 0 ? 'pos' : 'neg')}>{eur(r.ecart)}</td>
                <td className={'num ' + (r.gain > 0 ? 'pos' : 'neg')}><b>{eur(r.gain)}</b><div className="small muted">{keur(r.gainLow)} – {keur(r.gainHigh)}</div></td>
                <td className={'num ' + (r.gainPct > 0 ? 'pos' : 'neg')}>{pct(r.gainPct)}<div className="small muted">ratio {r.ratio.toFixed(2)}</div></td>
                <td className={'num' + (r.cash > budget ? ' neg' : '')}>{keur(r.cash)}</td>
                <td className="num">
                  <div className="bar" style={{ width: 50, display: 'inline-block' }}><div style={{ width: `${r.confidence * 100}%` }} /></div>
                </td>
                <td className="num">{r.age} j</td>
                <td className="wrap small" style={{ minWidth: 230, maxWidth: 300 }}>{r.signals.slice(0, 3).map((s, i) => <div key={i}>{s}</div>)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list.length && <p className="muted" style={{ padding: 12 }}>Aucune annonce ne correspond aux filtres.</p>}
      </div>
    </>
  );
}
