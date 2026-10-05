/* Radar Domaine : moteur de scoring et de financement.
 * Fonctions pures, sans effet de bord. Utilisé par la page (window.RadarEngine)
 * et par les tests / la tâche hebdomadaire (require('./engine.js')).
 * Toutes les valeurs par défaut sont des hypothèses modifiables dans l'interface.
 */
(function (root) {
  'use strict';

  // ---------- Paramètres par défaut ----------
  // conf : "fiable" (source publique récente), "estimé" (fourchette de marché), "hypothèse" (choix par défaut)
  var DEFAULTS = {
    apport: 75000,                 // curseur 50 000 à 100 000
    pretHonneur: 0,                // quasi-fonds propres (Initiative / Réseau Entreprendre), 0 par défaut
    investisseursMax: 150000,      // fonds propres mobilisables via minoritaires (stratégie E)
    apportMinPct: 0.20,            // apport exigé par les banques sur un projet pro
    taux: 0.040,                   // prêt pro 20 ans ~3,5 % (BdF, 2026) + prime de risque activité événementielle
    assurancePct: 0.0030,          // assurance emprunteur annuelle sur capital initial
    duree: 20,
    negociation: 0.08,
    notaireAncien: 0.08,           // DMTO 37 relevés à 5 % en 2025 + émoluments
    fraisEncheres: 0.12,
    fraisCession: 0.05,            // droits d'enregistrement fonds + honoraires conseil
    honorairesAgenceSiNonInclus: 0.05,
    aleas: 0.15,
    moe: 0.12,
    tresorerieDemarrage: 30000,
    dscrCible: 1.30,
    // exploitation
    mariages: { prudent: 12, base: 20, ambitieux: 30 },
    prixHaute: 6000,               // location week-end mai à septembre ; benchmark : médiane « dès » 3 950 €, châteaux 37 en moyenne 5 808 €, haut 13 500 €
    prixBasse: 3000,               // location week-end hors saison (hypothèse)
    partHaute: 0.75,
    extrasParMariage: 1500,        // marge nette extras (hébergement, brunch, mobilier, coordination)
    autresEvenements: 8000,        // séminaires, tournages, privatisations hors mariage (marge annuelle)
    chargesVariablesParMariage: 700, // ménage, énergie de l'événement, régisseur, consommables
    commissionPct: 0.05,           // plateformes, cartes, commerciaux
    chargesFixes: 18000,           // entretien parc, comptabilité, marketing, abonnements
    assurancesPct: 0.004,          // RC pro + multirisque, en % de la valeur bâtie
    energieFixe: 6000,
    taxeFonciereDefaut: 3500,
    revalorisation: 0.01,          // valeur du bien par an
    partTravauxValorisee: 0.6,
    // délais
    moisAutorisations: 8,
    moisTravauxParTranche: 2,      // par tranche de 100 k€ de travaux (3 à 12 mois)
    // filtres
    trajetMax: 45,
    voirAussi55: false,
    // pondérations du score (total 100)
    poids: { cachet: 20, capacite: 15, reglementaire: 15, financabilite: 15, rentabilite: 10, localisation: 10, hebergement: 5, negociabilite: 5, upside: 5 },
    malusMax: 15,
    // postes de travaux (€ HT) : bas / moyen / haut
    travaux: {
      rafraichissement_m2:  { bas: 200,  moyen: 350,  haut: 500,  conf: 'estimé' },
      rehabilitation_m2:    { bas: 600,  moyen: 1000, haut: 1600, conf: 'estimé' }, // clos-couvert hors toiture, second œuvre simple
      toiture_m2:           { bas: 80,   moyen: 150,  haut: 260,  conf: 'estimé' },
      erp:                  { bas: 25000, moyen: 50000, haut: 120000, conf: 'hypothèse' },
      accessibilite:        { bas: 5000, moyen: 20000, haut: 40000, conf: 'estimé' },
      assainissement:       { bas: 40000, moyen: 80000, haut: 150000, conf: 'hypothèse' },
      cuisine:              { bas: 20000, moyen: 45000, haut: 90000, conf: 'estimé' },
      sanitaires:           { bas: 15000, moyen: 40000, haut: 80000, conf: 'hypothèse' },
      chauffage:            { bas: 15000, moyen: 40000, haut: 90000, conf: 'hypothèse' },
      parking_place:        { bas: 300,  moyen: 600,  haut: 1500, conf: 'estimé' },
      acoustique:           { bas: 5000, moyen: 20000, haut: 60000, conf: 'estimé' },
      sono:                 { bas: 8000, moyen: 20000, haut: 50000, conf: 'hypothèse' },
      mobilier:             { bas: 20000, moyen: 40000, haut: 80000, conf: 'hypothèse' },
      structure_m2:         { bas: 900,  moyen: 1400, haut: 2000, conf: 'hypothèse' } // salle neuve / extension
    }
  };

  var CACHET_POIDS = { patrimoine: 3, mh: 3, loire: 2.5, vue: 2, parc: 2, charpente: 2, tuffeau: 1.5, pierre: 1.5, cave: 1.5, chapelle: 1, douves: 1.5, pigeonnier: 1, dependances: 1, piece_eau: 1 };
  var TYPES_NOBLES = { chateau: 3, manoir: 2.5, gentilhommiere: 2, prieure: 2.5, abbaye: 3, moulin: 2, troglodyte: 2, domaine_viticole: 1.5, maison_maitre: 1.5, grange: 1, ferme: 1, chapelle: 1.5 };
  var TYPES_MODESTES = { grange: 1, longere: 1, ferme: 1, salle: 1, entrepot: 1, usine: 1, ecole: 1, hangar: 1, gare: 1, colonie: 1, autre: 0.5 };
  var TYPES_ERP = { salle: 1, hotel_restaurant: 1, lieu_reception_activite: 1, colonie: 0.7, ecole: 0.6, golf: 0.8, camping: 0.6, guinguette: 0.8 };

  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function num(x) { return typeof x === 'number' && isFinite(x) ? x : null; }
  function merge(base, over) {
    if (!over || typeof over !== 'object') return JSON.parse(JSON.stringify(base));
    var out = Array.isArray(base) ? base.slice() : {};
    Object.keys(base).forEach(function (k) {
      var b = base[k], o = over[k];
      if (b && typeof b === 'object' && !Array.isArray(b)) out[k] = merge(b, o);
      else out[k] = (o === undefined || o === null || (typeof b === 'number' && typeof o !== 'number')) ? b : o;
    });
    Object.keys(over).forEach(function (k) { if (!(k in out)) out[k] = over[k]; });
    return out;
  }

  // Mensualité d'un prêt amortissable
  function mensualite(capital, tauxAnnuel, annees) {
    if (!(capital > 0)) return 0;
    var n = annees * 12, r = tauxAnnuel / 12;
    if (r === 0) return capital / n;
    return capital * r / (1 - Math.pow(1 + r, -n));
  }
  function capitalRestant(capital, tauxAnnuel, annees, moisEcoules) {
    if (!(capital > 0)) return 0;
    var r = tauxAnnuel / 12, m = mensualite(capital, tauxAnnuel, annees);
    if (r === 0) return Math.max(0, capital - m * moisEcoules);
    return Math.max(0, capital * Math.pow(1 + r, moisEcoules) - m * (Math.pow(1 + r, moisEcoules) - 1) / r);
  }
  // Capital empruntable pour une annuité donnée
  function capitalPourAnnuite(annuite, tauxAnnuel, annees, assurancePct) {
    var lo = 0, hi = 2e7;
    for (var i = 0; i < 60; i++) {
      var mid = (lo + hi) / 2;
      var a = mensualite(mid, tauxAnnuel, annees) * 12 + mid * assurancePct;
      if (a > annuite) hi = mid; else lo = mid;
    }
    return lo;
  }

  // ---------- Négociation ----------
  function margeNegociation(b, p) {
    var m = p.negociation;
    var conf = 'hypothèse';
    var j = joursEnLigne(b);
    if (j !== null) { if (j > 365) m += 0.04; else if (j > 180) m += 0.02; conf = 'estimé'; }
    if (b.baisse_prix || (b.historique_prix && b.historique_prix.length > 1)) m += 0.02;
    if (b.mode_vente === 'encheres') m = 0; // la mise à prix n'est pas le prix final
    if (b.mode_vente === 'public_aot' || b.mode_vente === 'location') m = 0;
    return { taux: clamp(m, 0, 0.2), conf: conf };
  }
  function joursEnLigne(b) {
    var d = b.date_premiere_parution || b.premiere_apparition;
    if (!d) return null;
    var t = Date.parse(d); if (isNaN(t)) return null;
    var now = b._now ? Date.parse(b._now) : Date.now();
    return Math.max(0, Math.round((now - t) / 864e5));
  }

  // ---------- Travaux ----------
  function estimerTravaux(b, p) {
    var T = p.travaux, lignes = [];
    var bati = num(b.surface_bati_m2), salle = num(b.surface_salle_m2);
    var activite = !!b.activite_reception_existante;
    var etat = b.etat || null;
    var surfaceProjet; // surface à traiter pour la réception (salle + office + sanitaires)
    var hyp = [];
    function add(nom, base, mult, conf, note) {
      lignes.push({ poste: nom, bas: Math.round(base.bas * mult), moyen: Math.round(base.moyen * mult), haut: Math.round(base.haut * mult), conf: conf || base.conf, note: note || '' });
    }
    if (activite) {
      // lieu déjà exploité : mise à niveau et remise en état
      add('Remise en état et décoration', { bas: 15000, moyen: 40000, haut: 90000 }, 1, 'hypothèse', 'Lieu déjà exploité, à confirmer à la visite');
      add('Mise à jour sécurité ERP', T.erp, 0.3, 'hypothèse', 'Avis de la commission de sécurité à demander');
      add('Mobilier et matériel complémentaire', T.mobilier, 0.4, 'hypothèse');
    } else {
      if (salle && salle >= 200) surfaceProjet = Math.min(salle + 100, 450);
      else if (bati && bati >= 250) surfaceProjet = clamp(bati * 0.6, 300, 450);
      else surfaceProjet = null;
      if (surfaceProjet) {
        var R = T.rafraichissement_m2;
        var base = (etat === 'bon') ? { bas: R.bas * 0.3, moyen: R.moyen * 0.3, haut: R.haut * 0.3, conf: R.conf } : (etat === 'rafraichir') ? R : T.rehabilitation_m2;
        if (!etat) hyp.push('état inconnu, réhabilitation lourde supposée');
        add(etat === 'bon' ? 'Rafraîchissement salle et annexes' : 'Réhabilitation salle et annexes', base, surfaceProjet, etat ? base.conf : 'hypothèse', Math.round(surfaceProjet) + ' m² traités');
      } else {
        // pas de salle assez grande : construction / extension ou tente de réception
        var ext = 300 - (bati || 0) * 0.5;
        ext = clamp(ext, 150, 300);
        add('Salle à créer (extension ou structure)', T.structure_m2, ext, 'hypothèse', Math.round(ext) + ' m² à créer ; une tente de réception (location 8 à 15 k€ par saison) peut remplacer cette ligne');
        hyp.push('surface de salle insuffisante ou inconnue');
      }
      if (etat === 'a_renover' || etat === 'ruine' || (b.risques && b.risques.structure)) {
        var toit = Math.min(bati || 400, 500);
        add('Toiture et charpente', T.toiture_m2, toit, 'hypothèse', 'Diagnostic charpente indispensable');
      }
      add('Mise aux normes ERP (sécurité incendie, désenfumage, issues)', T.erp, TYPES_ERP[b.type] ? 0.5 : 1);
      add('Accessibilité PMR', T.accessibilite, TYPES_ERP[b.type] ? 0.5 : 1);
      add('Assainissement 200 personnes', T.assainissement, TYPES_ERP[b.type] ? 0.3 : 1, null, 'Raccordement ou filière autonome à dimensionner');
      add('Office traiteur (réchauffe, plonge, chambre froide)', T.cuisine, 1);
      add('Sanitaires réception', T.sanitaires, TYPES_ERP[b.type] ? 0.5 : 1);
      add('Chauffage et ventilation salle', T.chauffage, TYPES_ERP[b.type] ? 0.5 : 1);
      add('Acoustique et limiteur de bruit', T.acoustique, 1);
      add('Sono et éclairage', T.sono, 1);
      add('Mobilier et décoration (200 couverts)', T.mobilier, 1);
    }
    var places = 80;
    if (!activite) add('Parking (' + places + ' places) et voiries', T.parking_place, places, null, 'Hors aménagement routier imposé par la commune');
    var tot = { bas: 0, moyen: 0, haut: 0 };
    lignes.forEach(function (l) { tot.bas += l.bas; tot.moyen += l.moyen; tot.haut += l.haut; });
    var aleasPct = p.aleas, moePct = activite ? 0.05 : p.moe;
    function full(x) { return Math.round(x * (1 + aleasPct) * (1 + moePct)); }
    return {
      lignes: lignes, sousTotal: tot, aleasPct: aleasPct, moePct: moePct,
      total: { bas: full(tot.bas), moyen: full(tot.moyen), haut: full(tot.haut) },
      hypotheses: hyp,
      avertissement: 'Fourchettes indicatives. Seul un devis d’entreprise fait foi.'
    };
  }

  // ---------- Financement ----------
  function financer(b, p, opts) {
    opts = opts || {};
    var prix = num(b.prix);
    var res = { ok: prix !== null, alertes: [] };
    if (prix === null) {
      res.alertes.push('Prix non publié : analyse financière impossible, à demander.');
      res.voyant = { couleur: 'gris', raison: 'Prix inconnu.' };
      return res;
    }
    var neg = margeNegociation(b, p);
    var prixCible = opts.prixForce != null ? opts.prixForce : Math.round(prix * (1 - neg.taux));
    var fraisPct = b.mode_vente === 'encheres' ? p.fraisEncheres : (b.mode_vente === 'cession_fonds' ? p.fraisCession : p.notaireAncien);
    if (b.mode_vente === 'public_aot' || b.mode_vente === 'location') fraisPct = 0.01;
    var honoraires = (b.prix_inclut_honoraires === false) ? prixCible * (b.honoraires_pct != null ? b.honoraires_pct / 100 : p.honorairesAgenceSiNonInclus) : 0;
    var frais = Math.round(prixCible * fraisPct + honoraires);
    var trav = estimerTravaux(b, p);
    var travaux = trav.total.moyen;
    var moisTravaux = clamp(Math.round(travaux / 100000 * p.moisTravauxParTranche), 3, 12);
    var moisAvantRecettes = (b.activite_reception_existante ? 1 : p.moisAutorisations) + (b.activite_reception_existante ? 1 : moisTravaux);
    // différé : intérêts seuls pendant la période sans recettes, financés par la trésorerie de démarrage
    var coutHorsTreso = prixCible + frais + travaux;
    var apportTotal = p.apport + (p.pretHonneur || 0);
    // déblocage progressif : la moitié du prêt en moyenne pendant le différé
    var interetsDiffere = Math.max(0, coutHorsTreso - apportTotal) * 0.5 * p.taux * moisAvantRecettes / 12;
    var chargesPendant = (p.chargesFixes + p.energieFixe) * 0.5 * moisAvantRecettes / 12;
    var treso = Math.round(p.tresorerieDemarrage + interetsDiffere + chargesPendant);
    var coutTotal = Math.round(coutHorsTreso + treso);
    var emprunt = Math.max(0, coutTotal - apportTotal);
    var mens = mensualite(emprunt, p.taux, p.duree);
    var annuite = Math.round(mens * 12 + emprunt * p.assurancePct);

    // exploitation
    var valeurBatie = prixCible + travaux;
    var tf = num(b.taxe_fonciere) || p.taxeFonciereDefaut;
    var prixMoyen = p.prixHaute * p.partHaute + p.prixBasse * (1 - p.partHaute);
    var margeMariage = prixMoyen * (1 - p.commissionPct) + p.extrasParMariage - p.chargesVariablesParMariage;
    var fixes = p.chargesFixes + p.energieFixe + tf + valeurBatie * p.assurancesPct;
    var scen = {};
    ['prudent', 'base', 'ambitieux'].forEach(function (k) {
      var n = p.mariages[k];
      var ca = Math.round(n * (prixMoyen + p.extrasParMariage / 0.5) + p.autresEvenements / 0.6); // extras et événements en chiffre d'affaires brut (marge supposée 50 % et 60 %)
      var ebe = Math.round(n * margeMariage + p.autresEvenements - fixes);
      scen[k] = { mariages: n, ca: ca, ebe: ebe, dscr: annuite > 0 ? ebe / annuite : null, cashflow: ebe - annuite };
    });
    var pointMort = margeMariage > 0 ? (fixes + annuite - p.autresEvenements) / margeMariage : null;
    // 10 ans
    var valeurRevente = Math.round((prixCible + travaux * p.partTravauxValorisee) * Math.pow(1 + p.revalorisation, 10));
    var crd10 = Math.round(capitalRestant(emprunt, p.taux, p.duree, 120));
    var cumulCF = scen.base.cashflow * 10; // la trésorerie de démarrage est déjà dans le coût
    var gain10 = cumulCF + valeurRevente - crd10 - apportTotal;
    var multiple = apportTotal > 0 ? (cumulCF + valeurRevente - crd10) / apportTotal : null;

    // capacité : apport + DSCR
    var capaStandard = apportTotal / p.apportMinPct;
    var capaMontage = (apportTotal + p.investisseursMax) / p.apportMinPct;
    var empruntMaxDscr = capitalPourAnnuite(Math.max(0, scen.base.ebe) / p.dscrCible, p.taux, p.duree, p.assurancePct);
    var apportMin = Math.max(Math.round(coutTotal * p.apportMinPct), Math.round(coutTotal - empruntMaxDscr));
    var dscr = scen.base.dscr;
    var horsPortee = false, montageRequis = false;
    if (coutTotal > capaStandard || (dscr !== null && dscr < p.dscrCible)) {
      montageRequis = true;
      var apportAvecInvest = apportTotal + p.investisseursMax;
      var empruntMontage = Math.max(0, coutTotal - apportAvecInvest);
      var annMontage = mensualite(empruntMontage, p.taux, p.duree) * 12 + empruntMontage * p.assurancePct;
      var dscrMontage = annMontage > 0 ? scen.base.ebe / annMontage : 99;
      if (coutTotal > capaMontage || dscrMontage < 1.1) horsPortee = true;
    }
    var voyant;
    if (horsPortee) voyant = { couleur: 'rouge', raison: 'Coût total ' + fmtK(coutTotal) + ' pour une capacité de ' + fmtK(capaStandard) + ' ; il faudrait ' + fmtK(apportMin) + ' d’apport ou un associé majoritaire.' };
    else if (montageRequis) voyant = { couleur: 'orange', raison: (dscr !== null && dscr < p.dscrCible ? 'DSCR ' + dscr.toFixed(2) + ' sous la cible ' + p.dscrCible + '. ' : '') + 'Passe avec investisseurs minoritaires, crédit-bail ou crédit vendeur (apport mini ' + fmtK(apportMin) + ').' };
    else voyant = { couleur: 'vert', raison: 'Apport suffisant et DSCR ' + (dscr !== null ? dscr.toFixed(2) : 'n/a') + ' au-dessus de ' + p.dscrCible + ' en scénario base.' };

    res.prixAffiche = prix; res.negociation = neg; res.prixCible = prixCible;
    res.fraisPct = fraisPct; res.frais = frais; res.travaux = trav; res.travauxRetenus = travaux;
    res.moisAvantRecettes = moisAvantRecettes; res.tresorerie = treso; res.coutTotal = coutTotal;
    res.apport = apportTotal; res.emprunt = Math.round(emprunt); res.mensualite = Math.round(mens); res.annuite = annuite;
    res.prixMoyenWeekend = Math.round(prixMoyen); res.margeParMariage = Math.round(margeMariage); res.chargesFixes = Math.round(fixes);
    res.scenarios = scen; res.dscr = dscr; res.pointMortMariages = pointMort;
    res.valeurRevente = valeurRevente; res.crd10 = crd10; res.gain10 = Math.round(gain10); res.multiple10 = multiple;
    res.capaciteStandard = Math.round(capaStandard); res.capaciteMontage = Math.round(capaMontage);
    res.apportMinimum = apportMin; res.horsPortee = horsPortee; res.montageRequis = montageRequis; res.voyant = voyant;
    if (!opts.sansInverse) res.prixMaxCompatible = prixMaxCompatible(b, p);
    if (b.mode_vente === 'encheres') res.alertes.push('Vente aux enchères : la mise à prix n’est pas le prix final, frais d’environ ' + Math.round(p.fraisEncheres * 100) + ' %, consignation à prévoir.');
    if (b.mode_vente === 'cession_fonds') res.alertes.push('Cession de fonds : le prix couvre l’activité ; vérifier si les murs sont inclus.');
    return res;
  }

  // Calcul inverse : prix affiché maximal qui reste vert (apport et DSCR)
  function prixMaxCompatible(b, p) {
    var lo = 0, hi = 5e6, ok = false;
    for (var i = 0; i < 40; i++) {
      var mid = (lo + hi) / 2;
      var f = financer(b, p, { prixForce: mid, sansInverse: true });
      if (f.voyant && f.voyant.couleur === 'vert') { lo = mid; ok = true; } else hi = mid;
    }
    if (!ok) return 0;
    var neg = margeNegociation(b, p).taux;
    return Math.round(lo / (1 - neg) / 1000) * 1000;
  }

  function fmtK(x) { return x == null ? 'n/a' : (Math.round(x / 1000)).toLocaleString('fr-FR') + ' k€'; }

  // ---------- Score ----------
  function scorer(b, p, fin) {
    p = p || DEFAULTS;
    fin = fin || financer(b, p);
    var W = p.poids, sub = {}, expl = {};
    var cachet = b.cachet || [];
    // Cachet
    var c = 0; cachet.forEach(function (k) { c += CACHET_POIDS[k] || 0.5; });
    c += TYPES_NOBLES[b.type] || 0;
    sub.cachet = clamp(c / 12, 0, 1);
    expl.cachet = cachet.length ? 'Atouts : ' + cachet.join(', ') + '.' : 'Aucun élément de cachet relevé dans l’annonce.';
    // Capacité
    var salle = num(b.surface_salle_m2), bati = num(b.surface_bati_m2), terrain = num(b.terrain_m2), cap = num(b.capacite_annoncee);
    var cp;
    if (cap !== null && cap >= 200) cp = 1;
    else if (salle !== null && salle >= 250) cp = 0.9;
    else if (cap !== null && cap >= 120) cp = 0.6;
    else if (bati !== null && bati >= 500) cp = 0.7;
    else if (bati !== null && bati >= 250) cp = 0.5;
    else if (terrain !== null && terrain >= 10000) cp = 0.4;
    else cp = (bati === null && salle === null) ? 0.25 : 0.15;
    if (terrain !== null && terrain < 3000 && !b.activite_reception_existante) cp -= 0.15; // parking 70-100 voitures
    sub.capacite = clamp(cp, 0, 1);
    expl.capacite = cap ? 'Capacité annoncée ' + cap + ' personnes.' : salle ? 'Salle de ' + salle + ' m².' : bati ? bati + ' m² bâtis, salle à créer ou adapter.' : 'Surfaces non publiées, capacité à vérifier.';
    // Réglementaire
    var rg = 0.5;
    if (b.activite_reception_existante) rg += 0.35;
    if (TYPES_ERP[b.type]) rg += 0.15 * TYPES_ERP[b.type];
    if (cachet.indexOf('mh') >= 0) rg -= 0.1;
    if (b.type === 'grange' || b.type === 'ferme' || b.type === 'longere') rg -= 0.1; // changement de destination
    if (terrain !== null && terrain >= 20000) rg += 0.1; // distance aux voisins
    if (b.risques && b.risques.ppri === 'rouge') rg -= 0.3;
    sub.reglementaire = clamp(rg, 0, 1);
    expl.reglementaire = b.activite_reception_existante ? 'Activité de réception déjà exercée : autorisations probablement en place.' : TYPES_ERP[b.type] ? 'Bâtiment déjà recevant du public, conversion plus simple.' : 'Changement de destination, ERP et voisinage à valider (PLU, mairie).';
    // Finançabilité
    var fz;
    if (!fin.ok) { fz = 0.2; expl.financabilite = 'Prix inconnu.'; }
    else {
      var ratio = fin.coutTotal / fin.capaciteStandard;
      fz = ratio <= 1 ? 1 : ratio <= 1.5 ? 0.7 : ratio <= 2.5 ? 0.4 : ratio <= 4 ? 0.2 : 0.05;
      if (fin.dscr !== null && fin.dscr < 1) fz *= 0.6;
      expl.financabilite = 'Coût total ' + fmtK(fin.coutTotal) + ' pour ' + fmtK(fin.capaciteStandard) + ' de capacité, voyant ' + fin.voyant.couleur + '.';
    }
    sub.financabilite = clamp(fz, 0, 1);
    // Rentabilité
    var rt = 0.2;
    if (fin.ok && fin.dscr !== null) rt = clamp((fin.dscr - 0.6) / 1.2, 0, 1);
    sub.rentabilite = rt;
    expl.rentabilite = fin.ok ? 'Point mort à ' + (fin.pointMortMariages != null ? Math.ceil(fin.pointMortMariages) : 'n/a') + ' mariages par an, DSCR base ' + (fin.dscr != null ? fin.dscr.toFixed(2) : 'n/a') + '.' : 'Non calculable sans prix.';
    // Localisation
    var t = num(b.trajet_min);
    var lc = t === null ? 0.4 : clamp(1 - Math.max(0, t - 15) / 40, 0, 1);
    var dTours = num(b.dist_gare_km);
    if (dTours !== null && dTours <= 30) lc = clamp(lc + 0.1, 0, 1); // offre hôtelière de Tours / Amboise
    sub.localisation = lc;
    expl.localisation = t !== null ? t + ' min de la gare TGV de Saint-Pierre-des-Corps.' : 'Temps de trajet non calculé (localisation imprécise).';
    // Hébergement
    var ch = num(b.chambres);
    var hb = ch === null ? 0.2 : clamp(ch / 15, 0, 1);
    if (b.logement_exploitant) hb = clamp(hb + 0.3, 0, 1);
    sub.hebergement = hb;
    expl.hebergement = ch !== null ? ch + ' chambres' + (b.logement_exploitant ? ' et logement exploitant.' : '.') : 'Couchages non précisés.';
    // Négociabilité
    var ng = 0.4, j = joursEnLigne(b);
    if (b.mode_vente === 'encheres') ng = 0.9;
    if (j !== null) ng += j > 365 ? 0.4 : j > 180 ? 0.2 : 0;
    if (b.baisse_prix) ng += 0.2;
    if (/liquidation|succession|urgent/i.test(b.description || '')) ng += 0.2;
    sub.negociabilite = clamp(ng, 0, 1);
    expl.negociabilite = b.mode_vente === 'encheres' ? 'Vente aux enchères, prix final ouvert.' : b.baisse_prix ? 'Baisse de prix constatée.' : j !== null ? 'En ligne depuis ' + j + ' jours.' : 'Ancienneté de l’annonce inconnue.';
    // Upside
    var up = 0.2;
    if (terrain !== null && terrain >= 20000) up += 0.25;
    if (ch !== null && ch >= 6) up += 0.2;
    if (cachet.indexOf('cave') >= 0 || b.type === 'troglodyte') up += 0.15;
    if (cachet.indexOf('loire') >= 0) up += 0.15;
    if (bati !== null && bati >= 800) up += 0.15;
    sub.upside = clamp(up, 0, 1);
    expl.upside = 'Séminaires, tournages, gîtes selon surfaces et terrain.';
    // Malus
    var malus = 0, mal = [];
    var r = b.risques || {};
    if (r.ppri === 'rouge') { malus += 8; mal.push('zone rouge PPRI'); }
    else if (r.inondable || r.ppri === 'bleu') { malus += 4; mal.push('zone inondable'); }
    if (b.etat === 'ruine') { malus += 5; mal.push('état de ruine'); }
    else if (r.structure) { malus += 4; mal.push('structure ou toiture'); }
    if (r.amiante || ((b.type === 'usine' || b.type === 'entrepot') && !r.amiante_ok)) { malus += 2; mal.push('amiante possible'); }
    if (r.servitudes) { malus += 2; mal.push('servitudes'); }
    if (r.copropriete || r.indivision) { malus += 3; mal.push('copropriété ou indivision'); }
    if (r.acces_difficile) { malus += 2; mal.push('accès difficile'); }
    if (r.argiles === 'fort') { malus += 1; mal.push('retrait-gonflement des argiles fort'); }
    malus = Math.min(malus, p.malusMax);

    var total = 0;
    Object.keys(W).forEach(function (k) { total += (sub[k] || 0) * W[k]; });
    var sommePoids = Object.keys(W).reduce(function (s, k) { return s + W[k]; }, 0) || 100;
    total = total * 100 / sommePoids - malus;
    var plafonne = false;
    if (fin.ok && fin.horsPortee) { if (total > 59) plafonne = true; total = Math.min(total, 59); }
    total = Math.round(clamp(total, 0, 100));
    return {
      total: total, niveau: niveau(total), sous: sub, poids: W, explications: expl,
      malus: malus, malusDetail: mal, plafonne: plafonne,
      etiquette: fin.ok && fin.horsPortee ? 'Hors de portée sauf montage spécial' : null
    };
  }
  function niveau(s) { return s >= 75 ? 'A' : s >= 60 ? 'B' : s >= 45 ? 'C' : 'D'; }

  // ---------- Stratégies A à E ----------
  var STRATEGIES = {
    A: 'Reprise murs et fonds d’un lieu en activité',
    B: 'Bien modeste à réhabiliter, fort levier',
    C: 'Bail, AOT ou appel à projets sur un bien public',
    D: 'Partenariat avec le propriétaire (exploitation, loyer variable)',
    E: 'Investisseurs minoritaires ou crédit-bail immobilier'
  };
  function strategies(b, p, fin) {
    var s = {};
    var prix = num(b.prix), act = !!b.activite_reception_existante;
    s.A = act ? (b.ca_annonce ? 90 : 75) : (b.type === 'hotel_restaurant' || b.type === 'guinguette' || b.type === 'camping') ? 45 : 5;
    s.B = (TYPES_MODESTES[b.type] && prix !== null && prix <= 450000) ? 80 - Math.round(prix / 20000) : (TYPES_MODESTES[b.type] ? 35 : 10);
    if (fin && fin.ok && !fin.montageRequis && s.B > 20) s.B += 10;
    s.C = (b.mode_vente === 'public_aot' || b.vendeur_public) ? 85 : (b.type === 'chapelle' || b.type === 'gare' || b.type === 'ecole' || b.type === 'colonie') ? 40 : 5;
    s.D = (TYPES_NOBLES[b.type] >= 2 && fin && fin.ok && fin.horsPortee) ? 75 : TYPES_NOBLES[b.type] >= 2 ? 40 : 10;
    s.E = (fin && fin.ok && fin.montageRequis && !fin.horsPortee) ? 80 : (fin && fin.ok && fin.horsPortee) ? 30 : 20;
    Object.keys(s).forEach(function (k) { s[k] = clamp(Math.round(s[k]), 0, 100); });
    var best = Object.keys(s).sort(function (x, y) { return s[y] - s[x]; })[0];
    return { scores: s, recommandee: best, libelle: STRATEGIES[best] };
  }

  // ---------- Filtres éliminatoires ----------
  function filtres(b, p, fin) {
    var f = [];
    var lim = p.voirAussi55 ? 55 : p.trajetMax;
    if (b.trajet_min != null && b.trajet_min > lim) f.push({ code: 'trajet', libelle: 'Trajet supérieur à ' + lim + ' min' });
    var bati = num(b.surface_bati_m2), terrain = num(b.terrain_m2), cap = num(b.capacite_annoncee);
    if (!b.activite_reception_existante && cap === null && bati !== null && bati < 150 && (terrain === null || terrain < 5000)) f.push({ code: 'capacite', libelle: '200 invités impossibles sans extension plausible' });
    if (b.risques && b.risques.ppri === 'rouge' && !b.risques.solution) f.push({ code: 'ppri', libelle: 'Zone rouge PPRI' });
    if (b.risques && b.risques.enclave) f.push({ code: 'enclave', libelle: 'Enclave dense sans parking' });
    if (fin && fin.ok && fin.horsPortee) f.push({ code: 'portee', libelle: 'Hors de portée, même avec montage', onglet: true });
    return f;
  }

  // ---------- Analyse complète ----------
  function analyser(b, params) {
    var p = merge(DEFAULTS, params);
    var fin = financer(b, p);
    var sc = scorer(b, p, fin);
    var st = strategies(b, p, fin);
    var fl = filtres(b, p, fin);
    return { fin: fin, score: sc, strat: st, filtres: fl };
  }

  // ---------- Dédoublonnage ----------
  function normTxt(s) {
    return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(function (w) { return w.length > 3; });
  }
  function jaccard(a, b) {
    var A = {}, B = {}, inter = 0, uni = 0;
    a.forEach(function (w) { A[w] = 1; }); b.forEach(function (w) { B[w] = 1; });
    Object.keys(A).forEach(function (w) { if (B[w]) inter++; });
    uni = Object.keys(A).length + Object.keys(B).length - inter;
    return uni ? inter / uni : 0;
  }
  function memeBien(x, y) {
    var cx = normTxt(x.commune).join(' '), cy = normTxt(y.commune).join(' ');
    var memeCommune = cx && cx === cy;
    var px = num(x.prix), py = num(y.prix), sx = num(x.surface_bati_m2), sy = num(y.surface_bati_m2);
    var prixProche = px && py && Math.abs(px - py) / Math.max(px, py) <= 0.05;
    var surfProche = sx && sy && Math.abs(sx - sy) / Math.max(sx, sy) <= 0.06;
    var txt = jaccard(normTxt((x.titre || '') + ' ' + (x.description || '')), normTxt((y.titre || '') + ' ' + (y.description || '')));
    if (!memeCommune) return false;
    if (prixProche && surfProche) return true;
    if ((prixProche || surfProche) && txt > 0.25) return true;
    return txt > 0.55;
  }
  function dedoublonner(liste) {
    var out = [];
    liste.forEach(function (b) {
      var d = out.find(function (o) { return memeBien(o, b); });
      if (d) {
        (b.sources || []).forEach(function (s) { if (!d.sources.some(function (t) { return t.url === s.url; })) d.sources.push(s); });
        Object.keys(b).forEach(function (k) { if ((d[k] === null || d[k] === undefined) && b[k] !== null && b[k] !== undefined) d[k] = b[k]; });
      } else out.push(JSON.parse(JSON.stringify(b)));
    });
    return out;
  }

  // ---------- Géométrie ----------
  function pointDansPolygone(lon, lat, poly) {
    var c = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) c = !c;
    }
    return c;
  }
  function haversineKm(lat1, lon1, lat2, lon2) {
    var R = 6371, toR = Math.PI / 180;
    var dLat = (lat2 - lat1) * toR, dLon = (lon2 - lon1) * toR;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  var API = {
    DEFAULTS: DEFAULTS, STRATEGIES: STRATEGIES, merge: merge,
    mensualite: mensualite, capitalRestant: capitalRestant, capitalPourAnnuite: capitalPourAnnuite,
    margeNegociation: margeNegociation, estimerTravaux: estimerTravaux, financer: financer, prixMaxCompatible: prixMaxCompatible,
    scorer: scorer, niveau: niveau, strategies: strategies, filtres: filtres, analyser: analyser,
    memeBien: memeBien, dedoublonner: dedoublonner, pointDansPolygone: pointDansPolygone, haversineKm: haversineKm, joursEnLigne: joursEnLigne
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.RadarEngine = API;
})(typeof window !== 'undefined' ? window : this);
