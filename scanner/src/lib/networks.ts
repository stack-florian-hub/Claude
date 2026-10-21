// Réseaux d'agences à pignon sur rue et canaux notariaux suivis par le scanner.
// « connector » = collecte automatique chaque lundi, sinon capture manuelle (collage, favori, fiche PDF).
// Accès vérifiés le 13/10/2026 (robots.txt) : AJP sans restriction ; les autres réseaux autorisent les pages d'annonces
// mais pas toujours leurs moteurs de recherche — d'où la capture manuelle par défaut.

export interface Network {
  id: string;
  name: string;
  kind: 'agence' | 'notaires' | 'pro'; // pro = immobilier d'entreprise (entrepôts, locaux d'activité)
  domains: string[];
  site: string; // page d'annonces de vente
  connector?: boolean;
  note?: string;
}

export const NETWORKS: Network[] = [
  { id: 'ajp', name: 'AJP Immobilier', kind: 'agence', domains: ['ajp-immobilier.com'], site: 'https://www.ajp-immobilier.com/plan-du-site/acheter-avec-ajp', connector: true, note: 'Prix souvent compétitifs ; très présent en 44 / 85 / 49 (41 agences dans vos départements).' },
  { id: 'century21', connector: true, name: 'Century 21', kind: 'agence', domains: ['century21.fr'], site: 'https://www.century21.fr/' },
  { id: 'orpi', name: 'Orpi', kind: 'agence', domains: ['orpi.com'], site: 'https://www.orpi.com/' },
  { id: 'laforet', connector: true, name: 'Laforêt', kind: 'agence', domains: ['laforet.com'], site: 'https://www.laforet.com/' },
  { id: 'guyhoquet', name: 'Guy Hoquet', kind: 'agence', domains: ['guy-hoquet.com'], site: 'https://www.guy-hoquet.com/' },
  { id: 'era', name: 'ERA Immobilier', kind: 'agence', domains: ['eraimmobilier.com', 'erafrance.com'], site: 'https://www.eraimmobilier.com/' },
  { id: 'stephaneplaza', name: 'Stéphane Plaza Immobilier', kind: 'agence', domains: ['stephaneplazaimmobilier.com'], site: 'https://www.stephaneplazaimmobilier.com/' },
  { id: 'squarehabitat', name: 'Square Habitat (Crédit Agricole)', kind: 'agence', domains: ['squarehabitat.fr'], site: 'https://www.squarehabitat.fr/' },
  { id: 'nestenn', name: 'Nestenn', kind: 'agence', domains: ['nestenn.com'], site: 'https://nestenn.com/' },
  { id: 'citya', name: 'Citya Immobilier', kind: 'agence', domains: ['citya.com'], site: 'https://www.citya.com/' },
  { id: 'foncia', name: 'Foncia (transaction)', kind: 'agence', domains: ['foncia.com'], site: 'https://fr.foncia.com/' },
  { id: 'arthurimmo', name: 'Arthurimmo.com', kind: 'agence', domains: ['arthurimmo.com'], site: 'https://www.arthurimmo.com/' },
  { id: 'ladresse', name: 'L’Adresse', kind: 'agence', domains: ['ladresse.com'], site: 'https://www.ladresse.com/' },
  { id: 'cimm', name: 'CIMM Immobilier', kind: 'agence', domains: ['cimm.com', 'cimm-immobilier.fr'], site: 'https://cimm.com/' },
  { id: 'laresidence', name: 'La Résidence', kind: 'agence', domains: ['laresidence.fr'], site: 'https://www.laresidence.fr/' },
  { id: 'bureauxlocaux', connector: true, name: 'BureauxLocaux (immobilier d’entreprise)', kind: 'pro', domains: ['bureauxlocaux.com'], site: 'https://www.bureauxlocaux.com/', note: 'Entrepôts et locaux d’activité à vendre, adresse précise ; listes départementales autorisées par robots.txt (vérifié le 21/10/2026).' },
  { id: 'arthurloyd', connector: true, name: 'Arthur Loyd', kind: 'pro', domains: ['arthur-loyd.com'], site: 'https://www.arthur-loyd.com/locaux-activite-entrepots-vente', note: 'Réseau spécialisé locaux d’activité ; offres lues depuis le plan de site (prix souvent donné au m² hors droits).' },
  { id: 'geolocaux', name: 'Geolocaux', kind: 'pro', domains: ['geolocaux.com'], site: 'https://www.geolocaux.com/vente/entrepot/', note: 'Pages chargées en JavaScript : capture manuelle (collage).' },
  { id: 'immonot', connector: true, name: 'Immonot (notaires)', kind: 'notaires', domains: ['immonot.com'], site: 'https://www.immonot.com/', note: 'Annonces des offices notariaux, successions fréquentes.' },
  { id: 'notairesfr', name: 'Immobilier.notaires.fr', kind: 'notaires', domains: ['immobilier.notaires.fr', 'notaires.fr'], site: 'https://www.immobilier.notaires.fr/' },
  { id: '36h', name: '36h immo (vente notariale interactive)', kind: 'notaires', domains: ['36heures.immo', '36h-immo.com'], site: 'https://www.36heures.immo/', note: 'Prix de départ attractif, enchères en ligne sur 36 h.' },
];

export const NETWORK_BY_ID: Record<string, Network> = Object.fromEntries(NETWORKS.map((n) => [n.id, n]));

/** Réseau d'une annonce d'après son URL, puis d'après son texte (nom du réseau). */
export function detectNetwork(url?: string, text = ''): Network | undefined {
  const u = (url || '').toLowerCase();
  const byUrl = NETWORKS.find((n) => n.domains.some((d) => u.includes(d)));
  if (byUrl) return byUrl;
  const t = text.slice(0, 2000).toLowerCase();
  const KEYS: [string, RegExp][] = [
    ['ajp', /\bajp immobilier\b|\bajp\b/], ['century21', /century ?21/], ['orpi', /\borpi\b/], ['laforet', /\blafor[eê]t\b/], ['guyhoquet', /guy hoquet/],
    ['era', /\bera immobilier\b/], ['stephaneplaza', /st[ée]phane plaza/], ['squarehabitat', /square habitat/], ['nestenn', /\bnestenn\b/], ['citya', /\bcitya\b/],
    ['foncia', /\bfoncia\b/], ['arthurimmo', /arthurimmo/], ['ladresse', /l['’]adresse immobili|agence l['’]adresse/], ['cimm', /\bcimm\b/], ['laresidence', /\bla r[ée]sidence immobili/],
    ['bureauxlocaux', /bureauxlocaux/], ['arthurloyd', /arthur ?loyd/], ['geolocaux', /geolocaux/],
    ['immonot', /immonot/], ['notairesfr', /immobilier\.notaires\.fr|notaires de france/], ['36h', /36 ?h(?:eures)?[- ]immo/],
  ];
  const k = KEYS.find(([, re]) => re.test(t));
  return k ? NETWORK_BY_ID[k[0]] : undefined;
}
