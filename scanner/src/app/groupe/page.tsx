import GroupView from '@/components/GroupView';
import { getDeals, getSettings } from '@/lib/store';

export const dynamic = 'force-dynamic';

export default function GroupePage() {
  return (
    <>
      <div className="head">
        <div>
          <h1>Groupe TUÉ et Fils</h1>
          <p className="muted">Financière TUÉ et Fils (holding) · Immobilière TUÉ et Fils (marchand de biens, LCD) · SCI du Hameau de la Vie (colocation). Matrices éditables, enregistrées dans les paramètres.</p>
        </div>
      </div>
      <GroupView settings={getSettings()} deals={getDeals()} />
    </>
  );
}
