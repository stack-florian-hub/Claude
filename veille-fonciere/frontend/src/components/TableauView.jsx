import { useMemo, useState } from "react";
import { SOURCES, SUIVIS, TYPOS, couleurScore, euros, eurosM2, m2 } from "../lib.js";

const COLS = [
  ["favori", "★", (a) => (a.favori ? 1 : 0)],
  ["score", "Score", (a) => a.score ?? -1],
  ["commune", "Commune", (a) => a.commune || ""],
  ["departement", "Dép.", (a) => a.departement],
  ["typologie", "Type", (a) => a.typologie || ""],
  ["prix", "Prix", (a) => a.prix ?? 0],
  ["surface_m2", "Surface", (a) => a.surface_m2 ?? 0],
  ["prix_m2", "€/m²", (a) => a.prix_m2 ?? Infinity],
  ["decote", "vs DVF", (a) => (a.prix_m2 && a.dvf?.mediane_m2 ? a.prix_m2 / a.dvf.mediane_m2 : Infinity)],
  ["zone", "Zone PLU", (a) => a.urbanisme?.zone_plu || ""],
  ["dist_u", "→ zone U/AU", (a) => Math.min(a.urbanisme?.dist_zone_u_m ?? 1e9, a.urbanisme?.dist_zone_au_m ?? 1e9)],
  ["source", "Source", (a) => a.source],
  ["suivi", "Suivi", (a) => a.suivi || ""],
  ["premiere_vue", "Vu le", (a) => a.premiere_vue || ""],
];

export default function TableauView({ annonces, selId, onSelect, onFavori }) {
  const [tri, setTri] = useState({ col: "score", desc: true });
  const lignes = useMemo(() => {
    const get = COLS.find((c) => c[0] === tri.col)[2];
    return [...annonces].sort((a, b) => {
      const x = get(a), y = get(b);
      const r = typeof x === "string" ? x.localeCompare(y, "fr") : x - y;
      return tri.desc ? -r : r;
    });
  }, [annonces, tri]);

  return (
    <div className="h-full overflow-auto">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-white dark:bg-stone-900 shadow-sm z-10">
          <tr>
            {COLS.map(([k, l]) => (
              <th key={k} onClick={() => setTri((t) => ({ col: k, desc: t.col === k ? !t.desc : true }))}
                className="text-left font-medium px-2 py-2 cursor-pointer select-none whitespace-nowrap text-stone-600 dark:text-stone-300">
                {l}{tri.col === k ? (tri.desc ? " ↓" : " ↑") : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lignes.map((a) => {
            const u = a.urbanisme || {};
            const d = Math.min(u.dist_zone_u_m ?? 1e9, u.dist_zone_au_m ?? 1e9);
            const ratio = a.prix_m2 && a.dvf?.mediane_m2 ? a.prix_m2 / a.dvf.mediane_m2 : null;
            return (
              <tr key={a.id} onClick={() => onSelect(a.id)}
                className={`border-t border-stone-100 dark:border-stone-800 cursor-pointer ${a.id === selId ? "bg-amber-50 dark:bg-amber-950/40" : "hover:bg-stone-50 dark:hover:bg-stone-900"}`}>
                <td className="px-2 py-1.5">
                  <button aria-label="Favori" onClick={(e) => { e.stopPropagation(); onFavori(a.id, !a.favori); }}
                    className={a.favori ? "text-amber-500" : "text-stone-300 dark:text-stone-600"}>★</button>
                </td>
                <td className="px-2 py-1.5 whitespace-nowrap">
                  <span className="inline-flex items-center gap-1.5 tabular-nums font-semibold">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: couleurScore(a.score) }} />{a.score ?? "—"}
                  </span>
                  {a.confiance === "faible" && <span className="ml-1 text-stone-400" title="Confiance faible">?</span>}
                </td>
                <td className="px-2 py-1.5 whitespace-nowrap">{a.commune}</td>
                <td className="px-2 py-1.5">{a.departement}</td>
                <td className="px-2 py-1.5">{TYPOS[a.typologie] || a.typologie}</td>
                <td className="px-2 py-1.5 tabular-nums text-right whitespace-nowrap">{euros(a.prix)}</td>
                <td className="px-2 py-1.5 tabular-nums text-right whitespace-nowrap">{m2(a.surface_m2)}</td>
                <td className="px-2 py-1.5 tabular-nums text-right whitespace-nowrap">{eurosM2(a.prix_m2)}</td>
                <td className="px-2 py-1.5 tabular-nums text-right whitespace-nowrap">{ratio != null ? `${Math.round(ratio * 100)} %` : "—"}</td>
                <td className="px-2 py-1.5">{u.zone_plu || u.type_zone || "—"}</td>
                <td className="px-2 py-1.5 tabular-nums text-right whitespace-nowrap">{a.precision_geo === "commune" ? "?" : d < 1e9 ? `${d} m` : "> 1,5 km"}</td>
                <td className="px-2 py-1.5 whitespace-nowrap">{SOURCES[a.source] || a.source}</td>
                <td className="px-2 py-1.5">{SUIVIS[a.suivi || ""]}</td>
                <td className="px-2 py-1.5 whitespace-nowrap text-stone-500">{(a.premiere_vue || "").slice(0, 10)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!lignes.length && <p className="p-6 text-sm text-stone-500">Aucun terrain ne correspond aux filtres.</p>}
    </div>
  );
}
