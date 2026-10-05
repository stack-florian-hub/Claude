// Tests du moteur Radar Domaine : node --test radar-domaine/tests
const test = require('node:test');
const assert = require('node:assert');
const E = require('../engine.js');
const P = E.merge(E.DEFAULTS, {});

const base = {
  titre: 'Grange en tuffeau avec parc', type: 'grange', commune: 'Vouvray', prix: 300000,
  surface_bati_m2: 450, terrain_m2: 15000, etat: 'a_renover', cachet: ['tuffeau', 'charpente', 'parc'],
  chambres: 3, trajet_min: 18, dist_gare_km: 9, activite_reception_existante: false, mode_vente: 'classique'
};

test('mensualité : formule standard', () => {
  const m = E.mensualite(100000, 0.04, 20);
  assert.ok(Math.abs(m - 605.98) < 0.1, m);
  assert.strictEqual(E.mensualite(0, 0.04, 20), 0);
  assert.ok(Math.abs(E.mensualite(120000, 0, 10) - 1000) < 1e-9);
});

test('capital restant dû : nul à échéance, plein au départ', () => {
  assert.ok(E.capitalRestant(100000, 0.04, 20, 240) < 1);
  assert.ok(Math.abs(E.capitalRestant(100000, 0.04, 20, 0) - 100000) < 1e-6);
});

test('capitalPourAnnuite inverse la mensualité', () => {
  const c = E.capitalPourAnnuite(E.mensualite(200000, 0.04, 20) * 12, 0.04, 20, 0);
  assert.ok(Math.abs(c - 200000) < 5, c);
});

test('bien sans prix : pas de chiffres inventés, voyant gris, score calculé', () => {
  const a = E.analyser({ ...base, prix: null }, P);
  assert.strictEqual(a.fin.ok, false);
  assert.strictEqual(a.fin.voyant.couleur, 'gris');
  assert.ok(a.score.total >= 0 && a.score.total <= 100);
  assert.strictEqual(a.fin.coutTotal, undefined);
});

test('bien sans surface : capacité faible mais pas d\'erreur', () => {
  const a = E.analyser({ ...base, surface_bati_m2: null, terrain_m2: null }, P);
  assert.ok(a.score.sous.capacite <= 0.25);
  assert.ok(a.fin.travaux.lignes.some(l => /Salle à créer/.test(l.poste)));
});

test('hors zone : filtre trajet actif, désactivable par voirAussi55', () => {
  const b = { ...base, trajet_min: 50 };
  assert.ok(E.analyser(b, P).filtres.some(f => f.code === 'trajet'));
  assert.ok(!E.analyser(b, { ...P, voirAussi55: true }).filtres.some(f => f.code === 'trajet'));
  assert.ok(E.analyser({ ...b, trajet_min: 60 }, { ...P, voirAussi55: true }).filtres.some(f => f.code === 'trajet'));
});

test('règle de réalisme : château à 3 M€ plafonné à 59 et étiqueté', () => {
  const b = { ...base, type: 'chateau', prix: 3000000, surface_bati_m2: 1200, cachet: ['patrimoine', 'mh', 'loire', 'parc', 'tuffeau', 'charpente', 'chapelle'], chambres: 15, terrain_m2: 80000, logement_exploitant: true };
  const a = E.analyser(b, P);
  assert.strictEqual(a.fin.horsPortee, true);
  assert.ok(a.score.total <= 59, a.score.total);
  assert.strictEqual(a.score.etiquette, 'Hors de portée sauf montage spécial');
  assert.strictEqual(a.fin.voyant.couleur, 'rouge');
  assert.ok(a.filtres.some(f => f.code === 'portee'));
});

test('lieu en activité : stratégie A recommandée', () => {
  const a = E.analyser({ ...base, type: 'lieu_reception_activite', activite_reception_existante: true, capacite_annoncee: 220, ca_annonce: 180000 }, P);
  assert.strictEqual(a.strat.recommandee, 'A');
});

