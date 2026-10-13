import { notFound } from 'next/navigation';
import ListingDetail from '@/components/ListingDetail';
import { getDeals, getListing } from '@/lib/store';
import { analyzeAll, ctx } from '@/lib/server';
import { marketStats } from '@/lib/dvf-query';
import { buildChecklist } from '@/lib/checklist';
import { simInputFromAnalysis } from '@/lib/simulation';
import { dealFromListing } from '@/lib/deals';

export const dynamic = 'force-dynamic';

export default function OpportunitePage({ params }: { params: { id: string } }) {
  const l = getListing(params.id);
  if (!l) notFound();
  const { settings, dvf } = ctx();
  const row = analyzeAll([l])[0];
  const stats = marketStats(dvf.slice(l.address), settings);
  const deal = getDeals().find((d) => d.listingId === l.id);
  return (
    <ListingDetail
      listing={l}
      analysis={row.analysis}
      zone={row.zone}
      tension={row.tension}
      settings={settings}
      stats={stats}
      checklist={buildChecklist(l, row.analysis, settings)}
      sim={simInputFromAnalysis(l, row.analysis, settings)}
      newDeal={dealFromListing(l, row.analysis, settings)}
      dealId={deal?.id}
    />
  );
}
