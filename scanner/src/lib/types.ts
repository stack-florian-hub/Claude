// Modèle de données du scanner. Voir ARCHITECTURE.md §3.

export type LotType = 'appartement' | 'maison' | 'garage' | 'parking' | 'cave' | 'local' | 'terrain' | 'autre';
export type Source = 'seloger' | 'leboncoin' | 'logicimmo' | 'bienici' | 'pap' | 'reseau' | 'notaires' | 'manuel' | 'autre';
export type SellerType = 'particulier' | 'agence' | 'justice' | 'notaire' | 'inconnu';
export type Dpe = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';
export type ListingStatus = 'nouveau' | 'suivi' | 'ecarte' | 'pipeline';

export interface Address {
  number?: string;
  street?: string;
  postalCode: string;
  city: string;
  insee?: string;
  dept: string;
  lat?: number;
  lon?: number;
}

export interface SubLot {
  id: string;
  type: LotType;
  surface?: number; // m² (Carrez si connu)
  rooms?: number;
  label?: string; // "Lot 12 – box fermé"
  travaux?: number; // travaux propres à ce lot
  resaleOverride?: number; // valeur forcée (offre reçue, estimation pro)
  resaleMonths?: number; // délai de revente estimé
}

export interface PricePoint { date: string; price: number; source?: string }

export interface Listing {
  id: string;
  source: Source;
  network?: string; // réseau d'agences ou canal notarial (src/lib/networks.ts)
  agency?: string; // agence / office qui publie
  sourceRef?: string;
  url?: string;
  title: string;
  description: string;
  price: number;
  priceHistory: PricePoint[]; // historique des prix affichés (manuel ou Castorus)
  address: Address;
  surface?: number; // surface principale
  lots: SubLot[];
  dpe?: Dpe;
  chargesAnnual?: number;
  coproLots?: number;
  coproProcedure?: boolean; // copro en difficulté / procédure
  seller: SellerType;
  publishedAt?: string; // ISO date
  importedAt: string;
  status: ListingStatus;
  travaux?: number; // travaux globaux estimés
  needsDivision?: boolean; // lots à créer (modificatif EDD, géomètre)
  manualValuation?: { low: number; mid: number; high: number; source: string; date: string };
  notes?: string;
  checklist?: Record<string, boolean>;
  offMarketAt?: string; // annonce disparue du site source (vendue ou retirée)
  alsoOn?: { source: Source; url?: string; price: number; date: string }[]; // même bien vu sur d'autres sites
  demo?: boolean;
}

export type ListingInput = Omit<Listing, 'id' | 'importedAt' | 'status' | 'priceHistory'> & {
  priceHistory?: PricePoint[];
  status?: ListingStatus;
};

export type ValuationSource = 'force' | 'manuel' | 'dvf-rue' | 'dvf-proche' | 'dvf-quartier' | 'dvf-commune' | 'dvf-environs' | 'dvf-dept' | 'defaut' | 'castorus' | 'meilleursagents';

export interface Comparable {
  date: string;
  value: number;
  surface?: number;
  pricePerM2?: number;
  type: string;
  address: string;
  postalCode: string;
  distanceM?: number;
}

export interface LotValuation {
  lotId: string;
  type: LotType;
  low: number;
  mid: number;
  high: number;
  pricePerM2?: { low: number; mid: number; high: number };
  source: ValuationSource;
  n: number;
  confidence: number; // 0..1
  comparables: Comparable[];
  note?: string;
}

export interface Range { low: number; mid: number; high: number }

export interface CostBreakdown {
  acquisitionFees: number;
  travaux: number;
  resaleAgency: number;
  diagnostics: number;
  division: number;
  carrying: number; // portage : charges, taxe foncière, intérêts
  total: number;
}

export interface Analysis {
  listingId: string;
  lots: LotValuation[];
  total: Range; // Σ valeurs séparées
  costs: CostBreakdown; // calculés sur le scénario moyen
  gain: Range; // gain brut (bas / moyen / haut)
  gainPct: number; // gain moyen / prix
  ratio: number; // (Σ − frais − travaux − revente) / prix
  ecart: number; // Σ moyen − prix
  score: number; // 0..100
  confidence: number; // 0..1
  flagged: boolean;
  signals: string[];
  warnings: string[];
  cashNeeded: number; // apport + frais + travaux si financé, sinon prix + frais + travaux
  resaleMonths: number;
  priceCaps: { breakEven: number; forMinGain: number; forMinPct: number; max: number }; // offre / enchère maximale
  strategy: 'lots' | 'global'; // lots = revente par lots de copropriété ; global = maison / terrain (valeur d'ensemble, hors stratégie)
}