test('enchères : pas de négociation, frais majorés', () => {
  const f = E.financer({ ...base, mode_vente: 'encheres' }, P);
  assert.strictEqual(f.prixCible, 300000);
  assert.strictEqual(f.fraisPct, P.fraisEncheres);
});

test('apport plus élevé améliore la finançabilité', () => {
  const b = { ...base, prix: 500000 };
  const f1 = E.financer(b, { ...P, apport: 50000 });
  const f2 = E.financer(b, { ...P, apport: 100000 });
  assert.ok(f2.emprunt < f1.emprunt);
  assert.ok(f2.capaciteStandard > f1.capaciteStandard);
});

test('prix max compatible : un bien à ce prix passe au vert', () => {
  const pm = E.financer(base, P).prixMaxCompatible;
  assert.ok(pm >= 0);
  if (pm > 0) {
    const f = E.financer({ ...base, prix: pm * 0.97 }, P);
    assert.strictEqual(f.voyant.couleur, 'vert');
  }
});

test('score borné et niveaux', () => {
  assert.strictEqual(E.niveau(80), 'A'); assert.strictEqual(E.niveau(60), 'B');
  assert.strictEqual(E.niveau(45), 'C'); assert.strictEqual(E.niveau(44), 'D');
  const a = E.analyser({ ...base, risques: { ppri: 'rouge', structure: true, servitudes: true, indivision: true, acces_difficile: true } }, P);
  assert.ok(a.score.malus <= 15);
  assert.ok(a.filtres.some(f => f.code === 'ppri'));
});

test('pondérations modifiables', () => {
  const p2 = E.merge(E.DEFAULTS, { poids: { cachet: 60 } });
  const a1 = E.analyser(base, P).score.total, a2 = E.analyser(base, p2).score.total;
  assert.notStrictEqual(a1, a2);
});

test('dédoublonnage : même grange sur deux portails fusionnée', () => {
  const x = { ...base, sources: [{ url: 'https://a.fr/1' }], description: 'Belle grange tuffeau charpente parc arboré Vouvray' };
  const y = { ...base, prix: 299000, surface_bati_m2: 455, sources: [{ url: 'https://b.fr/9' }], description: 'Grange tuffeau charpente remarquable' };
  const z = { ...base, commune: 'Amboise', sources: [{ url: 'https://c.fr/2' }] };
  const d = E.dedoublonner([x, y, z]);
  assert.strictEqual(d.length, 2);
  assert.strictEqual(d[0].sources.length, 2);
});

test('exclusion par apport : montant à lever comparé à apport max / 10 %', () => {
  const p = E.merge(E.DEFAULTS, { apportMax: 80000, apportPctBas: 0.10, apportPctHaut: 0.20 });
  const petit = E.analyser({ ...base, type: 'lieu_reception_activite', activite_reception_existante: true, prix: 300000 }, p);
  assert.strictEqual(petit.fin.budgetMaxHaut, 800000);
  assert.strictEqual(petit.fin.budgetMaxBas, 400000);
  assert.strictEqual(petit.fin.exclu, false);
  assert.strictEqual(petit.fin.montantALever, petit.fin.prixCible + petit.fin.frais + petit.fin.travauxRetenus);
  const gros = E.analyser({ ...base, type: 'chateau', prix: 2000000 }, p);
  assert.strictEqual(gros.fin.exclu, true);
  assert.ok(gros.filtres.some(f => f.code === 'exclu'));
  assert.ok(gros.fin.apportRequisBas > 80000);
  const sansPrix = E.analyser({ ...base, prix: null }, p);
  assert.ok(!sansPrix.filtres.some(f => f.code === 'exclu'));
});

test('base vide : aucune erreur', () => {
  assert.deepStrictEqual(E.dedoublonner([]), []);
});

test('géométrie', () => {
  const sq = [[0, 0], [1, 0], [1, 1], [0, 1]];
  assert.ok(E.pointDansPolygone(0.5, 0.5, sq));
  assert.ok(!E.pointDansPolygone(1.5, 0.5, sq));
  assert.ok(Math.abs(E.haversineKm(47.3858, 0.7233, 47.413, 0.982) - 19.8) < 1.5);
});
