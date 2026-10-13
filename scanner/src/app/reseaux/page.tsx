import fs from 'node:fs';
import path from 'node:path';
import NetworksView from '@/components/NetworksView';
import { analyzeAll } from '@/lib/server';
import { toOppRow } from '@/lib/rows';
import { DATA_DIR } from '@/lib/store';

export const dynamic = 'force-dynamic';

export default function ReseauxPage() {
  const rows = analyzeAll().map(({ listing, analysis, zone, tension }) => toOppRow(listing, analysis, zone, tension));
  const f = path.join(DATA_DIR, 'logs', 'derniere-collecte.json');
  const last = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')).date : undefined;
  return (
    <>
      <div className="head">
        <div>
          <h1>Réseaux</h1>
          <p className="muted">Les grands réseaux d’agences à pignon sur rue et les canaux notariaux. AJP est collecté automatiquement chaque semaine (<code>npm run collect</code>) ; les autres se capturent depuis leur site.</p>
        </div>
      </div>
      <NetworksView rows={rows} lastCollect={last} />
    </>
  );
}