export type DealStage = 'repere' | 'visite' | 'offre' | 'signe' | 'revente' | 'clos' | 'abandonne';
export type Company = 'financiere' | 'immobiliere' | 'sci';

export interface DealLot {
  id: string;
  label: string;
  type: LotType;
  plannedResale: number;
  plannedMonth: number; // mois après signature
  actualResale?: number;
  soldAt?: string;
  status: 'a_vendre' | 'en_vente' | 'sous_compromis' | 'vendu' | 'conserve';
  saleCostsPct?: number; // frais de vente (agence) ; défaut = paramètre agence
}

export interface Deal {
  id: string;
  name: string;
  listingId?: string;
  company: Company;
  stage: DealStage;
  city: string;
  purchasePrice: number;
  acquisitionFees: number;
  travaux: number;
  loanAmount: number; // 0 = comptant
  loanRate: number; // % annuel
  loanRepayment: 'prorata' | 'in_fine'; // remboursement à chaque vente de lot ou à la dernière
  signedAt?: string;
  createdAt: string;
  lots: DealLot[];
  plannedGain?: number;
  notes?: string;
  demo?: boolean;
}

export interface Zone {
  id: string;
  name: string;
  dept: string;
  postalCodes: string[];
  communes: string[]; // codes INSEE ou noms
  tension: 1 | 2 | 3; // 3 = très tendu
  priority: number; // 1 = haute
  active: boolean;
  coastal?: boolean;
}

export interface DependanceDefaults { garage: Range; parking: Range; cave: Range }

export interface Settings {
  fees: {
    notaireDroitCommunPct: number; // 7,5
    notaireMdbPct: number; // ~2,5 (droits 0,715 % + émoluments)
    useMdbRegime: boolean;
    agenceRevPct: number; // 4
    diagnosticsParLot: number;
    divisionParLot: number; // modificatif EDD, géomètre
    chargesMensuellesDefaut: number;
    taxeFonciereAnnuelleParLot: number;
  };
  thresholds: { minGain: number; minGainPct: number };
  budget: { cash: number; reserve: number; elargi: number };
  financing: { enabled: boolean; apportPct: number; rate: number };
  tax: { isReducedRate: number; isReducedCap: number; isRate: number; tvaSurMarge: boolean };
  defaults: Record<1 | 2 | 3, DependanceDefaults>;
  resaleMonths: Record<LotType, number>;
  dvf: { years: number; minStreet: number; minCommune: number; useDemo: boolean };
  connectors: { castorus: { enabled: boolean; apiKey?: string }; meilleursAgents: { enabled: boolean; apiKey?: string }; geocode: boolean };
  treasury: {
    startCash: number;
    monthlySavings: number;
    reserveSecurite: number;
    events: { id: string; label: string; month: number; amount: number }[];
  };
  group: GroupData;
}

export interface Activity {
  id: string;
  name: string;
  company: Company;
  revenue: number; // CA annuel
  margin: number; // marge nette estimée en %
  capital: number; // capital immobilisé
  marketGrowth: number; // % croissance du marché
  relativeShare: number; // part de marché relative visée (0.1..2)
  role: string;
}

export interface PorterForce { id: string; label: string; score: number; comment: string }
export interface Swot { strengths: string[]; weaknesses: string[]; opportunities: string[]; threats: string[] }
export interface Scenario { id: string; label: string; dealsPerYear: number; avgGainPerDeal: number; cashPerDeal: number; monthsPerDeal: number; recurringFactor: number; color: string }

export interface GroupData {
  activities: Activity[];
  porter: PorterForce[];
  swot: Swot;
  scenarios: Scenario[];
  allocation: { reserve: number; bfrRecurrent: number; ar: number; lcd: number };
}

export interface DvfMutation {
  d: string; // date AAAA-MM-JJ
  v: number; // valeur foncière
  t: 'A' | 'M' | 'D' | 'L'; // Appartement, Maison, Dépendance seule, Local
  s?: number; // surface réelle bâti
  p?: number; // pièces
  nd: number; // nb de dépendances dans la mutation
  cp: string;
  c: string; // code INSEE
  n?: string; // numéro
  r: string; // voie
  x?: number; // lon
  y?: number; // lat
}

export interface DvfIndex { dept: string; years: number[]; builtAt: string; source: string; mutations: DvfMutation[]; communes?: Record<string, string> }
