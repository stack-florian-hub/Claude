-- Veille foncière 85 / 44 / 49 / 37 : schéma SQLite (compatible PostgreSQL à quelques types près).
-- Une annonce = une ligne de `annonces`. Les enrichissements (DVF, urbanisme, risques) et le score
-- sont stockés à part pour pouvoir être recalculés sans recollecter.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS annonces (
    id              TEXT PRIMARY KEY,          -- "<source>:<id source>"
    source          TEXT NOT NULL,             -- notaires, bienici, leboncoin, ...
    source_id       TEXT NOT NULL,
    url             TEXT NOT NULL,
    titre           TEXT,
    description     TEXT,
    prix            REAL,                      -- prix affiché (€), frais inclus si connus
    surface_m2      REAL,                      -- surface terrain
    prix_m2         REAL GENERATED ALWAYS AS (CASE WHEN surface_m2 > 0 THEN prix / surface_m2 END) VIRTUAL,
    departement     TEXT NOT NULL,             -- 85, 44, 49, 37
    code_insee      TEXT,
    commune         TEXT,
    code_postal     TEXT,
    lat             REAL,
    lon             REAL,
    precision_geo   TEXT,                      -- parcelle | adresse | approx | commune
    ref_cadastrale  TEXT,                      -- IDU 14 car. si connu (ex. 85147000ZK0123)
    typologie       TEXT,                      -- loisir | bois | agricole | constructible | etang | autre
    mode_vente      TEXT,                      -- gre_a_gre | encheres | vente_interactive
    photo_url       TEXT,
    date_publication TEXT,
    premiere_vue    TEXT NOT NULL,             -- ISO 8601, première collecte
    derniere_vue    TEXT NOT NULL,             -- ISO 8601, dernière collecte où l'annonce était en ligne
    prix_initial    REAL,                      -- premier prix vu (suivi des baisses)
    statut          TEXT NOT NULL DEFAULT 'active', -- active | exclue | retiree
    motif_exclusion TEXT,                      -- prix_plancher, prix_reel_texte, viager, gff, indivision...
    brut_json       TEXT,                      -- annonce brute (debug / re-parsing)
    UNIQUE (source, source_id)
);
CREATE INDEX IF NOT EXISTS idx_annonces_dep ON annonces (departement, statut);
CREATE INDEX IF NOT EXISTS idx_annonces_insee ON annonces (code_insee);

-- Comparables DVF agrégés par commune / typologie (cache, recalculé au plus une fois par mois)
CREATE TABLE IF NOT EXISTS dvf_stats (
    code_insee   TEXT NOT NULL,
    typologie    TEXT NOT NULL,
    section      TEXT NOT NULL DEFAULT '',     -- '' = toute la commune
    n            INTEGER NOT NULL,
    p25_m2       REAL,
    mediane_m2   REAL,
    p75_m2       REAL,
    derniere     TEXT,                         -- date de la dernière mutation
    annees       TEXT,                         -- "2021-2025"
    calcule_le   TEXT NOT NULL,
    PRIMARY KEY (code_insee, typologie, section)
);

-- Ventes DVF retenues comme comparables (affichées dans la fiche)
CREATE TABLE IF NOT EXISTS dvf_ventes (
    id_mutation  TEXT NOT NULL,
    code_insee   TEXT NOT NULL,
    date         TEXT NOT NULL,
    valeur       REAL NOT NULL,
    surface_m2   REAL NOT NULL,
    prix_m2      REAL NOT NULL,
    typologie    TEXT NOT NULL,
    nature       TEXT,                         -- natures de culture DVF concaténées
    section      TEXT,
    id_parcelle  TEXT,
    lat          REAL,
    lon          REAL,
    PRIMARY KEY (id_mutation, code_insee)
);
CREATE INDEX IF NOT EXISTS idx_dvf_ventes ON dvf_ventes (code_insee, typologie);

-- Contexte urbanisme / risques au point de l'annonce
CREATE TABLE IF NOT EXISTS enrichissements (
    annonce_id         TEXT PRIMARY KEY REFERENCES annonces(id) ON DELETE CASCADE,
    parcelle_idu       TEXT,
    section            TEXT,
    contenance_m2      REAL,
    zone_plu           TEXT,                   -- libellé (NL, A, 1AUh, UB...)
    type_zone          TEXT,                   -- U | AUc | AUs | A | N | RNU | inconnu
    doc_urbanisme      TEXT,                   -- PLU / PLUi / CC / RNU
    dist_zone_u_m      REAL,                   -- distance à la zone U la plus proche
    dist_zone_au_m     REAL,                   -- distance à la zone AU la plus proche
    natura2000         INTEGER,                -- 0/1
    znieff             INTEGER,
    ppr_inondation     INTEGER,                -- commune couverte par un PPRi
    details_json       TEXT,                   -- JSON : risques commune, PPR, AZI, prescriptions, SUP, alertes, DVF
    dist_littoral_km   REAL,
    dist_agglo_km      REAL,
    agglo_proche       TEXT,
    dist_route_m       REAL,                   -- distance à la voie la plus proche si connue
    dvf_n              INTEGER,
    dvf_mediane_m2     REAL,
    dvf_niveau         TEXT,                   -- section | commune | departement
    erreurs            TEXT,                   -- JSON : appels API en échec
    enrichi_le         TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS scores (
    annonce_id     TEXT PRIMARY KEY REFERENCES annonces(id) ON DELETE CASCADE,
    score          REAL NOT NULL,              -- 0..100
    s_decote       REAL NOT NULL,              -- 0..30
    s_mutation     REAL NOT NULL,              -- 0..35
    s_acces        REAL NOT NULL,              -- 0..20
    s_rarete       REAL NOT NULL,              -- 0..15
    confiance      TEXT NOT NULL,              -- haute | moyenne | faible
    explications   TEXT NOT NULL,              -- JSON : liste de phrases
    calcule_le     TEXT NOT NULL
);

-- Historique des prix (baisse = signal de vendeur pressé)
CREATE TABLE IF NOT EXISTS prix_historique (
    annonce_id TEXT NOT NULL REFERENCES annonces(id) ON DELETE CASCADE,
    date       TEXT NOT NULL,
    prix       REAL NOT NULL,
    PRIMARY KEY (annonce_id, date)
);

-- Notes personnelles (saisies dans le dashboard)
CREATE TABLE IF NOT EXISTS notes (
    annonce_id TEXT PRIMARY KEY,
    texte      TEXT NOT NULL DEFAULT '',
    suivi      TEXT NOT NULL DEFAULT '',       -- '' | a_voir | contacte | visite | offre | abandon
    favori     INTEGER NOT NULL DEFAULT 0,
    maj_le     TEXT NOT NULL
);

-- Journal des collectes
CREATE TABLE IF NOT EXISTS collectes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    source     TEXT NOT NULL,
    debut      TEXT NOT NULL,
    fin        TEXT,
    vues       INTEGER DEFAULT 0,
    nouvelles  INTEGER DEFAULT 0,
    exclues    INTEGER DEFAULT 0,
    erreur     TEXT
);
