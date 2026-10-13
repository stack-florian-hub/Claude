'use client';
import { useMemo, useState } from 'react';
import type { CommuneMarket } from '@/lib/dvf';
import { downloadCsv } from '@/lib/csv';
import { keur, num, pct } from '@/lib/util';

type K = keyof CommuneMarket;

export default function MarketsView({ rows }: { rows: CommuneMarket[] }) {
  const [sort, setSort] = useState<{ k: K; dir: 1 | -1 }>({ k: 'prime', dir: -1 });
  const list = useMemo(() => [...rows].sort((a, b) => {
    const x = a[sort.k] as number, y = b[sort.k] as number;
    return ((isFinite(x) ? x : -1e12) - (isFinite(y) ? y : -1e12)) * sort.dir;
  }), [rows, sort]);
  const th = (k: K, label: string, title?: string) => (
    <th className="sort num" title={title} onClick={() => setSort({ k, dir: sort.k === k ? (-sort.dir as 1 | -1) : -1 })}>{label}{sort.k === k ? (sort.dir < 0 ? ' ▾' : ' ▴') : ''}</th>
  );
  const years = [...new Set(rows.flatMap((r) => Object.keys(r.perYear)))].sort();
  const best = [...rows].filter((r) => isFinite(r.prime) && r.impliedN >= 30 && r.depN >= 30).sort((a, b) => b.prime - a.prime).slice(0, 3);

  return (
    <>
      {best.length > 0 && (
        <div className="info">
          Où chercher des lots groupés en priorité (dépendance vendue seule nettement plus chère que dans une vente avec logement) :{' '}
          {best.map((r, i) => <span key={r.insee}>{i ? ', ' : ''}<b>{r.name}</b> (+{keur(r.prime)} par dépendance)</span>)}.
        </div>
      )}
      <div className="row between" style={{ marginBottom: 8 }}>
        <span className="small muted">Clic sur un en-tête pour trier. Survoler les en-têtes pour la définition.</span>
        <button onClick={() => downloadCsv('marches', list.map((r) => ({ zone: r.zone, commune: r.name, insee: r.insee, dvf: r.kind, tension: r.tension, appart_p25: Math.round(r.aptP25), appart_mediane: Math.round(r.aptMed), appart_p75: Math.round(r.aptP75), appart_n: r.aptN, ...Object.fromEntries(years.map((y) => [`mediane_${y}`, r.perYear[y] ?? ''])), tendance_pct: isFinite(r.trend) ? +(r.trend * 100).toFixed(1) : '', maison_mediane: Math.round(r.houseMed), dependance_seule_mediane: Math.round(r.depMed), dependance_n: r.depN, dependance_implicite: Math.round(r.implied), prime_vente_separee: Math.round(r.prime), part_ventes_avec_dependance_pct: Math.round(r.bundledShare * 100), ventes_par_an: Math.round(r.salesPerYear) })))}>Export CSV</button>
      </div>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>Commune</th>
              <th>DVF</th>
              {th('tension', 'Tension')}
              {th('aptMed', 'Appart €/m² méd.', 'Médiane du €/m² des appartements (toutes ventes d’un seul appartement)')}
              <th className="num">P25 – P75</th>
              {years.map((y) => <th key={y} className="num">{y}</th>)}
              {th('trend', 'Tendance', 'Évolution de la médiane entre la première et la dernière année')}
              {th('houseMed', 'Maison €/m²')}
              {th('depMed', 'Dépendance seule', 'Médiane des ventes d’une dépendance seule (garage, parking, cave, remise…)')}
              {th('implied', 'Dépendance avec logement', 'Valeur implicite d’une dépendance vendue avec un appartement')}
              {th('prime', 'Prime vente séparée', 'Dépendance seule − dépendance avec logement : ce que rapporte la revente séparée, par dépendance')}
              {th('bundledShare', 'Ventes avec dépendance', 'Part des ventes d’appartement qui incluent au moins une dépendance')}
              {th('salesPerYear', 'Ventes / an', 'Nombre de ventes exploitables par an : liquidité du marché')}
            </tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.insee}>
                <td>{r.name}<div className="small muted">{r.zone} · {r.insee}</div></td>
                <td>{r.kind === 'reel' ? <span className="tag good">réelle</span> : r.kind === 'demo' ? <span className="tag warn">démo</span> : <span className="tag bad">absente</span>}</td>
                <td className="num">{r.tension}</td>
                <td className="num"><b>{num(r.aptMed)}</b><div className="small muted">n={r.aptN}</div></td>
                <td className="num small">{num(r.aptP25)} – {num(r.aptP75)}</td>
                {years.map((y) => <td key={y} className="num small">{r.perYear[y] ? num(r.perYear[y]) : '—'}</td>)}
                <td className={'num ' + (r.trend > 0 ? 'pos' : r.trend < 0 ? 'neg' : '')}>{pct(r.trend, 1)}</td>
                <td className="num">{num(r.houseMed)}</td>
                <td className="num">{keur(r.depMed)}<div className="small muted">{keur(r.depP20)} – {keur(r.depP80)} · n={r.depN}</div></td>
                <td className="num">{keur(r.implied)}<div className="small muted">n={r.impliedN}</div></td>
                <td className={'num ' + (r.prime > 0 ? 'pos' : 'neg')}><b>{keur(r.prime)}</b></td>
                <td className="num">{pct(r.bundledShare)}</td>
                <td className="num">{num(r.salesPerYear)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="panel" style={{ marginTop: 12 }}>
        <h3>Lecture</h3>
        <ul className="plain small">
          <li><b>Prime de vente séparée</b> : écart entre le prix d’une dépendance vendue seule et sa valeur implicite quand elle part avec un appartement. Une prime forte = les vendeurs « donnent » le garage ou le parking dans les ventes groupées : c’est là que le modèle New Port rapporte le plus.</li>
          <li><b>Limite de cet indicateur</b> : les appartements vendus avec un parking sont souvent dans des immeubles plus récents ou mieux situés, donc plus chers au m². La valeur implicite de la dépendance en est gonflée et la prime sous-estimée (elle peut même devenir négative, comme à Saint-Germain-en-Laye). À lire comme une tendance entre communes, pas comme un montant exact.</li>
          <li><b>Dépendance seule</b> : DVF mélange garages, parkings, caves et parfois remises ou chais (valeurs hautes sur le littoral). Lire la fourchette P20 – P80, pas seulement la médiane.</li>
          <li><b>Ventes / an</b> : un marché liquide se revend vite. En dessous de ~100 ventes par an, compter un délai de revente plus long.</li>
          <li>Calculs sur les {years.length ? `${years[0]}–${years[years.length - 1]}` : ''} ventes DVF chargées ; commandes de mise à jour dans Paramètres.</li>
        </ul>
      </div>
    </>
  );
}
