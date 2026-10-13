import type { Settings, Zone, GroupData } from './types';

const z = (id: string, name: string, dept: string, postalCodes: string[], communes: string[], tension: 1 | 2 | 3, priority: number, coastal = false): Zone =>
  ({ id, name, dept, postalCodes, communes, tension, priority, active: true, coastal });

// Zones cibles. Tension : 3 = très tendu, 2 = tendu, 1 = détendu. Modifiables dans Paramètres.
export const DEFAULT_ZONES: Zone[] = [
  z('nantes', 'Nantes', '44', ['44000', '44100', '44200', '44300'], ['44109'], 3, 1),
  z('nantes-peri', 'Nantes péri-urbain (Rezé, Saint-Herblain)', '44', ['44400', '44800'], ['44143', '44162'], 2, 2),
  z('st-nazaire', 'Saint-Nazaire', '44', ['44600'], ['44184'], 2, 1, true),
  z('presquile', 'Presqu’île (La Baule, Pornichet, Guérande, Pornic)', '44', ['44500', '44380', '44350', '44210'], ['44055', '44132', '44069', '44131'], 3, 2, true),
  z('sables', 'Les Sables-d’Olonne', '85', ['85100', '85180', '85340'], ['85194'], 3, 1, true),
  z('st-gilles', 'Saint-Gilles-Croix-de-Vie / Saint-Hilaire-de-Riez', '85', ['85800', '85270'], ['85222', '85226'], 3, 1, true),
  z('st-jean', 'Saint-Jean-de-Monts', '85', ['85160'], ['85234'], 2, 3, true),
  z('la-roche', 'La Roche-sur-Yon', '85', ['85000'], ['85191'], 2, 1),
  z('angers', 'Angers', '49', ['49000', '49100'], ['49007'], 2, 1),
  z('cholet', 'Cholet', '49', ['49300'], ['49099'], 1, 2),
  z('tours', 'Tours', '37', ['37000', '37100', '37200'], ['37261'], 2, 1),
  z('tours-peri', 'Tours péri-urbain (Joué, Saint-Cyr)', '37', ['37300', '37540'], ['37122', '37214'], 2, 2),
];

export const DEFAULT_GROUP: GroupData = {
  activities: [
    { id: 'conseil', name: 'Conseil en achats', company: 'financiere', revenue: 60000, margin: 70, capital: 0, marketGrowth: 3, relativeShare: 1.4, role: 'Cash-flow récurrent, sans immobilisation' },
    { id: 'ar', name: 'Revente de lots (A/R)', company: 'immobiliere', revenue: 30000, margin: 35, capital: 50000, marketGrowth: 8, relativeShare: 1.2, role: 'Marchand de biens, rotation rapide' },
    { id: 'lcd', name: 'Location courte durée', company: 'immobiliere', revenue: 40000, margin: 30, capital: 150000, marketGrowth: 2, relativeShare: 1.1, role: 'Cash-flow, immobilisation d’actif' },
    { id: 'conciergerie', name: 'Conciergerie', company: 'financiere', revenue: 7500, margin: 40, capital: 3000, marketGrowth: 10, relativeShare: 0.2, role: 'Projet à tester' },
    { id: 'coloc', name: 'Colocation', company: 'sci', revenue: 20000, margin: 25, capital: 200000, marketGrowth: 5, relativeShare: 0.8, role: 'Rendement locatif long terme' },
  ],
  porter: [
    { id: 'rivalite', label: 'Rivalité entre concurrents', score: 4, comment: 'Autres marchands de biens, investisseurs locaux et chasseurs d’anomalies équipés des mêmes outils (DVF, alertes). Les vraies anomalies partent en 24-72 h dans les villes tendues (Nantes, littoral vendéen). Avantage : les lots groupés et ventes judiciaires demandent plus de travail, donc moins de concurrents.' },
    { id: 'vendeurs', label: 'Pouvoir des vendeurs', score: 3, comment: 'Agences mieux informées qu’avant (estimateurs en ligne), mais erreurs fréquentes sur les lots groupés (prix global sans détailler garage/parking/cave). Ventes judiciaires et successions : vendeurs pressés, pouvoir faible. AJP / huissiers : prix de départ bas, mais enchères qui remontent.' },
    { id: 'acheteurs', label: 'Pouvoir des acquéreurs (revente)', score: 2, comment: 'Revente lot par lot à des particuliers et petits investisseurs : garages/parkings très liquides en zone tendue, appartements dépendants du crédit (taux, HCSF). Diversifier la taille des lots réduit leur pouvoir.' },
    { id: 'substituts', label: 'Menace des substituts', score: 3, comment: 'LCD : réservation directe, hôtellerie, plafonds communaux et loi Le Meur (fiscalité et quotas). Colocation : Lokaviz, La Carte des Colocs, résidences étudiantes et coliving. A/R : peu de substituts, le placement financier reste l’alternative du cash.' },
    { id: 'entrants', label: 'Menace des nouveaux entrants', score: 4, comment: 'Barrières faibles : 70 k€ de capital suffisent pour des petits lots, le statut marchand de biens se crée vite. Barrières réelles : accès au crédit professionnel, réseau d’agents/notaires/AJP, discipline de calcul. Le savoir-faire « lot groupé » est l’avantage défendable.' },
  ],
  swot: {
    strengths: ['Œil sur les anomalies de prix (preuve : coup New Port, ~180 k€ de sous-évaluation)', '70 k€ de trésorerie disponible, en hausse', 'Structure holding + filiales déjà en place', 'Revenu de conseil récurrent (60 k€) qui finance le temps de prospection', 'Expérience de la revente lot par lot (garage revendu ~30 k€)'],
    weaknesses: ['Objet social marchand de biens non formalisé (droits réduits et sécurité fiscale en jeu)', 'Trésorerie limitée : 1 à 2 coups en parallèle au mieux', 'Dépendance au fondateur (temps, réseau, décision)', 'Pas d’historique bancaire « marchand de biens » pour le crédit', 'Outils et données encore manuels'],
    opportunities: ['Lots groupés mal évalués par les agences (prix global sans détail)', 'Ventes judiciaires et successions dans le 44/85/49/37', 'Marché garage/parking tendu dans les villes et le littoral', 'Remontée des prix sur le littoral vendéen', 'Synergies : conciergerie au service de la LCD et des acquéreurs'],
    threats: ['Concurrence d’autres chasseurs équipés des mêmes données', 'Remontée des taux et durcissement du crédit des acquéreurs', 'Réglementation LCD (quotas, loi Le Meur) et DPE (interdiction de louer G puis F)', 'Requalification fiscale si l’activité MdB reste portée par la holding', 'Allongement des délais de revente (stock qui immobilise le cash)'],
  },
  scenarios: [
    { id: 'prudent', label: 'Prudent', dealsPerYear: 2, avgGainPerDeal: 15000, cashPerDeal: 40000, monthsPerDeal: 7, recurringFactor: 0.9, color: 'var(--c2)' },
    { id: 'central', label: 'Central', dealsPerYear: 4, avgGainPerDeal: 22000, cashPerDeal: 45000, monthsPerDeal: 5, recurringFactor: 1, color: 'var(--c1)' },
    { id: 'offensif', label: 'Offensif', dealsPerYear: 6, avgGainPerDeal: 30000, cashPerDeal: 55000, monthsPerDeal: 4, recurringFactor: 1.1, color: 'var(--c3)' },
  ],
  allocation: { reserve: 12000, bfrRecurrent: 8000, ar: 45000, lcd: 5000 },
};

