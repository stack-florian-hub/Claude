import SettingsView from '@/components/SettingsView';
import { getSettings, getZones } from '@/lib/store';
import { dvfStatus } from '@/lib/dvf';

export const dynamic = 'force-dynamic';

export default function ParametresPage() {
  const settings = getSettings();
  const zones = getZones();
  const depts = [...new Set(zones.map((z) => z.dept))].filter(Boolean).sort();
  return (
    <>
      <div className="head">
        <div>
          <h1>Paramètres</h1>
          <p className="muted">Hypothèses de calcul, zones cibles, données DVF et connecteurs.</p>
        </div>
      </div>
      <SettingsView settings={settings} zones={zones} dvf={dvfStatus(depts, settings.dvf.useDemo)} />
    </>
  );
}
