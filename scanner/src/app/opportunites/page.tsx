import Link from 'next/link';
import OpportunitiesTable, { type OppRow } from '@/components/OpportunitiesTable';
import { analyzeAll, ctx } from '@/lib/server';
import { dvfStatus } from '@/lib/dvf';
import { toOppRow } from '@/lib/rows';

export const dynamic = 'force-dynamic';

export default function OpportunitesPage() {
  const { settings, zones } = ctx();
  const rows: OppRow[] = analyzeAll().map(({ listing, analysis, zone, tension }) => toOppRow(listing, analysis, zone, tension));
  const depts = [...new Set([...zones.map((z) => z.dept), ...rows.map((r) => r.dept)])].sort();
  const dvf = dvfStatus(depts, settings.dvf.useDemo);
  const demoDepts = dvf.filter((d) => d.kind === 'demo').map((d) => d.dept);
  const none = dvf.filter((d) => d.kind === 'aucun').map((d) => d.dept);
  return (
    <>
      <div className="head">
        <div>
          <h1>Opportunités</h1>
          <p className="muted">Chaque annonce est découpée en lots revendables séparément et valorisée sur la DVF. Tri par score d’anomalie.</p>
        </div>
        <Link href="/import" className="btn primary">+ Importer des annonces</Link>
      </div>
      {(demoDepts.length > 0 || none.length > 0) && (
        <div className="note">
          {demoDepts.length > 0 && <>DVF de <b>démonstration (fictive)</b> pour : {demoDepts.join(', ')}. </>}
          {none.length > 0 && <>Aucune DVF pour : {none.join(', ')}. </>}
          Charger la vraie DVF : <code>npm run dvf:fetch -- {[...demoDepts, ...none].join(' ')}</code> (voir <Link href="/parametres">Paramètres</Link>).
        </div>
      )}
      <OpportunitiesTable rows={rows} budget={settings.budget.cash} elargi={settings.budget.elargi} minGain={settings.thresholds.minGain} minGainPct={settings.thresholds.minGainPct} />
    </>
  );
}
