import { useState } from "react";
import { MOTIFS, SOURCES, euros, m2 } from "../lib.js";

// Contrôle du filtrage : annonces écartées et motif, pour vérifier qu'aucune vraie opportunité n'est perdue.
export default function Exclues({ data }) {
  const [motif, setMotif] = useState("");
  const lignes = (data.exclues || []).filter((x) => !motif || x.motif_exclusion === motif);
  const total = Object.values(data.motifs_exclusion || {}).reduce((s, n) => s + n, 0);
  return (
    <div className="h-full overflow-auto p-4">
      <div className="flex flex-wrap gap-2 mb-4 text-xs">
        <button onClick={() => setMotif("")} className={`px-2 py-1 rounded border ${!motif ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900" : "border-stone-300 dark:border-stone-700"}`}>
          Tous ({total})
        </button>
        {Object.entries(data.motifs_exclusion || {}).sort((a, b) => b[1] - a[1]).map(([k, n]) => (
          <button key={k} onClick={() => setMotif(k)} className={`px-2 py-1 rounded border ${motif === k ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900" : "border-stone-300 dark:border-stone-700"}`}>
            {MOTIFS[k] || k} ({n})
          </button>
        ))}
      </div>
      <table className="w-full text-xs">
        <thead><tr className="text-left text-stone-500"><th className="py-1 font-medium">Motif</th><th className="font-medium">Annonce</th><th className="font-medium">Commune</th><th className="text-right font-medium">Prix</th><th className="text-right font-medium">Surface</th><th className="font-medium pl-3">Source</th></tr></thead>
        <tbody>
          {lignes.map((x) => (
            <tr key={x.id} className="border-t border-stone-100 dark:border-stone-800">
              <td className="py-1 pr-2 whitespace-nowrap">{MOTIFS[x.motif_exclusion] || x.motif_exclusion}</td>
              <td className="pr-2"><a className="underline" href={x.url} target="_blank" rel="noreferrer">{x.titre || x.id}</a></td>
              <td className="pr-2 whitespace-nowrap">{x.commune} ({x.departement})</td>
              <td className="text-right tabular-nums whitespace-nowrap">{euros(x.prix)}</td>
              <td className="text-right tabular-nums whitespace-nowrap">{m2(x.surface_m2)}</td>
              <td className="pl-3 whitespace-nowrap">{SOURCES[x.source] || x.source}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-6 text-xs text-stone-500">
        Dernières collectes : {(data.collectes || []).map((c) => `${SOURCES[c.source] || c.source} ${c.vues} vues${c.erreur ? " (erreur)" : ""}`).join(" · ")}
      </p>
    </div>
  );
}
