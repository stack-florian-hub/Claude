import PipelineBoard from '@/components/PipelineBoard';
import { getDeals, getSettings } from '@/lib/store';

export const dynamic = 'force-dynamic';

export default function PipelinePage() {
  return (
    <>
      <div className="head">
        <div>
          <h1>Pipeline</h1>
          <p className="muted">Repéré → visité → offre → signé → revente lot par lot → clos. Trésorerie engagée et gains réalisés vs prévus.</p>
        </div>
      </div>
      <PipelineBoard deals={getDeals()} settings={getSettings()} />
    </>
  );
}
