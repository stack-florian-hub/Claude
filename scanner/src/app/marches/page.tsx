import MarketsView from '@/components/MarketsView';
import { ctx } from '@/lib/server';
import { zoneMarkets } from '@/lib/dvf';

export const dynamic = 'force-dynamic';

export default function MarchesPage() {
  const { settings, zones } = ctx();
  return (
    <>
      <div className="head">
        <div>
          <h1>Marchés</h1>
          <p className="muted">Les communes de vos zones comparées sur la DVF : niveau et tendance des prix, liquidité, valeur des dépendances et prime de revente séparée.</p>
        </div>
      </div>
      <MarketsView rows={zoneMarkets(zones, settings)} />
    </>
  );
}
