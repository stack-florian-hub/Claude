# Format d'une fiche bien (JSON), une par bien
{
 "titre": str, "type": str (chateau|manoir|gentilhommiere|maison_maitre|prieure|abbaye|grange|ferme|longere|haras|domaine_viticole|troglodyte|moulin|salle|ecole|colonie|hotel_restaurant|guinguette|golf|camping|entrepot|usine|gare|chapelle|serres|terrain|lieu_reception_activite|autre),
 "commune": str, "code_postal": str|null, "lat": float|null, "lon": float|null, "precision_gps": "adresse"|"commune"|null,
 "prix": int|null, "prix_inclut_honoraires": bool|null, "honoraires_pct": float|null,
 "surface_bati_m2": int|null, "surface_salle_m2": int|null, "terrain_m2": int|null,
 "chambres": int|null, "etat": "bon"|"rafraichir"|"a_renover"|"ruine"|null, "dpe": str|null, "taxe_fonciere": int|null,
 "description": str (résumé factuel, 2-4 phrases, d'après l'annonce),
 "cachet": [liste parmi: pierre, tuffeau, charpente, parc, vue, loire, patrimoine, mh, cave, chapelle, douves, pigeonnier, dependances, piece_eau],
 "capacite_annoncee": int|null, "activite_reception_existante": bool, "ca_annonce": int|null,
 "logement_exploitant": bool|null, "risques_notes": str|null,
 "mode_vente": "classique"|"encheres"|"cession_fonds"|"murs_fonds"|"public_aot"|"location"|"viager",
 "date_vente_encheres": str|null, "mise_a_prix": int|null,
 "contact": {"organisme": str|null, "nom": str|null, "telephone": str|null, "email": str|null, "url": str|null},
 "sources": [{"url": str, "site": str, "collecte_le": "2026-10-04", "ref": str|null}],
 "date_premiere_parution": str|null, "baisse_prix": str|null,
 "verifie": bool (true = page d'annonce ouverte et lue), "a_verifier": [liste des champs incertains]
}
