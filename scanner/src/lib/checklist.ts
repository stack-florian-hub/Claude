// Checklist achat-revente générée pour une annonce (chiffres issus de l'analyse et des paramètres).
import type { Analysis, Listing, Settings } from './types';
import { LOT_LABELS } from './defaults';
import { eur, keur } from './util';

export interface CheckItem { id: string; group: string; label: string; detail?: string; critical?: boolean }

export function buildChecklist(l: Listing, a: Analysis, s: Settings): CheckItem[] {
  const dc = Math.round((l.price * s.fees.notaireDroitCommunPct) / 100);
  const mdb = Math.round((l.price * s.fees.notaireMdbPct) / 100);
  const deps = l.lots.filter((x) => ['garage', 'parking', 'cave'].includes(x.type));
  const items: CheckItem[] = [
    { id: 'objet', group: 'Structure', critical: true, label: 'Objet social marchand de biens de l’Immobilière TUÉ et Fils formalisé (AGE, statuts, Kbis) avant l’acte', detail: 'Sans cela, droits réduits refusés et risque de requalification (activité réputée exercée par la holding).' },
    { id: 'societe', group: 'Structure', label: 'Société acquéreuse décidée (Immobilière pour l’A/R ; SCI pour un lot conservé en locatif)' },
    { id: 'notaire', group: 'Frais', label: `Frais d’acquisition : droit commun ${s.fees.notaireDroitCommunPct} % = ${eur(dc)} ; régime MdB (engagement de revendre sous 5 ans, droits 0,715 %) ≈ ${s.fees.notaireMdbPct} % = ${eur(mdb)}`, detail: `Retenu dans le calcul : ${eur(a.costs.acquisitionFees)}. Économie potentielle : ${eur(dc - mdb)}.` },
    { id: 'agence', group: 'Frais', label: `Commission d’agence à la revente ~${s.fees.agenceRevPct} % par lot = ${eur(a.costs.resaleAgency)}`, detail: 'Garages/parkings/caves : vente directe possible (voisins de la copropriété, annonces locales) → 0 %.' },
    { id: 'travaux', group: 'Frais', label: `Travaux : ${eur(a.costs.travaux)} — devis signés, planning, attestation décennale si gros œuvre` },
    { id: 'diag', group: 'Frais', label: `Diagnostics par lot (${l.lots.length} × ${eur(s.fees.diagnosticsParLot)}) : Carrez, amiante, plomb, DPE du logement` },
    { id: 'delais', group: 'Revente', label: `Délais de revente estimés : ${l.lots.map((x) => `${x.label || LOT_LABELS[x.type]} ${x.resaleMonths ?? s.resaleMonths[x.type]} mois`).join(' · ')}` },
    { id: 'ordre', group: 'Revente', label: 'Ordre de sortie : vendre d’abord les petits lots liquides (garage, parking) pour récupérer du cash et réduire l’emprunt' },
  ];
  if (deps.length || l.lots.length > 1)
    items.push(
      { id: 'rcp', group: 'Copropriété', critical: true, label: 'Chaque lot (appartement, garage, parking, cave) est un lot distinct au règlement de copropriété / EDD, avec ses tantièmes', detail: `Sinon : modificatif de l’état descriptif de division (géomètre + vote d’AG), ~${eur(s.fees.divisionParLot)} par lot et 2 à 4 mois.` },
      { id: 'priorite', group: 'Copropriété', label: 'Vérifier les clauses du RCP sur les dépendances (vente réservée aux copropriétaires, droit de priorité, usage)' },
    );
  items.push(
    { id: 'ag', group: 'Copropriété', label: 'PV des 3 dernières AG, travaux votés, procédures, carnet d’entretien, pré-état daté (impayés)' },
    { id: 'charges', group: 'Copropriété', label: `Charges (${l.chargesAnnual ? eur(l.chargesAnnual) + '/an' : 'non renseignées'}) et taxe foncière ventilées par lot, pour la revente séparée` },
    { id: 'is', group: 'Fiscalité', label: `IS : ${s.tax.isReducedRate} % jusqu’à ${keur(s.tax.isReducedCap)} de bénéfice, puis ${s.tax.isRate} %`, detail: 'Le gain est un bénéfice professionnel (pas de régime des plus-values des particuliers).' },
    { id: 'tva', group: 'Fiscalité', label: 'TVA : revente d’un immeuble achevé depuis plus de 5 ans exonérée sauf option ; si option ou immeuble récent, TVA sur la marge (achat sans TVA)', detail: 'À valider avec l’expert-comptable avant l’offre.' },
    { id: 'financement', group: 'Financement', label: `Cash nécessaire ${eur(a.cashNeeded)} ; accord de principe bancaire, remboursement partiel à chaque vente de lot` },
    { id: 'cs', group: 'Offre', label: 'Conditions suspensives : financement, obtention du RCP/EDD et des PV d’AG, absence de servitude, purge du droit de préemption' },
    { id: 'pno', group: 'Offre', label: 'Assurance propriétaire non occupant dès la signature' },
  );
  if (l.seller === 'justice')
    items.push(
      { id: 'caution', group: 'Vente judiciaire', critical: true, label: 'Caution : 10 % de la mise à prix (min. 3 000 €) par chèque de banque ou caution bancaire, remise à l’avocat' },
      { id: 'surenchere', group: 'Vente judiciaire', label: 'Pas de condition suspensive ; surenchère possible 10 jours ; prix sous 2 mois ; frais préalables en sus' },
      { id: 'occupation', group: 'Vente judiciaire', label: 'Occupation (PV descriptif), trêve hivernale, délai d’expulsion éventuel intégré au délai de revente' },
    );
  if (l.dpe === 'F' || l.dpe === 'G') items.push({ id: 'dpe', group: 'Revente', critical: true, label: `DPE ${l.dpe} : chiffrer la rénovation énergétique (l’acquéreur investisseur ne pourra pas louer en l’état)` });
  if (l.needsDivision) items.push({ id: 'division', group: 'Copropriété', critical: true, label: 'Division à créer : géomètre, règlement de copropriété, EDD, éventuelle déclaration préalable (compter 3-4 mois)' });
  return items;
}
