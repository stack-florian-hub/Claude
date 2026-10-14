// Utilitaires partagés : formatage, couleurs de score, liens externes, persistance des notes.

export const DEPS = { 85: "Vendée", 44: "Loire-Atlantique", 49: "Maine-et-Loire", 37: "Indre-et-Loire" };
export const TYPOS = { loisir: "Loisir", bois: "Bois", agricole: "Agricole", etang: "Étang", constructible: "Constructible", autre: "Autre" };
export const SUIVIS = { "": "—", a_voir: "À voir", contacte: "Contacté", visite: "Visité", offre: "Offre faite", abandon: "Abandonné" };
export const SOURCES = {
  notaires: "Notaires", bienici: "Bien'Ici", leboncoin: "LeBonCoin", seloger: "SeLoger", logicimmo: "Logic-Immo",
  figaro: "Figaro Immo", paruvendu: "ParuVendu", greenacres: "Green-Acres", proprietes_rurales: "Propriétés rurales",
  agorastore: "Agorastore", import: "Import manuel",
};
export const PRECISIONS = { parcelle: "Parcelle", adresse: "Adresse", approx: "Approximative", commune: "Commune seulement" };
export const MOTIFS = {
  prix_plancher: "Prix < plancher (prix d'appel)", prix_plafond: "Prix > plafond", prix_absent: "Prix absent",
  prix_reel_texte: "Vrai prix dans le texte", viager: "Viager", gff_parts: "Parts de groupement (GFF/GFA)",
  indivision: "Parts indivises", demembrement: "Nue-propriété / usufruit", location: "Location",
  recherche: "Annonce de recherche", pas_un_terrain: "Pas un terrain", surface_hors_bornes: "Surface hors bornes",
  prix_m2_trop_eleve: "Prix/m² trop élevé", hors_zone: "Hors départements",
};

// Rampe séquentielle (bleu) en 4 paliers ordinaux : clair = score faible, foncé = score élevé.
export const PALIERS = [
  { min: 65, couleur: "#0d366b", label: "≥ 65" },
  { min: 50, couleur: "#1c5cab", label: "50–65" },
  { min: 35, couleur: "#3987e5", label: "35–50" },
  { min: -1, couleur: "#86b6ef", label: "< 35" },
];
export const couleurScore = (s) => (PALIERS.find((p) => (s ?? 0) >= p.min) || PALIERS[3]).couleur;

const nf0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
export const euros = (v) => (v == null ? "—" : `${nf0.format(v)} €`);
export const eurosM2 = (v) => (v == null ? "—" : `${nf2.format(v)} €/m²`);
export const m2 = (v) => (v == null ? "—" : v >= 10000 ? `${nf2.format(v / 10000)} ha` : `${nf0.format(v)} m²`);
export const metres = (v) => (v == null ? "—" : v >= 9999 ? "> 400 m" : v >= 1000 ? `${nf2.format(v / 1000)} km` : `${nf0.format(v)} m`);
export const dateFr = (s) => (s ? new Date(s).toLocaleDateString("fr-FR") : "—");

export function liensExternes(a) {
  const l = [];
  if (a.lat != null) {
    l.push(["Géoportail (cadastre)", `https://www.geoportail.gouv.fr/carte?c=${a.lon},${a.lat}&z=17&l0=ORTHOIMAGERY.ORTHOPHOTOS::GEOPORTAIL:OGC:WMTS(1)&l1=CADASTRALPARCELS.PARCELLAIRE_EXPRESS::GEOPORTAIL:OGC:WMTS(1)&permalink=yes`]);
    l.push(["Géoportail de l'urbanisme (PLU)", `https://www.geoportail-urbanisme.gouv.fr/map/#tile=1&lon=${a.lon}&lat=${a.lat}&zoom=17`]);
  }
  if (a.code_insee) {
    l.push(["Géorisques (commune)", `https://www.georisques.gouv.fr/mes-risques/connaitre-les-risques-pres-de-chez-moi/rapport2?form-commune=true&codeInsee=${a.code_insee}`]);
    l.push(["DVF (carte des ventes)", `https://app.dvf.etalab.gouv.fr/?commune=${a.code_insee}`]);
  }
  return l;
}

// Notes : API locale (python -m vf serve) si disponible, sinon stockage du navigateur.
const CLE = "vf-notes";
function lireLocal() {
  try { return JSON.parse(localStorage.getItem(CLE) || "{}"); } catch { return {}; }
}
export async function chargerNotes() {
  try {
    const r = await fetch("/api/notes");
    if (r.ok && (r.headers.get("content-type") || "").includes("json")) return { notes: await r.json(), mode: "api" };
  } catch { /* hors ligne */ }
  return { notes: lireLocal(), mode: "local" };
}
export async function enregistrerNote(id, note, mode) {
  if (mode === "api") {
    try {
      const r = await fetch(`/api/notes/${encodeURIComponent(id)}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(note),
      });
      if (r.ok) return "api";
    } catch { /* bascule en local */ }
  }
  try {
    const all = lireLocal();
    all[id] = { ...note, maj_le: new Date().toISOString() };
    localStorage.setItem(CLE, JSON.stringify(all));
  } catch { /* stockage indisponible */ }
  return "local";
}

export async function chargerDonnees() {
  for (const url of ["/api/opportunites", "./data/opportunites.json"]) {
    try {
      const r = await fetch(url);
      if (r.ok && (r.headers.get("content-type") || "").includes("json")) return await r.json();
    } catch { /* suivant */ }
  }
  throw new Error("Aucune donnée : lancez `python -m vf tout` dans backend/ pour générer frontend/public/data/opportunites.json");
}
