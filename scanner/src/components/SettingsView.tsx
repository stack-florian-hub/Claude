'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { LotType, Range, Settings, Zone } from '@/lib/types';
import { api } from '@/lib/api';
import { LOT_LABELS } from '@/lib/defaults';
import { frDate, uid } from '@/lib/util';

interface DvfStat { dept: string; kind: string; n: number; years: number[]; builtAt?: string; refDate?: string; sizeMb: number }

const isArtifact = typeof window !== 'undefined' && !!(window as unknown as { __SCANNER_ARTIFACT__?: boolean }).__SCANNER_ARTIFACT__;

export default function SettingsView({ settings, zones, dvf }: { settings: Settings; zones: Zone[]; dvf: DvfStat[] }) {
  const router = useRouter();
  const [s, setS] = useState(settings);
  const [z, setZ] = useState(zones);
  const [msg, setMsg] = useState('');
  const sec = <K extends keyof Settings>(k: K, p: Partial<Settings[K]>) => setS({ ...s, [k]: { ...(s[k] as object), ...p } });
  const n = (v: number, f: (x: number) => void, step = 1) => <input type="number" value={v} step={step} onChange={(e) => f(+e.target.value)} />;
  const setZone = (i: number, p: Partial<Zone>) => setZ(z.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const list = (v: string) => v.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);

  async function saveAll() {
    await api('/api/settings', 'PUT', s);
    await api('/api/zones', 'PUT', z);
    setMsg('Paramètres enregistrés : les scores sont recalculés.');
    router.refresh();
  }
  async function demo(action: 'seed' | 'clear') {
    if (action === 'clear' && !confirm('Retirer toutes les annonces et opérations de démonstration ?')) return;
    await api('/api/demo', 'POST', { action });
    setMsg(action === 'clear' ? 'Données de démo retirées.' : 'Jeu de démo rechargé.');
    router.refresh();
  }
  const depts = [...new Set(z.map((x) => x.dept))].sort();

  return (
    <>
      <div className="row" style={{ marginBottom: 10 }}>
        <button className="primary" onClick={saveAll}>Enregistrer</button>
        {msg && <span className="pos">{msg}</span>}
      </div>

      <div className="grid g2">
        <div className="panel">
          <h2>Frais et seuils</h2>
          <div className="formgrid">
            <label className="field">Notaire droit commun %{n(s.fees.notaireDroitCommunPct, (x) => sec('fees', { notaireDroitCommunPct: x }), 0.1)}</label>
            <label className="field">Notaire régime MdB %{n(s.fees.notaireMdbPct, (x) => sec('fees', { notaireMdbPct: x }), 0.1)}</label>
            <label className="field">Agence revente %{n(s.fees.agenceRevPct, (x) => sec('fees', { agenceRevPct: x }), 0.5)}</label>
            <label className="field">Diagnostics / lot €{n(s.fees.diagnosticsParLot, (x) => sec('fees', { diagnosticsParLot: x }), 50)}</label>
            <label className="field">Division / lot €{n(s.fees.divisionParLot, (x) => sec('fees', { divisionParLot: x }), 100)}</label>
            <label className="field">Travaux auto : rénovation complète €/m²{n(s.fees.travauxLourdsM2 ?? 1000, (x) => sec('fees', { travauxLourdsM2: x }), 50)}</label>
            <label className="field">Travaux auto : rafraîchissement €/m²{n(s.fees.travauxLegersM2 ?? 300, (x) => sec('fees', { travauxLegersM2: x }), 50)}</label>
            <label className="field">Travaux auto : remise au goût du jour €/m² (par défaut, sauf bien refait){n(s.fees.travauxDecoM2 ?? 150, (x) => sec('fees', { travauxDecoM2: x }), 25)}</label>
            <label className="field">Charges par défaut €/mois{n(s.fees.chargesMensuellesDefaut, (x) => sec('fees', { chargesMensuellesDefaut: x }), 10)}</label>
            <label className="field">Taxe foncière / lot €/an{n(s.fees.taxeFonciereAnnuelleParLot, (x) => sec('fees', { taxeFonciereAnnuelleParLot: x }), 50)}</label>
            <label className="field">Alerte : gain min €{n(s.thresholds.minGain, (x) => sec('thresholds', { minGain: x }), 1000)}</label>
            <label className="field">Alerte : gain min %{n(s.thresholds.minGainPct, (x) => sec('thresholds', { minGainPct: x }))}</label>
          </div>
          <label className="row" style={{ marginTop: 8 }}><input type="checkbox" checked={s.fees.useMdbRegime} onChange={(e) => sec('fees', { useMdbRegime: e.target.checked })} /> Appliquer le régime marchand de biens (droits réduits) — seulement une fois l’objet social formalisé</label>
        </div>

        <div className="panel">
          <h2>Budget, financement, fiscalité</h2>
          <div className="formgrid">
            <label className="field">Trésorerie (budget) €{n(s.budget.cash, (x) => sec('budget', { cash: x }), 1000)}</label>
            <label className="field">Projet confortable ≤ € (score remonté){n(s.budget.confort ?? 150000, (x) => sec('budget', { confort: x }), 5000)}</label>
            <label className="field">Projet maximum € (au-delà, score abaissé){n(s.budget.elargi, (x) => sec('budget', { elargi: x }), 5000)}</label>
            <label className="field">Réserve (simulateur) €{n(s.budget.reserve, (x) => sec('budget', { reserve: x }), 1000)}</label>
            <label className="field">Apport bancaire %{n(s.financing.apportPct, (x) => sec('financing', { apportPct: x }))}</label>
            <label className="field">Taux crédit %{n(s.financing.rate, (x) => sec('financing', { rate: x }), 0.1)}</label>
            <label className="field">IS taux réduit %{n(s.tax.isReducedRate, (x) => sec('tax', { isReducedRate: x }))}</label>
            <label className="field">Plafond taux réduit €{n(s.tax.isReducedCap, (x) => sec('tax', { isReducedCap: x }), 500)}</label>
            <label className="field">IS taux normal %{n(s.tax.isRate, (x) => sec('tax', { isRate: x }))}</label>
          </div>
          <label className="row" style={{ marginTop: 8 }}><input type="checkbox" checked={s.financing.enabled} onChange={(e) => sec('financing', { enabled: e.target.checked })} /> Financement bancaire si le comptant dépasse la trésorerie</label>
          <label className="row"><input type="checkbox" checked={s.tax.tvaSurMarge} onChange={(e) => sec('tax', { tvaSurMarge: e.target.checked })} /> TVA sur marge dans le simulateur</label>
        </div>
      </div>

      <div className="grid g2">
        <div className="panel">
          <h2>Valeurs par défaut des dépendances (si DVF insuffisante)</h2>
          <table>
            <thead><tr><th>Tension</th>{(['garage', 'parking', 'cave'] as const).map((t) => <th key={t} className="num">{LOT_LABELS[t]} bas / moy / haut</th>)}</tr></thead>
            <tbody>
              {([3, 2, 1] as const).map((t) => (
                <tr key={t}>
                  <td>{t === 3 ? '3 – très tendu' : t === 2 ? '2 – tendu' : '1 – détendu'}</td>
                  {(['garage', 'parking', 'cave'] as const).map((k) => (
                    <td key={k} className="num">
                      {(['low', 'mid', 'high'] as (keyof Range)[]).map((r) => (
                        <input key={r} type="number" step={500} style={{ width: 66 }} value={s.defaults[t][k][r]} onChange={(e) => setS({ ...s, defaults: { ...s.defaults, [t]: { ...s.defaults[t], [k]: { ...s.defaults[t][k], [r]: +e.target.value } } } })} />
                      ))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <h3 style={{ marginTop: 10 }}>Délai de revente par type (mois)</h3>
          <div className="row">
            {(Object.keys(s.resaleMonths) as LotType[]).map((t) => (
              <label key={t} className="field">{LOT_LABELS[t]}<input type="number" style={{ width: 60 }} value={s.resaleMonths[t]} onChange={(e) => setS({ ...s, resaleMonths: { ...s.resaleMonths, [t]: +e.target.value } })} /></label>
            ))}
          </div>
          <h3 style={{ marginTop: 10 }}>Comparables DVF</h3>
          <div className="formgrid">
            <label className="field">Années de ventes{n(s.dvf.years, (x) => sec('dvf', { years: x }))}</label>
            <label className="field">Min. ventes même rue{n(s.dvf.minStreet, (x) => sec('dvf', { minStreet: x }))}</label>
            <label className="field">Min. ventes commune{n(s.dvf.minCommune, (x) => sec('dvf', { minCommune: x }))}</label>
          </div>
          <label className="row" style={{ marginTop: 6 }}><input type="checkbox" checked={s.dvf.useDemo} onChange={(e) => sec('dvf', { useDemo: e.target.checked })} /> Utiliser la DVF de démonstration (fictive) quand la vraie DVF d’un département manque</label>
        </div>

        <div className="panel">
          <h2>Données DVF chargées</h2>
          <table>
            <thead><tr><th>Dépt</th><th>État</th><th className="num">Mutations</th><th>Années</th><th>Dernière vente</th><th className="num">Taille</th></tr></thead>
            <tbody>
              {dvf.map((d) => (
                <tr key={d.dept}>
                  <td>{d.dept}</td>
                  <td>{d.kind === 'reel' ? <span className="tag good">réelle</span> : d.kind === 'demo' ? <span className="tag warn">démo fictive</span> : <span className="tag bad">absente</span>}</td>
                  <td className="num">{d.n.toLocaleString('fr-FR')}</td>
                  <td>{d.years.join(', ')}</td>
                  <td>{frDate(d.refDate)}</td>
                  <td className="num">{d.sizeMb ? `${d.sizeMb} Mo` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {isArtifact ? <p className="small" style={{ marginTop: 8 }}>Mise à jour automatique chaque lundi matin : nouvelles ventes DVF dès leur publication (avril et octobre), annonces AJP, recalcul des scores.</p> : (<>
          <p className="small" style={{ marginTop: 8 }}>Charger ou mettre à jour (gratuit, data.gouv.fr), depuis le dossier <code>scanner</code> :</p>
          <pre>npm run dvf:fetch -- {depts.join(' ')}</pre>
          <p className="small muted">Ou à partir d’un fichier DVF brut déjà téléchargé : <code>npm run dvf:import -- ValeursFoncieres-2024.txt --dept {depts.join(',')}</code>. Recharger la page ensuite.</p>

          </>)}
          <h2 style={{ marginTop: 14 }}>Connecteurs optionnels</h2>
          <label className="row"><input type="checkbox" checked={s.connectors.geocode} onChange={(e) => sec('connectors', { geocode: e.target.checked })} /> Géocoder les annonces importées (Base Adresse Nationale, gratuit) : comparables à moins de 300 m</label>
          <label className="row"><input type="checkbox" checked={s.connectors.castorus.enabled} onChange={(e) => sec('connectors', { castorus: { ...s.connectors.castorus, enabled: e.target.checked } })} /> Castorus premium (historique des prix affichés)</label>
          {s.connectors.castorus.enabled && <input placeholder="clé / identifiant" value={s.connectors.castorus.apiKey ?? ''} onChange={(e) => sec('connectors', { castorus: { ...s.connectors.castorus, apiKey: e.target.value } })} />}
          <label className="row"><input type="checkbox" checked={s.connectors.meilleursAgents.enabled} onChange={(e) => sec('connectors', { meilleursAgents: { ...s.connectors.meilleursAgents, enabled: e.target.checked } })} /> MeilleursAgents pro (estimation à l’adresse)</label>
          {s.connectors.meilleursAgents.enabled && <input placeholder="clé / identifiant" value={s.connectors.meilleursAgents.apiKey ?? ''} onChange={(e) => sec('connectors', { meilleursAgents: { ...s.connectors.meilleursAgents, apiKey: e.target.value } })} />}
          <p className="small muted">Castorus et MeilleursAgents sont prévus dans le code (src/lib/providers/valuation.ts) mais pas encore branchés : il faudra adapter l’appel à l’accès obtenu. En attendant, saisir baisses de prix et estimations dans la fiche.</p>

          {!isArtifact && (<>
          <h2 style={{ marginTop: 14 }}>Jeu de démonstration</h2>
          <div className="row">
            <button onClick={() => demo('seed')}>Recharger la démo</button>
            <button className="danger" onClick={() => demo('clear')}>Retirer la démo</button>
          </div>
          </>)}
        </div>
      </div>

      <div className="panel">
        <div className="row between">
          <h2>Zones cibles ({z.filter((x) => x.active).length} actives)</h2>
          <button onClick={() => setZ([...z, { id: uid('z'), name: 'Nouvelle zone', dept: '', postalCodes: [], communes: [], tension: 2, priority: 2, active: true }])}>+ Zone</button>
        </div>
        <p className="small muted">Une annonce appartient à une zone si son code postal, son code INSEE ou le nom de sa commune y figure. La tension (1 à 3) règle les valeurs par défaut des garages/parkings/caves et le score de liquidité.</p>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead><tr><th>Active</th><th>Nom</th><th>Dépt</th><th>Codes postaux</th><th>Communes (INSEE ou noms)</th><th>Tension</th><th>Priorité</th><th>Littoral</th><th></th></tr></thead>
            <tbody>
              {z.map((x, i) => (
                <tr key={x.id}>
                  <td><input type="checkbox" checked={x.active} onChange={(e) => setZone(i, { active: e.target.checked })} /></td>
                  <td><input value={x.name} onChange={(e) => setZone(i, { name: e.target.value })} style={{ width: 230 }} /></td>
                  <td><input value={x.dept} onChange={(e) => setZone(i, { dept: e.target.value })} style={{ width: 40 }} /></td>
                  <td><input defaultValue={x.postalCodes.join(', ')} onBlur={(e) => setZone(i, { postalCodes: list(e.target.value) })} style={{ width: 190 }} /></td>
                  <td><input defaultValue={x.communes.join(', ')} onBlur={(e) => setZone(i, { communes: list(e.target.value) })} style={{ width: 190 }} /></td>
                  <td><select value={x.tension} onChange={(e) => setZone(i, { tension: +e.target.value as Zone['tension'] })}><option value={3}>3 très tendu</option><option value={2}>2 tendu</option><option value={1}>1 détendu</option></select></td>
                  <td><input type="number" value={x.priority} style={{ width: 50 }} onChange={(e) => setZone(i, { priority: +e.target.value })} /></td>
                  <td><input type="checkbox" checked={!!x.coastal} onChange={(e) => setZone(i, { coastal: e.target.checked })} /></td>
                  <td><button className="danger" onClick={() => setZ(z.filter((_, j) => j !== i))}>×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
