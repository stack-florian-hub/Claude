import { useEffect, useMemo, useState } from "react";
import Filtres, { FILTRES_DEFAUT, appliquerFiltres } from "./components/Filtres.jsx";
import CarteView from "./components/CarteView.jsx";
import TableauView from "./components/TableauView.jsx";
import Fiche from "./components/Fiche.jsx";
import Exclues from "./components/Exclues.jsx";
import { DEPS, chargerDonnees, chargerNotes, dateFr, enregistrerNote } from "./lib.js";

const VUES = [["carte", "Carte"], ["tableau", "Tableau"], ["exclues", "Exclues"]];

export default function App() {
  const [data, setData] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [notes, setNotes] = useState({});
  const [modeNotes, setModeNotes] = useState("local");
  const [filtres, setFiltres] = useState(FILTRES_DEFAUT);
  const [vue, setVue] = useState("carte");
  const [selId, setSelId] = useState(null);

  useEffect(() => {
    chargerDonnees().then(setData).catch((e) => setErreur(e.message));
    chargerNotes().then(({ notes, mode }) => { setNotes(notes); setModeNotes(mode); });
  }, []);

  // Les notes saisies dans le dashboard priment sur celles de l'export
  const annonces = useMemo(() => (data?.annonces || []).map((a) => {
    const n = notes[a.id];
    return n ? { ...a, note: n.texte ?? a.note, suivi: n.suivi ?? a.suivi, favori: n.favori ?? a.favori } : a;
  }), [data, notes]);
  const visibles = useMemo(() => appliquerFiltres(annonces, filtres), [annonces, filtres]);
  const sel = annonces.find((a) => a.id === selId);

  async function sauverNote(id, patch) {
    const cur = annonces.find((a) => a.id === id);
    const note = { texte: cur.note, suivi: cur.suivi, favori: cur.favori, ...patch };
    setNotes((n) => ({ ...n, [id]: note }));
    setModeNotes(await enregistrerNote(id, note, modeNotes));
  }

  if (erreur) return <div className="p-6 max-w-xl text-sm"><h1 className="text-lg font-semibold mb-2">Veille foncière</h1>{erreur}</div>;
  if (!data) return <div className="p-6 text-sm text-stone-500">Chargement…</div>;

  const parDep = Object.keys(DEPS).map((d) => [d, visibles.filter((a) => a.departement === d).length]);

  return (
    <div className="h-full flex flex-col">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 border-b border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900">
        <div>
          <h1 className="text-base font-semibold leading-tight">Veille foncière 85 · 44 · 49 · 37</h1>
          <p className="text-xs text-stone-500">Mise à jour {dateFr(data.genere_le)} · notes {modeNotes === "api" ? "enregistrées en base" : "dans ce navigateur"}</p>
        </div>
        <div className="flex gap-4 text-sm">
          <span><b className="tabular-nums">{visibles.length}</b> <span className="text-stone-500">/ {annonces.length} terrains</span></span>
          {parDep.map(([d, n]) => <span key={d} className="text-stone-500"><b className="text-stone-900 dark:text-stone-100 tabular-nums">{n}</b> en {d}</span>)}
        </div>
        <nav className="ml-auto flex rounded-md border border-stone-300 dark:border-stone-700 overflow-hidden text-sm">
          {VUES.map(([k, l]) => (
            <button key={k} onClick={() => setVue(k)}
              className={`px-3 py-1.5 ${vue === k ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900" : "hover:bg-stone-100 dark:hover:bg-stone-800"}`}>
              {l}{k === "exclues" ? ` (${data.exclues?.length || 0})` : ""}
            </button>
          ))}
        </nav>
      </header>
      {vue !== "exclues" && <Filtres filtres={filtres} setFiltres={setFiltres} annonces={annonces} />}
      <main className="flex-1 min-h-0 flex">
        <div className="flex-1 min-w-0 min-h-0">
          {vue === "carte" && <CarteView annonces={visibles} selId={selId} onSelect={setSelId} />}
          {vue === "tableau" && <TableauView annonces={visibles} selId={selId} onSelect={setSelId} onFavori={(id, f) => sauverNote(id, { favori: f })} />}
          {vue === "exclues" && <Exclues data={data} />}
        </div>
        {sel && vue !== "exclues" && <Fiche a={sel} onClose={() => setSelId(null)} onNote={(p) => sauverNote(sel.id, p)} />}
      </main>
    </div>
  );
}
