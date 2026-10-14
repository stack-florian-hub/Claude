import React, { useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import Nav from '@/components/Nav';
import OpportunitiesTable from '@/components/OpportunitiesTable';
import ListingDetail from '@/components/ListingDetail';
import ImportPanel from '@/components/ImportPanel';
import NetworksView from '@/components/NetworksView';
import MarketsView from '@/components/MarketsView';
import PipelineBoard from '@/components/PipelineBoard';
import TreasuryView from '@/components/TreasuryView';
import GroupView from '@/components/GroupView';
import SettingsView from '@/components/SettingsView';
import { toOppRow } from '@/lib/rows';
import { buildChecklist } from '@/lib/checklist';
import { simInputFromAnalysis } from '@/lib/simulation';
import { dealFromListing } from '@/lib/deals';
import { LISTING_PROVIDERS } from '@/lib/providers/listing';
import { eur, frDate, keur } from '@/lib/util';
import { S, allListings, analysisOf, load, statsOf, zoneInfo } from './state';
import { getPath, getVersion, navigate, subscribe } from './shims/router';

(window as unknown as { __SCANNER_ARTIFACT__: boolean }).__SCANNER_ARTIFACT__ = true;

const Head = ({ title, sub, right }: { title: string; sub: React.ReactNode; right?: React.ReactNode }) => (
  <div className="head">
    <div>
      <h1>{title}</h1>
      <p className="muted">{sub}</p>
    </div>
    {right}
  </div>
);

function rows() {
  return allListings().map((l) => {
    const z = zoneInfo(l);
    return toOppRow(l, analysisOf(l), z.zone, z.tension);
  });
}

function Weekly() {
  const c = S.data?.meta.collecte;
  if (!c) return null;
  let alerts = c.alerts.filter((a) => { const l = allListings().find((x) => x.id === a.id); return l && analysisOf(l).flagged; }).slice(0, 8);
  // semaine sans nouvelle alerte : on rappelle les meilleures alertes en cours
  const best = !alerts.length;
  if (best) alerts = allListings().map((l) => ({ l, a: analysisOf(l) })).filter((x) => x.a.flagged && !x.l.offMarketAt).sort((x, y) => y.a.score - x.a.score).slice(0, 8).map((x) => ({ id: x.l.id, title: x.l.title, score: x.a.score, gain: x.a.gain.mid }));
  const drops = c.drops.filter((d) => d.to < d.from).slice(0, 8);
  if (!alerts.length && !drops.length) return null;
  return (
    <div className="panel">
      <div className="row between"><h2>Nouveautés de la collecte du {frDate(c.date)}</h2><span className="small muted">{c.added} nouvelles annonces · {c.gone} retirées · {c.networks?.length ? c.networks.map((n) => `${n.label} ${n.retenus}`).join(' · ') : `${c.agencies} agences AJP parcourues`}</span></div>
      <div className="grid g2">
        <div>
          <h3>{best ? 'Meilleures alertes en cours' : 'Nouvelles alertes'}</h3>
          {alerts.length ? <ul className="plain">{alerts.map((a) => <li key={a.id}><a href="#" onClick={(e) => { e.preventDefault(); navigate(`/opportunites/${a.id}`); }}>{a.title.slice(0, 80)}</a> <span className="pos">· gain {keur(a.gain)}</span> <span className="muted">· score {a.score}</span></li>)}</ul> : <p className="muted">Aucune nouvelle alerte cette semaine.</p>}
        </div>
        <div>
          <h3>Baisses de prix</h3>
          {drops.length ? <ul className="plain">{drops.map((d, i) => <li key={i}>{d.title.slice(0, 70)} : <span className="muted">{eur(d.from)}</span> → <b>{eur(d.to)}</b></li>)}</ul> : <p className="muted">Aucune baisse détectée.</p>}
        </div>
      </div>
    </div>
  );
}

function Page() {
  const path = getPath();
  const s = S.settings;
  if (path.startsWith('/opportunites/')) {
    const id = path.split('/')[2];
    const l = allListings().find((x) => x.id === id);
    if (!l) return <p className="muted">Annonce introuvable. <a href="#" onClick={(e) => { e.preventDefault(); navigate('/opportunites'); }}>Retour</a></p>;
    const a = analysisOf(l);
    const z = zoneInfo(l);
    return (
      <ListingDetail key={`${id}:${getVersion()}`} listing={l} analysis={a} zone={z.zone} tension={z.tension} settings={s}
        stats={statsOf(l)} checklist={buildChecklist(l, a, s)} sim={simInputFromAnalysis(l, a, s)}
        newDeal={dealFromListing(l, a, s)} dealId={S.deals.find((d) => d.listingId === l.id)?.id} />
    );
  }
  switch (path) {
    case '/import':
      return (
        <>
          <Head title="Import d’annonces" sub="Collez une annonce d’agence, de notaire ou de particulier : réseau, lots groupés et valeur DVF sont calculés tout de suite. Les annonces AJP arrivent seules chaque lundi." />
          <ImportPanel />
          <div className="panel"><h3>Formats acceptés</h3><table><tbody>{LISTING_PROVIDERS.filter((p) => p.available).map((p) => <tr key={p.id}><td>{p.label}</td><td className="wrap muted">{p.description}</td></tr>)}</tbody></table></div>
        </>
      );
    case '/reseaux':
      return (<><Head title="Réseaux" sub="Grands réseaux d’agences et canaux notariaux. AJP est collecté automatiquement chaque lundi ; les autres se capturent depuis leur site (Import)." /><NetworksView rows={rows()} lastCollect={S.data?.meta.collecte ? frDate(S.data.meta.collecte.date) : undefined} /></>);
    case '/marches':
      return (<><Head title="Marchés" sub="Vos communes comparées sur la DVF : prix, tendance, liquidité, dépendances et prime de revente séparée." /><MarketsView rows={S.data?.markets || []} /></>);
    case '/pipeline':
      return (<><Head title="Pipeline" sub="Repéré → visité → offre → signé → revente lot par lot → clos." /><PipelineBoard key={getVersion()} deals={S.deals} settings={s} /></>);
    case '/tresorerie':
      return (<><Head title="Trésorerie" sub="Cash disponible, cash immobilisé, ventes à venir et trajectoire sur 12 à 36 mois." /><TreasuryView deals={S.deals} settings={s} /></>);
    case '/groupe':
      return (<><Head title="Groupe TUÉ et Fils" sub="Financière TUÉ et Fils · Immobilière TUÉ et Fils · SCI du Hameau de la Vie. Matrices modifiables." /><GroupView settings={s} deals={S.deals} /></>);
    case '/parametres':
      return (<><Head title="Paramètres" sub="Hypothèses de calcul, zones cibles et données." /><SettingsView settings={s} zones={S.zones} dvf={(S.data?.meta.dvf || []).map((d) => ({ dept: d.dept, kind: 'reel', n: d.n, years: d.years, refDate: d.refDate, sizeMb: 0 }))} /></>);
    default: {
      const rs = rows();
      return (
        <>
          <Head title="Opportunités" sub="Chaque annonce est découpée en lots revendables séparément et comparée aux ventes réelles (DVF). Tri par score d’anomalie."
            right={<button className="primary" onClick={() => navigate('/import')}>+ Coller une annonce</button>} />
          <Weekly />
          <OpportunitiesTable rows={rs} budget={s.budget.cash} elargi={s.budget.elargi} minGain={s.thresholds.minGain} minGainPct={s.thresholds.minGainPct} />
        </>
      );
    }
  }
}

function App() {
  useSyncExternalStore(subscribe, () => `${getPath()}|${getVersion()}|${S.ready}|${S.saveError}`);
  return (
    <div className="shell">
      <Nav />
      <main>
        {S.saveError && <div className="note">{S.saveError}</div>}
        {!S.ready ? <p className="muted">Chargement des annonces et des ventes DVF…</p> : S.loadError ? <div className="note">{S.loadError}</div> : <Page />}
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
load();
