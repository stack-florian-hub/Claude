import { DEPS, SOURCES, SUIVIS, TYPOS } from "../lib.js";

export const FILTRES_DEFAUT = {
  deps: [], typos: [], sources: [], prixMin: "", prixMax: "", surfaceMin: "", prixM2Max: "", scoreMin: 0,
  confiance: "", texte: "", favoris: false, suivi: "", masquerAbandon: true,
};

export function appliquerFiltres(annonces, f) {
  const num = (v) => (v === "" || v == null ? null : Number(v));
  const q = f.texte.trim().toLowerCase();
  return annonces.filter((a) =>
    (!f.deps.length || f.deps.includes(a.departement)) &&
    (!f.typos.length || f.typos.includes(a.typologie)) &&
    (!f.sources.length || f.sources.includes(a.source)) &&
    (num(f.prixMin) == null || a.prix >= num(f.prixMin)) &&
    (num(f.prixMax) == null || a.prix <= num(f.prixMax)) &&
    (num(f.surfaceMin) == null || (a.surface_m2 || 0) >= num(f.surfaceMin)) &&
    (num(f.prixM2Max) == null || (a.prix_m2 != null && a.prix_m2 <= num(f.prixM2Max))) &&
    (a.score ?? 0) >= f.scoreMin &&
    (!f.confiance || a.confiance === f.confiance) &&
    (!f.favoris || a.favori) &&
    (!f.suivi || a.suivi === f.suivi) &&
    (!f.masquerAbandon || a.suivi !== "abandon") &&
    (!q || `${a.titre} ${a.commune} ${a.description} ${a.note}`.toLowerCase().includes(q)));
}

function Puces({ options, valeur, onChange, format = (k, l) => l }) {
  return (
    <div className="flex flex-wrap gap-1">
      {Object.entries(options).map(([k, l]) => {
        const on = valeur.includes(k);
        return (
          <button key={k} onClick={() => onChange(on ? valeur.filter((x) => x !== k) : [...valeur, k])}
            className={`px-2 py-0.5 rounded-full border text-xs ${on ? "bg-stone-900 text-white border-stone-900 dark:bg-stone-100 dark:text-stone-900 dark:border-stone-100" : "border-stone-300 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800"}`}>
            {format(k, l)}
          </button>
        );
      })}
    </div>
  );
}

const champ = "w-24 rounded border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 px-2 py-1 text-xs";

export default function Filtres({ filtres: f, setFiltres, annonces }) {
  const set = (k) => (v) => setFiltres((p) => ({ ...p, [k]: v }));
  const sourcesPresentes = Object.fromEntries(Object.entries(SOURCES).filter(([k]) => annonces.some((a) => a.source === k)));
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2 border-b border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-950 text-xs">
      <Puces options={DEPS} valeur={f.deps} onChange={set("deps")} format={(k) => k} />
      <Puces options={TYPOS} valeur={f.typos} onChange={set("typos")} />
      <Puces options={sourcesPresentes} valeur={f.sources} onChange={set("sources")} />
      <label className="flex items-center gap-1">Prix
        <input className={champ} placeholder="min" inputMode="numeric" value={f.prixMin} onChange={(e) => set("prixMin")(e.target.value)} />
        <input className={champ} placeholder="max" inputMode="numeric" value={f.prixMax} onChange={(e) => set("prixMax")(e.target.value)} />
      </label>
      <label className="flex items-center gap-1">Surface ≥
        <input className={champ} placeholder="m²" inputMode="numeric" value={f.surfaceMin} onChange={(e) => set("surfaceMin")(e.target.value)} />
      </label>
      <label className="flex items-center gap-1">€/m² ≤
        <input className={champ} placeholder="ex. 3" inputMode="decimal" value={f.prixM2Max} onChange={(e) => set("prixM2Max")(e.target.value)} />
      </label>
      <label className="flex items-center gap-2">Score ≥ <b className="tabular-nums w-5">{f.scoreMin}</b>
        <input type="range" min="0" max="90" step="5" value={f.scoreMin} onChange={(e) => set("scoreMin")(Number(e.target.value))} />
      </label>
      <select className={champ + " w-auto"} value={f.confiance} onChange={(e) => set("confiance")(e.target.value)}>
        <option value="">Toute confiance</option><option value="haute">Confiance haute</option>
        <option value="moyenne">Moyenne</option><option value="faible">Faible</option>
      </select>
      <select className={champ + " w-auto"} value={f.suivi} onChange={(e) => set("suivi")(e.target.value)}>
        <option value="">Tout suivi</option>
        {Object.entries(SUIVIS).filter(([k]) => k).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      <label className="flex items-center gap-1"><input type="checkbox" checked={f.favoris} onChange={(e) => set("favoris")(e.target.checked)} /> Favoris</label>
      <label className="flex items-center gap-1"><input type="checkbox" checked={f.masquerAbandon} onChange={(e) => set("masquerAbandon")(e.target.checked)} /> Masquer abandonnés</label>
      <input className={champ + " w-40"} placeholder="Rechercher (commune, mot…)" value={f.texte} onChange={(e) => set("texte")(e.target.value)} />
      <button className="underline text-stone-500" onClick={() => setFiltres(FILTRES_DEFAUT)}>Réinitialiser</button>
    </div>
  );
}