export const DEFAULT_SETTINGS: Settings = {
  fees: {
    notaireDroitCommunPct: 7.5,
    notaireMdbPct: 2.5,
    useMdbRegime: false,
    agenceRevPct: 4,
    diagnosticsParLot: 350,
    divisionParLot: 1500,
    chargesMensuellesDefaut: 120,
    travauxLourdsM2: 1000,
    travauxLegersM2: 300,
    taxeFonciereAnnuelleParLot: 700,
  },
  thresholds: { minGain: 30000, minGainPct: 25 },
  budget: { cash: 70000, reserve: 10000, elargi: 250000 },
  financing: { enabled: true, apportPct: 20, rate: 4.8 },
  tax: { isReducedRate: 15, isReducedCap: 42500, isRate: 25, tvaSurMarge: false },
  defaults: {
    1: { garage: { low: 8000, mid: 12000, high: 16000 }, parking: { low: 5000, mid: 8000, high: 11000 }, cave: { low: 2000, mid: 3000, high: 4000 } },
    2: { garage: { low: 12000, mid: 17000, high: 22000 }, parking: { low: 8000, mid: 12000, high: 15000 }, cave: { low: 3000, mid: 4500, high: 6000 } },
    3: { garage: { low: 18000, mid: 24000, high: 30000 }, parking: { low: 12000, mid: 16000, high: 20000 }, cave: { low: 5000, mid: 6500, high: 8000 } },
  },
  resaleMonths: { appartement: 5, maison: 6, garage: 3, parking: 3, cave: 4, local: 8, terrain: 9, autre: 6 },
  dvf: { years: 3, minStreet: 3, minCommune: 5, useDemo: true },
  connectors: { castorus: { enabled: false }, meilleursAgents: { enabled: false }, geocode: true },
  treasury: {
    startCash: 70000,
    monthlySavings: 2500,
    reserveSecurite: 12000,
    events: [],
  },
  group: DEFAULT_GROUP,
};

export const LOT_LABELS: Record<string, string> = {
  appartement: 'Appartement', maison: 'Maison', garage: 'Garage / box', parking: 'Parking', cave: 'Cave', local: 'Local', terrain: 'Terrain', autre: 'Autre',
};
export const SOURCE_LABELS: Record<string, string> = {
  seloger: 'SeLoger', leboncoin: 'Leboncoin', logicimmo: 'Logic-Immo', bienici: 'Bien’ici', pap: 'PAP', reseau: 'Site du réseau', notaires: 'Notaires', manuel: 'Manuel', autre: 'Autre',
};
export const SELLER_LABELS: Record<string, string> = {
  particulier: 'Particulier', agence: 'Agence', justice: 'Justice / enchères', notaire: 'Notaire', inconnu: '—',
};
export const STAGE_LABELS: Record<string, string> = {
  repere: 'Repéré', visite: 'Visité', offre: 'Offre', signe: 'Signé', revente: 'Revente', clos: 'Clos', abandonne: 'Abandonné',
};
export const COMPANY_LABELS: Record<string, string> = {
  financiere: 'Financière TUÉ et Fils', immobiliere: 'Immobilière TUÉ et Fils', sci: 'SCI du Hameau de la Vie',
};
