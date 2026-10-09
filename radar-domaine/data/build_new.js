const fs = require('fs'), E = require('../engine.js');
const TODAY = '2026-10-09';
const d = JSON.parse(fs.readFileSync('enriched_new.json'));
const links = fs.existsSync('linkcheck_new.json') ? JSON.parse(fs.readFileSync('linkcheck_new.json')) : [];
const st = {}; links.forEach(([u, c]) => st[u] = c);
const P = E.merge(E.DEFAULTS, {});
const out = d.biens.map(b => {
  b = { ...b };
  b.sources = b.sources.map(s => ({ ...s, collecte_le: TODAY, http: st[s.url] != null ? String(st[s.url]) : 'non testé', controle_le: TODAY }));
  b.premiere_apparition = TODAY; b.derniere_vue = TODAY;
  const txt = [b.description, b.risques_notes, (b.a_verifier || []).join(' ')].join(' ');
  if (/retir[ée]e? (par l.agence|de la vente)|annonce (retir|supprim)|supprim[ée]e par l.agence|sous compromis/i.test(txt)) {
    b.statut_annonce = 'retire'; b.controles_echec = 2; b.dernier_controle_echec = TODAY;
    b.controle_manuel = TODAY + ' : annonce signalée retirée par l’agence dès la collecte ; conservée pour mémoire.';
  }
  const a = E.analyser(b, P);
  b.historique_scores = [{ date: TODAY, score: a.score.total, niveau: a.score.niveau }];
  return b;
});
fs.writeFileSync('new_docs.json', JSON.stringify(out));
out.forEach(b => { const a = E.analyser(b, P); console.log(b.departement, a.score.total, a.score.niveau, a.fin.budgetStatut || '-', b.statut_annonce, (b.prix || 0) / 1000, b.titre.slice(0, 60)); });
