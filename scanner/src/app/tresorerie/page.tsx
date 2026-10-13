import TreasuryView from '@/components/TreasuryView';
import { getDeals, getSettings } from '@/lib/store';

export const dynamic = 'force-dynamic';

export default function TresoreriePage() {
  return (
    <>
      <div className="head">
        <div>
          <h1>Trésorerie</h1>
          <p className="muted">Cash disponible, cash immobilisé par phase, ventes à venir et simulations d’allocation sur 12-36 mois.</p>
        </div>
      </div>
      <TreasuryView deals={getDeals()} settings={getSettings()} />
    </>
  );
}
