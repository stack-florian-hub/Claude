import { useEffect, useState } from "react";
import { PRECISIONS, SOURCES, SUIVIS, TYPOS, couleurScore, dateFr, euros, eurosM2, liensExternes, m2, metres } from "../lib.js";

const COMPOSANTES = [
  ["s_decote", "Décote vs DVF", 30],
  ["s_mutation", "Potentiel mutation PLU", 35],
  ["s_acces", "Accessibilité & usage", 20],
  ["s_rarete", "Rareté / emplacement", 15],
];

function Section({ titre, children }) {
  return (
    <section className="py-3 border-t border-stone-200 dark:border-stone-800">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500 mb-2">{titre}</h3>
      {children}
    </section>
  );
}

function Ligne({ k, v }) {
  return (
    <div className="flex justify-between gap-3 text-xs py-0.5">
      <span className="text-stone-500">{k}</span><span className="text-right">{v ?? "—"}</span>
    </div>
  );
}

const ouiNon = (v) => (v == null ? "non vérifié" : v ? "Oui" : "Non");

export default function Fiche({ a, onClose, onNote }) {
  const [texte, setTexte] = useState(a.note || "");
  const [etat, setEtat] = useState("");
  useEffect(() => { setTexte(a.note || ""); setEtat(""); }, [a.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const u = a.urbanisme || {};
  const env = a.environnement || {};
  const dvf = a.dvf || {};
  const baisse = a.prix_initial && a.prix && a.prix < a.prix_initial;

  return (
    <aside className="w-full max-w-md shrink-0 h-full overflow-y-auto border-l border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 px-4 pb-8 absolute inset-0 sm:static z-[1100]">
      <div className="sticky top-0 bg-white dark:bg-stone-900 pt-3 pb-2 flex items-start gap-2 z-10">
        <div className="flex-1">
          <div className="text-xs text-stone-500">{SOURCES[a.source] || a.source} · {TYPOS[a.typologie] || a.typologie} · dép. {a.departement}</div>
          <h2 className="font-semibold leading-snug">{a.commune} — {m2(a.surface_m2)}</h2>
        </div>
        <button onClick={() => onNote({ favori: !a.favori })} aria-label="Favori"
          className={`text-xl ${a.favori ? "text-amber-500" : "text-stone-300 dark:text-stone-600"}`}>★</button>
        <button onClick={onClose} aria-label="Fermer" className="text-xl text-stone-400 hover:text-stone-700">×</button>
      </div>

      {a.photo_url && <img src={a.photo_url} alt="" className="w-full h-44 object-cover rounded-md mb-3" loading="lazy"
        referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.display = "none"; }} />}

      <div className="flex items-end gap-4 mb-2">
        <div>
          <div className="text-2xl font-semibold tabular-nums">{euros(a.prix)}</div>
          <div className="text-xs text-stone-500">{eurosM2(a.prix_m2)}{baisse && <> · <span className="text-stone-700 dark:text-stone-300">baisse depuis {euros(a.prix_initial)}</span></>}</div>
        </div>
        <div className="ml-auto text-right">
          <div className="text-3xl font-bold tabular-nums" style={{ color: couleurScore(a.score) }}>{a.score ?? "—"}</div>
          <div className="text-xs text-stone-500">/ 100 · confiance {a.confiance || "—"}</div>
        </div>
      </div>
      <a href={a.url} target="_blank" rel="noreferrer"
        className="block text-center rounded-md bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 py-2 text-sm font-medium mb-1">
        Voir l'annonce source ↗
      </a>
      {a.mode_vente !== "gre_a_gre" && <p className="text-xs text-stone-500 mb-1">Mode de vente : {a.mode_vente === "encheres" ? "enchères" : "vente interactive (enchères en ligne)"}</p>}

      <Section titre="Décomposition du score">
        {COMPOSANTES.map(([k, l, max]) => (
          <div key={k} className="mb-1.5">
            <div className="flex justify-between text-xs"><span>{l}</span><span className="tabular-nums">{a[k] ?? 0} / {max}</span></div>
            <div className="h-1.5 rounded-full bg-stone-100 dark:bg-stone-800 overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${((a[k] ?? 0) / max) * 100}%`, background: couleurScore(a.score) }} />
            </div>
          </div>
        ))}
        <ul className="mt-2 space-y-1 text-xs text-stone-600 dark:text-stone-300 list-disc pl-4">
          {(a.explications || []).map((e, i) => <li key={i}>{e}</li>)}
        </ul>
      </Section>

      {!!a.alertes?.length && (
        <Section titre="Relevé dans l'annonce">
          <div className="flex flex-wrap gap-1">
            {a.alertes.map((x) => <span key={x.code} className="text-xs rounded border border-stone-300 dark:border-stone-700 px-1.5 py-0.5">{x.libelle}</span>)}
          </div>
        </Section>
      )}

      <Section titre="Urbanisme (Géoportail de l'urbanisme)">
        <Ligne k="Localisation" v={PRECISIONS[a.precision_geo] || a.precision_geo} />
        {a.precision_geo === "commune" && (
          <p className="text-xs text-stone-500 my-1">
            Position = centre de la commune : zonage et distances non significatifs. Pour affiner, trouvez la parcelle puis :
            <code className="block mt-1 bg-stone-100 dark:bg-stone-800 rounded px-1 py-0.5">python -m vf localiser "{a.id}" {a.code_insee || "INSEE"}000XX0000</code>
          </p>
        )}
        <Ligne k={a.precision_geo === "approx" ? "Parcelle au point approché" : "Parcelle"} v={u.parcelle_idu ? `${u.parcelle_idu} (section ${u.section})` : a.ref_cadastrale} />
        <Ligne k="Contenance cadastrale" v={u.contenance_m2 ? m2(u.contenance_m2) : null} />
        <Ligne k="Zone" v={u.zone_plu ? `${u.zone_plu} (${u.type_zone}, ${u.doc_urbanisme})` : u.type_zone} />
        <Ligne k="Zone U la plus proche" v={metres(u.dist_zone_u_m)} />
        <Ligne k="Zone AU la plus proche" v={metres(u.dist_zone_au_m)} />
        <Ligne k="OAP à proximité" v={u.oap_proche_m != null ? metres(u.oap_proche_m) : "aucune < 600 m"} />
        {!!u.prescriptions?.length && <Ligne k="Prescriptions" v={u.prescriptions.join(", ")} />}
        {!!u.servitudes?.length && <Ligne k="Servitudes (SUP)" v={u.servitudes.join(", ")} />}
      </Section>

      <Section titre="Risques & environnement">
        <Ligne k="Natura 2000" v={ouiNon(env.natura2000)} />
        <Ligne k="ZNIEFF" v={ouiNon(env.znieff)} />
        <Ligne k="PPR inondation (commune)" v={env.ppr_inondation?.length ? env.ppr_inondation.join(", ") : "Aucun"} />
        {!!env.azi?.length && <Ligne k="Atlas zones inondables" v={env.azi.join(", ")} />}
        {!!env.risques_commune?.length && <Ligne k="Risques recensés" v={[...new Set(env.risques_commune)].slice(0, 6).join(", ")} />}
        <Ligne k="Route publique" v={env.dist_route_m != null ? `${metres(env.dist_route_m)}${env.nature_route ? ` (${env.nature_route})` : ""}` : null} />
        {env.dist_littoral_km != null && <Ligne k="Littoral" v={`${env.dist_littoral_km} km`} />}
        <Ligne k="Agglomération" v={env.agglo_proche ? `${env.agglo_proche} à ${env.dist_agglo_km} km` : null} />
      </Section>

      <Section titre="Comparables DVF (ventes réelles)">
        <Ligne k="Référence" v={{ section: "même section", commune: "commune", departement: "département", repere_regional: "repère régional" }[dvf.niveau] || "—"} />
        <Ligne k="Ventes comparables" v={dvf.n} />
        <Ligne k="Prix/m² (p25 · médiane · p75)" v={dvf.mediane_m2 != null ? `${dvf.p25_m2} · ${dvf.mediane_m2} · ${dvf.p75_m2} €/m²` : null} />
        {!!dvf.ventes?.length && (
          <table className="w-full text-xs mt-2">
            <thead><tr className="text-stone-500"><th className="text-left font-normal">Date</th><th className="text-right font-normal">Prix</th><th className="text-right font-normal">Surface</th><th className="text-right font-normal">€/m²</th><th className="text-left font-normal pl-2">Nature</th></tr></thead>
            <tbody>
              {dvf.ventes.map((v) => (
                <tr key={v.id_mutation} className="border-t border-stone-100 dark:border-stone-800">
                  <td>{dateFr(v.date)}</td><td className="text-right tabular-nums">{euros(v.valeur)}</td>
                  <td className="text-right tabular-nums">{m2(v.surface_m2)}</td><td className="text-right tabular-nums">{v.prix_m2}</td>
                  <td className="pl-2 truncate max-w-[7rem]" title={v.nature}>{v.nature}{v.section ? ` (${v.section})` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {a.historique_prix?.length > 1 && (
        <Section titre="Historique du prix">
          {a.historique_prix.map((h) => <Ligne key={h.date} k={dateFr(h.date)} v={euros(h.prix)} />)}
        </Section>
      )}

      <Section titre="Note personnelle">
        <select className="mb-2 w-full rounded border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 px-2 py-1 text-xs"
          value={a.suivi || ""} onChange={(e) => onNote({ suivi: e.target.value })}>
          {Object.entries(SUIVIS).map(([k, l]) => <option key={k} value={k}>{k ? l : "Statut de suivi…"}</option>)}
        </select>
        <textarea rows={5} value={texte} onChange={(e) => { setTexte(e.target.value); setEtat("modifié"); }}
          placeholder="Appel mairie, visite, avis voisin, prix négocié…"
          className="w-full rounded border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 px-2 py-1.5 text-sm" />
        <div className="flex items-center gap-3 mt-1">
          <button onClick={async () => { await onNote({ texte }); setEtat("enregistré"); }}
            className="rounded bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 px-3 py-1 text-xs">Enregistrer la note</button>
          <span className="text-xs text-stone-500">{etat}</span>
        </div>
      </Section>

      <Section titre="Liens utiles">
        <ul className="text-xs space-y-1">
          {liensExternes(a).map(([l, href]) => <li key={l}><a className="underline" href={href} target="_blank" rel="noreferrer">{l} ↗</a></li>)}
        </ul>
      </Section>

      <Section titre="Description de l'annonce">
        <p className="text-xs whitespace-pre-line text-stone-600 dark:text-stone-300"
          dangerouslySetInnerHTML={{ __html: (a.description || "").replace(/<(?!br\s*\/?>)[^>]+>/gi, "") }} />
        <p className="text-xs text-stone-400 mt-2">Vue pour la première fois le {dateFr(a.premiere_vue)} · publiée le {dateFr(a.date_publication)}</p>
        {!!a.erreurs_enrichissement?.length && <p className="text-xs text-stone-400 mt-1">Données incomplètes : {a.erreurs_enrichissement.length} appel(s) API en échec.</p>}
      </Section>
    </aside>
  );
}
