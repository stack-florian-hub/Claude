import Link from 'next/link';
import OpportunitiesTable, { type OppRow } from '@/components/OpportunitiesTable';
import { analyzeAll, ctx } from '@/lib/server';
import { toOppRow } from '@/lib/rows';

export const dynamic = 'force-dynamic';

export default function EntrepotsPage() {
  const { settings } = ctx();
  const rows: OppRow[] = analyzeAll().map(({ listing, analysis, zone, tension }) => toOppRow(listing, analysis, zone, tension));
  return (
    <>
      <div className="head">
        <div>
          <h1>Entrepôts &amp; locaux</h1>
          <p className="muted">Entrepôts, locaux d’activité et murs commerciaux à vendre (BureauxLocaux, Arthur Loyd, notaires, agences), comparés aux ventes DVF de locaux de surface proche. Rendement brut quand un loyer est cité.</p>
        </div>
        <Link href="/import" className="btn primary">+ Importer des annonces</Link>
      </div>
      <OpportunitiesTable segment="pro" rows={rows} budget={settings.budget.cash} elargi={settings.budget.elargi} minGain={settings.thresholds.minGain} minGainPct={settings.thresholds.minGainPct} />
    </>
  );
}
