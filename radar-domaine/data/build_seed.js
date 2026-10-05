// Construit seed.json (documents à écrire dans la base de l'Artifact) à partir des fichiers enrichis.
const fs = require('fs'), E = require('../engine.js');
const TODAY = '2026-10-05';
const J = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const en = J('enriched_all.json'), links = J('linkcheck.json');
const status = {}; links.forEach(([u, c]) => status[u] = c);
const P = E.merge(E.DEFAULTS, {});
const biens = en.biens.map(b => {
  b = { ...b };
  delete b.adresse_brute;
  const codes = b.sources.map(s => status[s.url]);
  b.sources = b.sources.map(s => ({ ...s, http: status[s.url] === 200 ? 200 : String(status[s.url] || 'non testé'), controle_le: TODAY }));
  if (codes.every(c => c === 404 || c === 410)) { b.controles_echec = 1; b.statut_annonce = 'active'; b.a_verifier = [...new Set([...(b.a_verifier || []), 'annonce introuvable au premier contrôle (404)'])]; }
  const a = E.analyser(b, P);
  b.historique_scores = [{ date: TODAY, score: a.score.total, niveau: a.score.niveau }];
  b.risques = b.risques || {};
  if (b.risques_notes && /inond/i.test(b.risques_notes)) b.risques.inondable = true;
  return b;
});
// marché
const bench = J('benchmark.json');
const pr = J('params_research.json');
const val = x => x == null ? null : typeof x === 'object' ? (x.valeur || JSON.stringify(x)) : String(x);
const T = pr.taux || {};
const montages = Object.entries(pr.montages || {}).filter(([k]) => k !== 'avertissement').map(([k, v]) => ({ nom: k.replace(/_/g, ' '), description: [].concat(v).join(' ; ') }));
const financement = {
  taux: { pro_15ans_txt: val(T.pro_15ans), pro_20ans_txt: val(T.pro_20ans), immo_particulier_20ans_txt: T.immo_particulier_20ans ? 'Meilleurtaux ' + T.immo_particulier_20ans.meilleurtaux + ' %, CAFPI ' + T.immo_particulier_20ans.cafpi + ' %, Empruntis ' + T.immo_particulier_20ans.empruntis + ' %, Pretto ' + T.immo_particulier_20ans.pretto + ' %' : null, date_source: T.date_source || 'septembre 2026', sources: T.sources || [] },
  dispositifs: pr.dispositifs || [], montages, avertissement: (pr.montages || {}).avertissement || null,
  couts_travaux: pr.couts_travaux || null, fiscal: pr.fiscal || null, collecte_le: TODAY
};
const dvf = { note: 'Ventes réelles DVF 2023 à 2025, mutations à un seul local (maisons ou locaux d’activité), prix au m² bâti. Les grandes propriétés sont rares dans DVF : ordre de grandeur seulement.', communes: [] };
try { fs.readFileSync('dvf_raw.txt', 'utf8').trim().split('\n').forEach(l => { const [c, js] = l.split('|'); try { const r = JSON.parse(js); if (r.n) dvf.communes.push({ commune: c, type: r.type === 'Local' ? 'Local d’activité' : 'Maison', n: r.n, p25: r.p25, mediane: r.mediane, p75: r.p75 }); } catch (e) {} }); } catch (e) {}
// journal
const sources = [];
['portails', 'cessions', 'public', 'budget'].forEach(f => { try { (J('log_' + f + '.json').sources_interrogees || []).forEach(s => sources.push({ ...s, famille: f })); } catch (e) {} });
sources.push({ site: 'Valhalla (OSM) routage', statut: 'ok', detail: 'Isochrones 45 et 55 min, trajets samedi 10 h', nb_biens: null, famille: 'enrichissement' });
sources.push({ site: 'Base Adresse Nationale', statut: 'partiel', detail: 'Coupures réseau ponctuelles, relancé avec succès', famille: 'enrichissement' });
sources.push({ site: 'API Carto GPU (PLU)', statut: 'ok', detail: 'Zonage lu pour les biens à adresse publiée (1 bien)', famille: 'enrichissement' });
sources.push({ site: 'Géorisques API', statut: 'bloque', detail: 'Aucune réponse depuis l’environnement (délai dépassé) ; risques à vérifier à la main sur georisques.gouv.fr', famille: 'enrichissement' });
sources.push({ site: 'Overpass (OSM, échangeurs autoroutiers)', statut: 'bloque', detail: 'Connexion coupée ; accès autoroutier laissé à vérifier', famille: 'enrichissement' });
sources.push({ site: 'DVF (data.gouv.fr)', statut: 'ok', detail: dvf.communes.length + ' séries communales', famille: 'enrichissement' });
const an = biens.map(b => ({ b, a: E.analyser(b, P) }));
const niv = { A: 0, B: 0, C: 0, D: 0 }; an.forEach(x => niv[x.a.score.niveau]++);
const top = an.filter(x => !x.a.filtres.length).sort((x, y) => y.a.score.total - x.a.score.total).slice(0, 5);
const digest = 'Première collecte, ' + TODAY + '.\n' + biens.length + ' biens uniques (53 fiches brutes, 1 doublon fusionné). Niveaux : A ' + niv.A + ', B ' + niv.B + ', C ' + niv.C + ', D ' + niv.D + '.\n\nTop 5 dans le radar :\n' + top.map((x, i) => (i + 1) + '. ' + x.b.titre + ' (' + (x.b.commune || '?') + ') : ' + x.a.score.total + '/100, ' + (x.b.prix ? Math.round(x.b.prix / 1000) + ' k€' : 'prix ?')).join('\n');
const journal = { date: TODAY, type: 'collecte initiale', nb_biens_vus: 53, nouveaux: biens.length, baisses: 0, retires: 0, sources, anomalies: en.log.filter(l => !/Connection reset/.test(l)), resume: 'Collecte initiale par 5 familles de sources en parallèle, plus une collecte ciblée sur le segment à moins de 650 k€. ' + links.filter(l => l[1] === 200).length + ' liens sur ' + links.length + ' répondent (1 annonce en 404, 2 sites en erreur de certificat).', digest };
fs.writeFileSync('seed.json', JSON.stringify({ biens, marche: { benchmark: bench, financement, dvf }, journal: [journal] }, null, 1));
console.log(digest);
console.log(an.map(x => x.a.score.total + ' ' + x.a.score.niveau + ' ' + x.a.fin.voyant.couleur + ' ' + x.a.strat.recommandee + ' ' + (x.a.filtres.map(f => f.code).join(',') || '-') + ' | ' + x.b.titre.slice(0, 60)).sort().reverse().join('\n'));
