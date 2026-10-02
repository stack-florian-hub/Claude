# Brief : outil de prospection d'enchères et d'aide à la décision (marchand de biens)

Document de passage de la conversation vers Claude Code et un artefact. Date : 02/10/2026.
Il contient (1) le besoin métier, volontairement ambitieux, (2) toutes les données et décisions accumulées dans la conversation, (3) les règles métier à respecter. Aucune contrainte technique n'est imposée : choisir librement les moyens.

Convention de lecture : [CERTAIN] = lu dans un document ou donné par Florian. [HYPOTHÈSE] = jugement ou ordre de grandeur non vérifié. [À VÉRIFIER] = information rapportée, à confirmer par une source.

---

## 1. Qui, quoi, pourquoi

- **Florian Tué**, consultant, habite Nantes, **déménage à Tours fin octobre / début novembre 2026** pour environ 4 ans.
- Il porte l'activité via sa **SASU "Financière Tué et Fils"** (à l'IS), qui joue le rôle de holding. Une filiale dédiée à l'achat-revente est envisagée plus tard. La même holding doit aussi porter un projet de reprise d'entreprise dans le bassin de Tours.
- **Cash disponible : 50 000 €.** Un seul achat possible à la fois. Il décrit sa situation ainsi : "j'ai qu'une balle dans le fusil sur Q4 2026".
- **Stratégie** : achat-revente rapide (marchand de biens) de biens achetés aux **enchères judiciaires**, revendus via un agent immobilier.
- **Cible de rentabilité** : revendre entre **x2 et x3 le coût d'achat brut** (prix d'adjudication + frais taxés/émoluments + droits). La revente est évaluée au prix le plus bas pertinent à l'adresse (fourchette basse MeilleursAgents), pas à la moyenne.
- **Zones** : Loire-Atlantique (44), Vendée (85), autour de Tours (37) et d'Angers (49). Depuis son déménagement : **tout ce qui est à moins de 1h30 de voiture de Tours** (ajoute notamment 41, 72, 86, 45 selon le trajet).
- **Mise à prix** : autour de 30 000 € maximum comme point de départ.
- **Ce qu'il attend de l'outil** : professionnaliser la recherche, concentrer l'effort sur les meilleurs lots, décider avec des chiffres, et apprendre de chaque enchère (gagnée ou perdue).

## 2. Ce qui vient de se passer, et la leçon

- **Local commercial, 18 rue de Richebourg, Nantes** (MAP 25 000 €, audience vendredi 02/10/2026 à 10h, TJ Nantes). Plafond décidé : **31 000 €** maximum, par petites enchères, en démarrant à 18 750 € si baisse d'un quart.
- **Résultat rapporté par Florian : adjugé 56 000 €** [À VÉRIFIER sur Licitor / encheres-publiques]. Soit **2,24 x la MAP**, environ **1 280 €/m²** (43,76 m²).
- **Écart avec le modèle** :
  - Notre "prix adjugé probable" était 75 000 € (coefficient 3,0 x MAP, simple jugement). Le coefficient était trop haut de +34 % par rapport à la réalité.
  - Mais notre **plafond (30 à 31 k€) ne représentait que 54 à 55 % du prix réel**. On était loin du compte. La règle "MAP ≤ 30 k€ et plafond bas" n'a aucune chance dans un centre-ville dense avec un bien correct.
- **Ce que le prix de 56 k€ aurait donné si acheté** (calcul de contrôle, mêmes hypothèses que l'onglet Coûts) : coût brut environ 64 600 €, total avant revente environ 85 300 €, revente nette environ 66 900 € : **perte d'environ 18 000 €**, multiple 1,09. L'enchère n'était pas rentable à ce niveau : ne pas la gagner était le bon résultat.
- **Hypothèse à tester avec des données (pas encore démontrée, un seul point)** : le prix d'adjudication est tiré par la **valeur de marché du bien** (surtout en ville, avec des enchérisseurs professionnels), pas par la mise à prix. La MAP basse est un appât. Le potentiel de x2 à x3 existe surtout dans les marchés peu concurrentiels (communes rurales, biens occupés, biens compliqués, dossiers sans visite, audiences peu suivies). L'outil doit mesurer ça.
- **Conséquence immédiate** : le cash de 50 k€ est intact. La prochaine audience utile est **Pineaux (Vendée) le 12/10**.

## 3. Ambition de l'outil (besoin métier)

Dans l'esprit : un **radar de prospection + un analyste d'investissement + un tableau de bord de pilotage**, qui apprend de chaque résultat. Tout ce qui suit est un besoin, pas une solution technique.

### 3.1 Veille et collecte des ventes à venir
- Couvrir en continu toutes les ventes judiciaires immobilières des tribunaux de la zone : Nantes, La Roche-sur-Yon, Les Sables-d'Olonne selon le ressort, Angers, Saumur, Tours, Blois, Le Mans, Laval, Poitiers, Orléans et leurs voisins à moins de 1h30 de Tours.
- Pour chaque lot : adresse, type, surface, mise à prix, tribunal, date et heure d'audience, dates de visite, avocat poursuivant (nom, cabinet, tél), commissaire de justice, occupation, créancier/débiteur, liens, documents téléchargeables (cahier des conditions de vente, PV de description, diagnostics, règlement de copropriété, PV d'AG, certificat d'urbanisme).
- **Détecter les changements** : MAP modifiée, audience reportée ou annulée, lot retiré (paiement amiable du saisi), visite annulée, nouveaux documents.
- Sources à croiser : Licitor, encheres-publiques.com, vench.fr, informateurjudiciaire.fr, avoventes.fr, sites d'avocats, tribunaux. Respecter les conditions d'usage des sites : ne jamais contourner un blocage, dire clairement qu'une source est inaccessible.
- **Filtres métier** : MAP maximale, zone et temps de trajet depuis Tours, type de bien, occupation, présence d'un avocat disponible dans le barreau concerné, compatibilité avec le cash.

### 3.2 Fiche d'investissement par lot (une page décisionnelle)
- Lecture automatique des documents (cahier, PV, diagnostics, RCP, PV d'AG) avec extraction des points qui changent le prix : occupation, bail, charges et arriérés, travaux votés, servitudes, urbanisme, diagnostics manquants, TVA, recours du saisi, risque de paiement avant l'audience, état du bien, surface réelle (Carrez, mesurage).
- **Valorisation défendable** : prix au m² bas / médian / haut avec source, comparables vendus (DVF), comparables adjugés, annonces actives, loyer potentiel et rendement pour un investisseur acheteur. Chaque hypothèse marquée comme telle, avec sa date et sa source. Rien ne s'affiche comme certain s'il ne l'est pas.
- **Coûts complets** (voir section 6) et sensibilités : TVA oui/non, régime de droits, travaux +50 %, revente -15 %, délai +3 mois, cash limité.
- **Trois plafonds** : plafond multiple cible, plafond cash, plafond de marge minimale en euros. Un **plafond recommandé** (le plus bas des trois) et un **prix d'équilibre** (marge nulle) au-delà duquel on n'enchérit jamais.
- **Probabilité de gagner** à un plafond donné, fondée sur l'historique des résultats (section 3.3), pas sur un coefficient d'intuition.
- **Espérance** = probabilité de gagner x marge attendue, comparée au coût d'une tentative (honoraires de l'avocat si l'enchère n'est pas retenue, caution immobilisée, temps).
- **Checklist des pièces manquantes** et des questions à poser à l'avocat poursuivant, générée par lot.
- **Décision lisible** : Priorité 1 / À creuser / Tentative plafonnée / Veille / Hors jeu, avec les raisons en une phrase.

### 3.3 Base des résultats passés (priorité haute)
Constituer et alimenter en continu un **historique des adjudications**, sur 24 mois au moins, dans la zone élargie.
- **Champs par résultat** : date, tribunal, commune, adresse, type, surface, MAP, prix adjugé, ratio adjugé/MAP, prix/m² adjugé, occupation, état, mise à prix après baisse éventuelle, nombre d'enchères ou d'enchérisseurs si connu, surenchère oui/non, avocat poursuivant, source, lien.
- **Indicateurs calculés** : médiane, P25 et P75 du ratio adjugé/MAP par segment (type, zone, tranche de MAP, occupation, taille de commune), prix/m² adjugé comparé au DVF de la même période (décote moyenne d'enchères), taux de lots sans enchère (baisse d'un quart), taux de surenchère, délai entre l'annonce et l'adjudication.
- **Questions auxquelles la base doit répondre** :
  - Où, quand et sur quels types de lots a-t-on adjugé proche de la MAP (ratio < 1,5) ?
  - Pour une MAP donnée et un type donné, quel plafond gagne dans 30 %, 50 %, 80 % des cas ?
  - Quelle est la décote réelle d'adjudication par rapport au marché selon les communes ?
  - Un bien occupé, sans visite ou sans documents part-il vraiment moins cher ?
  - Les ventes à petite MAP en centre-ville dépassent-elles systématiquement 2 x la MAP ?
- **Back-test** : comparer chaque prédiction du modèle avec le résultat réel (Richebourg : prédit 75 k€, réel 56 k€) et corriger les coefficients automatiquement.
- Les résultats de **nos propres lots suivis** alimentent aussi une table de post-mortem : notre plafond, le prix réel, l'écart, ce que le modèle aurait dû dire.

### 3.4 Portefeuille, cash et séquençage
- Gérer la contrainte "une balle" : cash engagé, caution immobilisée, cash libre par date. Une adjudication doit être payée sous 2 mois, donc ne pas gagner deux lots incompatibles avec le cash.
- **Arbitrage entre lots simultanés** : classer par espérance de gain ajustée du cash, proposer la séquence d'audiences, signaler les conflits (même jour, même avocat, même cash).
- **Stratégie de volume** à évaluer : se présenter sur beaucoup d'audiences avec des plafonds fermes, sachant qu'une tentative ratée coûte environ 200 € (180 à 240 € selon l'avocat) mais que la probabilité de gagner est faible. L'outil doit calculer combien de tentatives sont nécessaires pour une probabilité raisonnable d'obtenir un lot rentable, et si la stratégie est positive.
- Prévoir l'évolution : montée en puissance du cash, financement complémentaire (holding, prêt relais), structure par opération (SASU puis filiale dédiée).

### 3.5 Exécution : avocats, calendrier, caution
- **Annuaire des avocats et des commissaires de justice**, par barreau : coordonnées, forfait d'enchère, honoraires en cas d'adjudication, expérience, délai de réponse, notes. Chaque tribunal exige un avocat de son barreau : l'outil dit pour chaque lot quel avocat peut enchérir et signale quand il en manque un.
- **Calendrier** des visites, audiences, échéances de paiement, rappels, avec statuts.
- **Checklist avant audience** (J-14 à J0) : pièces demandées, mandat d'enchérir, justificatifs de la société (Kbis, statuts, pièce d'identité), plafond écrit à l'avocat, caution (chèque de banque libellé au bon ordre, voir 7), assurance prête, banquier prévenu, avocat confirmé.
- **Checklist après adjudication** : surenchère (10 jours), frais taxés (1 mois), prix et droits (2 mois), publication du titre (2 mois), assurance dès le jugement, serrurier et constat, état de l'occupation, plan d'expulsion éventuel, trêve hivernale.

### 3.5 bis Après achat : suivi des opérations
- Suivi de chaque opération : budget prévu vs réel, travaux (devis, planning, attestations décennale), mise en vente par l'agent, offres, vente, impôts (IS, TVA sur marge éventuelle), marge réelle, multiple réel, ROI annualisé.
- Alertes d'assurance et d'obligations (DO et CNR si travaux de type décennale, voir 7).

### 3.6 Tableau de bord, mis à jour chaque lundi
Une page de pilotage lisible en moins d'une minute, avec l'historique des semaines précédentes.
- **En tête** : cash disponible / engagé / libre, prochaine audience, nombre de lots prioritaires, décisions à prendre cette semaine.
- **Ce qui a changé depuis lundi dernier** : nouveaux lots, lots retirés ou reportés, résultats tombés (avec écart vs notre modèle), MAP modifiées.
- **Top lots** classés par score et par espérance, avec plafond recommandé et probabilité de gagner.
- **Agenda des 14 prochains jours** : visites, audiences, échéances, actions.
- **Pipeline en entonnoir** : repérés, analysés, plafond fixé, enchéri, gagné, revendu.
- **Marché** : ratio adjugé/MAP médian par zone et par type sur 90 jours, prix/m² adjugé vs DVF, tendance.
- **Qualité du modèle** : erreur moyenne entre prédit et réel, nombre de résultats collectés, niveau de confiance par segment.
- **Réseau** : avocats disponibles par barreau, ceux qui manquent pour les audiences à venir.
- **Digest du lundi** (court, actionnable) : 5 actions de la semaine, 3 lots à regarder, 1 point d'alerte.
- **Archive hebdomadaire** : conserver chaque lundi pour voir l'évolution et mesurer la progression du modèle.

### 3.7 Alertes hors lundi
Lot prioritaire nouveau, MAP baissée, audience dans moins de 7 jours sans avocat mandaté, pièces manquantes sur un lot suivi, lot suivi adjugé (avec le résultat), audience reportée, dépassement du cash, échéance de paiement proche.

### 3.8 Qualité, traçabilité, garde-fous
- Chaque chiffre porte sa **source, sa date et son niveau de certitude**. Les hypothèses sont visibles et jamais présentées comme des faits.
- **Journal de décision** : plafond choisi, hypothèses, résultat, post-mortem.
- L'outil doit **dire quand il ne sait pas** : refuser de recommander un plafond tant que le prix/m² n'est pas validé par deux sources, ou afficher une confiance faible.
- Lire les documents en entier avant toute conclusion juridique et signaler ce qui n'a pas été lu.

### 3.9 Critères de réussite (point de vue Florian)
1. Chaque lundi, en moins de 5 minutes, je sais quels lots regarder, quel plafond fixer, quoi demander à qui.
2. Je ne perds plus de temps sur des lots hors de portée, par exemple le local à 56 k€ pour une MAP de 25 k€.
3. Les ordres de grandeur sont fondés sur des résultats réels, pas sur des coefficients d'intuition.
4. Je sais à tout moment combien de cash est libre et quelle audience compte vraiment.
5. Après chaque enchère, j'ai un post-mortem et le modèle s'est amélioré.

## 4. Règles métier et juridiques (enchères judiciaires)

Issues des cahiers des conditions de vente lus (Nantes, Angers, La Roche-sur-Yon) et de la conversation.
- **Postulation territoriale** : on enchérit uniquement par un avocat inscrit au barreau du tribunal. Un avocat de Nantes ne peut pas enchérir en Vendée ou à Angers, etc.
- **Caution** : 10 % de la mise à prix, **minimum 3 000 €**, par **chèque de banque** à l'ordre du séquestre désigné ou du liquidateur, ou **caution bancaire irrévocable**. Le **virement CARPA ne convient pas** (Cour de cassation, d'après Me Guillotin). Remise à l'avocat contre récépissé. Rendue si on n'est pas déclaré acquéreur.
- **Baisse d'un quart** de la MAP à défaut d'enchère, parfois immédiate à la même audience.
- **Frais taxés et émoluments** de l'avocat poursuivant : en plus du prix, majorés de TVA, **sous 1 mois**.
- **Prix** : consignation **sous 2 mois**. **Droits de mutation** : justificatif sous 2 mois. **Publication du titre** au service de publicité foncière sous 2 mois, à la charge de l'acquéreur.
- **TVA** : si l'immeuble est soumis à la TVA, le prix est HT et l'acquéreur paie la TVA en plus. À demander avant l'audience.
- **Charges de copropriété** : dues à compter du jugement d'adjudication. **Taxe foncière** remboursée au prorata. **Assurance** obligatoire dès l'adjudication, pour un montant au moins égal au prix.
- **Achat "en l'état"**, sans recours. Occupation, urbanisme, servitudes aux risques de l'acquéreur.
- **Surenchère** du dixième possible sous 10 jours (règle générale).
- **Folle enchère** si l'acquéreur ne paie pas dans les délais : perte de la caution et paiement de la différence.
- **Le jugement d'adjudication est un titre d'expulsion** (exécutable après consignation du prix et paiement des frais). **Trêve hivernale du 1er novembre au 31 mars.** Délais du juge de l'exécution.
- **Vente en liquidation judiciaire** (art. L642-18 Code de commerce) : l'adjudication et le paiement purgent les hypothèques et privilèges. Le prix est réparti aux créanciers. Les arriérés de charges de la copropriété dus par le saisi sont payés sur le prix, pas par l'acquéreur.
- **Droits réduits** (art. 1115 CGI, environ 0,715 %) : acquéreur marchand de biens, engagement de revente sous 5 ans. L'objet social de la SASU doit le prévoir. Sinon droits de droit commun d'environ 5,8 %. **À valider avec le comptable.**
- **Le commissaire de justice** qui fait le PV de description et les visites est désigné à la demande de l'avocat poursuivant. L'acquéreur ne le choisit pas avant l'audience. Il est utile après l'adjudication (serrurier, constat, évacuation, expulsion).

## 5. Modèle de calcul actuel (classeur Excel existant)

Fichier : `pipeline_encheres_Q4_2026.xlsx` (onglets Synthèse, Biens, Scoring, Coûts Richebourg, Scénario Pineaux, Calendrier, Sources et documents, Calibrage, Paramètres). À conserver comme référence de logique, pas comme contrainte de format.

**Paramètres** : cash 50 000 € ; financement complémentaire 0 ; réserve d'aléas 5 000 € ; frais taxés et émoluments = 2 500 € fixe + 10 % du prix [HYPOTHÈSE, ordre de grandeur 4 à 8 k€ au total] ; droits = 0,715 % (régime marchand de biens) ou 5,81 % (droit commun) ; commission d'agence à la revente 5 % ; multiple cible ferme x2,0 et confort x3,0 ; caution minimale 3 000 €, 10 % de la MAP.

**Formules** :
- Revente prudente = surface x prix/m² x (1 - décote d'état et de sortie rapide).
- Coût brut = prix x (1 + % frais + droits) + frais fixes.
- Multiple = revente prudente / coût brut.
- Plafond multiple = (revente / multiple cible - frais fixes) / (1 + % frais + droits).
- Plafond cash = (cash + financement - réserve travaux et aléas - frais fixes) / (1 + % frais + droits).
- Plafond ferme = min(plafond multiple, plafond cash). Plafond effectif = plafond décidé par Florian s'il existe, sinon plafond ferme.
- Marge nette = revente nette d'agence - coût brut - travaux et aléas.
- Prix adjugé probable = MAP x coefficient (jugement). **À remplacer par la médiane observée dans la base de résultats.**
- Score /100 : multiple 30 %, capacité cash 20 %, liquidité de sortie 15 %, risque juridique et occupation 15 %, qualité de l'information 10 %, délai avant audience 10 %. Seuils : 60 = Priorité 1, 45 = À creuser.

## 6. Détail des coûts d'une acquisition (exemple : local Richebourg)

Postes et échéances, avec montants calculés pour un achat à 18 750 € (après baisse d'un quart) ou à 30 000 €. [HYPOTHÈSE sauf mention.]

| Poste | Nature | Échéance | 18 750 € | 30 000 € |
|---|---|---|---|---|
| Prix | | 2 mois | 18 750 | 30 000 |
| Caution (imputée sur le prix, non additionnée) | CERTAIN | avant l'audience | 3 000 | 3 000 |
| Frais taxés et émoluments | cahier + hyp. | 1 mois | 4 375 | 5 500 |
| Droits (0,715 %) | cahier + hyp. | 2 mois | 134 | 215 |
| Contribution de sécurité immobilière (0,1 %) | hyp. | 2 mois | 19 | 30 |
| **Coût brut** | | | **23 278** | **35 745** |
| Honoraires de l'avocat qui enchérit | hyp. | après la vente | 2 000 | 2 000 |
| Publication du titre et formalités | cahier + hyp. | 2 mois | 450 | 450 |
| **Cash à sortir à l'achat** | | | **25 728** | **38 195** |
| Serrurier et évacuation du mobilier | hyp. | après la vente | 2 000 | 2 000 |
| Diagnostics pour la revente | hyp. | avant revente | 400 | 400 |
| Portage 4 mois (charges 730 €/an, taxe foncière 1 500 €/an, assurance 600 €/an) | hyp. | jusqu'à la revente | 943 | 943 |
| Travaux (façade et remise en état) | hyp. | avant revente | 15 000 | 15 000 |
| **Total avant revente** | | | **44 071** | **56 538** |
| Revente prudente (43,76 m² x 2 300 € x 0,70) | hyp. | | 70 454 | 70 454 |
| Revente nette (commission 5 %) | | | 66 931 | 66 931 |
| **Marge avant impôt** | | | **22 860** | **10 393** |
| Multiple revente / coût brut | | | x3,03 | x1,97 |
| Droits en plus si régime marchand de biens refusé | | | 955 | 1 529 |
| TVA en plus si la vente y est soumise (20 % du prix) | | | 3 750 | 6 000 |

À prix réel de 56 000 € : coût brut 64 556, total 85 349, marge -18 418, multiple x1,09.

**Honoraires de Me Guillotin (avocate de Florian à Nantes)** si l'enchère n'est pas retenue : **180 € TTC** selon les notes de Florian (conversation d'il y a quelques mois), **240 €** annoncés au téléphone le 01/10. À faire confirmer par écrit, ainsi que le forfait en cas d'adjudication.

## 7. Assurances, obligations, structure

À valider avec un courtier et le comptable (connaissance générale, pas un avis).
- **Propriétaire non occupant (PNO) / multirisque immeuble vacant** : obligatoire dès l'adjudication (cahier, et rappel du syndic aux copropriétaires bailleurs). Attention : beaucoup d'assureurs refusent les locaux vacants ou abandonnés. Demander un devis précisant "local vacant". Date d'effet = jour du jugement.
- **Multirisque habitation** : concerne l'occupant (Florian s'il habite, ou le locataire), pas un bien vide en revente.
- **Dommage-ouvrage (DO)** : obligatoire avant l'ouverture du chantier si les travaux relèvent de la garantie décennale (gros œuvre, structure, étanchéité, équipements indissociables). Pas pour la peinture ou un nettoyage.
- **CNR (constructeur non réalisateur)** : obligatoire si Florian revend un bien après avoir fait faire des travaux de type décennale (il est réputé constructeur 10 ans). Souscrit en même temps que la DO.
- **RC professionnelle** : non obligatoire pour un achat-revente simple (profession non réglementée). Recommandée si Florian réalise des travaux lui-même, conseille des tiers ou monte des opérations avec des partenaires.
- **Façon la plus simple de rester en dehors de DO et CNR** : ne faire que des travaux légers. Sur les maisons à 15 k€ de travaux (Contigné, Sautron), vérifier si la structure est concernée avant de se lancer.
- **Structure** : démarrer dans la SASU (cash déjà là, délai), après avoir vérifié que **l'objet social permet l'achat-revente** (condition des droits à 0,715 %). Créer une **filiale dédiée à 100 %** dès la 2e opération ou l'entrée d'un partenaire : isole le risque, bilan de holding plus propre pour une banque, sortie possible par vente des titres. Contreparties : une structure de plus à tenir, financement par apport ou compte courant, régime mère-fille et intégration fiscale à cadrer avec le comptable.

## 8. Procédure de caution (chèque de banque)

- Le banquier de Florian est à 1 heure de route. Un chèque de banque est un papier : il ne peut pas être envoyé par email. Plan retenu : le banquier fait éditer le chèque à l'**agence Crédit Mutuel du 57 boulevard Boulay-Paty, 44100 Nantes**, tiré sur le compte de la SASU, montant 3 000 €.
- **Ordre du chèque** : à confirmer par Me Guillotin (le mail de l'avocate dit "l'ordre du Séquestre" sans nom). Le liquidateur indiqué dans le cahier Richebourg est la SCP Delaere. Ne jamais émettre le chèque sans le libellé exact.
- Email au banquier préparé, avec le nom du bénéficiaire à compléter.

## 9. Lots suivis (état au 02/10/2026)

| Réf | Bien | MAP | Tribunal / audience | Statut |
|---|---|---|---|---|
| 109826 | Local commercial RDC + 3 caves, 18 rue de Richebourg, Nantes, 43,76 m² | 25 000 € | TJ Nantes, 02/10 10h | **Adjugé 56 000 € [À VÉRIFIER]. Non gagné par Florian.** |
| 109523 | Studio 19,77 m², 21 rue Lucien Bagrin, Nantes (résidence étudiante Zola) | 20 000 € | TJ Nantes, 02/10 10h | Résultat inconnu. Score 34, hors jeu. |
| 109955 | Maison 130 m², 47 rue de l'Océan, Les Pineaux (85) | 20 000 € | TJ La Roche-sur-Yon, **12/10 09h45** | **À creuser, score 59**, plafond d'environ 33 k€ sur le cash actuel. Cash intact depuis Richebourg. |
| 109957 | Maison + petit logement à rénover, Contigné (49) | 15 000 € | TJ Angers, **12/10 10h** | Score 45. Avocat d'Angers à recruter. |
| 109959 | Maison en travaux, 17 rue de la Chézine, Sautron (44) | 20 000 € | TJ Nantes, **16/10 10h** | Score 48, hors de portée probable (plafond cash environ 25 k€, valeur bien supérieure). |
| 110143 | Studio 27,68 m², résidence West Campus, La Roche-sur-Yon | 20 000 € | TJ La Roche-sur-Yon, **02/11 09h45**, visite 06/10 14h-16h | Score 44, veille. Bail commercial CAPWEST à reprendre. |

Détails clés par lot :
- **Pineaux** : maison libre, années 1900, 4 chambres, terrain 1 113 m², 2 dépendances et garages, chauffage électrique, fibrociment dans une dépendance, DPE absent. Créancier Crédit Agricole (dette 133 117 €). Prix m² de référence 1 718 € (MeilleursAgents), décote 37 %, travaux 5 000 €. Idée de Florian : détacher le terrain par géomètre et le vendre séparément (zone constructible à vérifier par certificat d'urbanisme annexé au cahier et mairie) [HYPOTHÈSE, probabilité 50 % dans le modèle]. Poursuivant : avocat de La Roche-sur-Yon (Me Cufi cité pour le certificat d'urbanisme). Visite passée le 10/09, PV d'huissier disponible.
- **Contigné** : saisi occupant avec 2 jeunes enfants, trêve hivernale, expulsion longue, servitudes privées non documentées, électricité en anomalie. Créance CCM Lion d'Angers 97,7 k€, bien acquis 100 k€ en 2022 : l'adjudication sera probablement bien au-dessus de la MAP. Poursuivant : ACR Avocats (Me Etienne de Mascureau, 4 bd Bessonneau, Angers). Visite non communiquée.
- **Sautron** : maison récente 111,74 m², second œuvre à faire, terrain 257 m², radon niveau 3. Poursuivants particuliers (créance 24,5 k€) : risque de paiement ou vente amiable avant l'audience. Poursuivant : Me Dubreil. Visite le 01/10 14h (résultat de la visite inconnu).
- **West Campus** : bail commercial de résidence étudiante, sortie vers investisseur LMNP (lente), prix m² 2 200 € [HYPOTHÈSE], loyer et TVA inconnus.
- **Richebourg (pour mémoire)** : liquidation judiciaire de M. Triki Zedira, poursuite du syndicat (Me Illiaquer), recours du saisi rejeté le 29/07/2026, charges 461/10 000 (environ 730 €/an), arriérés d'environ 23,8 k€ sur le prix, local abandonné plein de mobilier (propriété du mobilier à clarifier, liquidateur d'une société voisine, Mica Male, liquidée), façade très dégradée, usage de commerce dans le RCP de 1951 (unanimité pour changer la destination ou modifier la façade).

## 10. Autres lots repérés (hors classeur)

À moins de 1h30 de Tours, instantané du 29/09 [encheres-publiques.com] :
- **TJ Le Mans, 06/10 10h30** : maison 35,5 m², Rebecca (Le Mans), **MAP 6 000 €**, libre, visite du 23/09 annulée. Avocat poursuivant : Hautemaine Avocats. Il faudrait un avocat du barreau du Mans.
- **TJ Blois, 15/10 14h** : studio 21,46 m², 31 av. Maréchal Maunoury, **MAP 26 400 €**, petite terrasse. Il faudrait un avocat du barreau de Blois (Referens a un bureau à Blois).
- **TJ Tours, 13/10 14h30** (CTM Avocats poursuivant) : Beaumont-Louestault, maison 2 chambres, MAP 55 000 € (visite 02/10 9h15-10h15) ; Morand, maison en 2 logements, MAP 70 000 €, occupée (visite 02/10 11h) ; Bléré, restaurant + maison, MAP 112 000 €, occupé (visite 02/10 14h).
- **TJ Tours, 10/11** (Cornu-Sadania-Paillot) : Monts, MAP 100 000 € ; Sainte-Catherine-de-Fierbois, MAP 80 000 €.
- **TJ Angers, 12/10 10h** : Denée, bâtiments industriels 1 226 m², MAP 50 000 € ; Contigné (voir plus haut).
- Non détaillés : maison de ville à Tours (140 k€), Channay-sur-Lathan (68 k€), Gennes-Val-de-Loire (50 k€). Ouzouer-le-Doyen (MAP 2 000 €, TJ Blois, 01/10) : visite obligatoire passée, écarté.
- Lecture : très peu de lots sous 30 k€ de MAP près de Tours, et la leçon de Richebourg incite à la prudence sur les petites MAP urbaines.

## 11. Réseau de professionnels

**Critère de Florian** : spécialistes de l'immobilier, **indépendants (cabinet individuel ou très petit)**, pas de cabinets à plusieurs associés (trop cher). Aucun cabinet ne publie ses tarifs d'enchères : demander un forfait écrit.

**Avocats**
- **Nantes** : **Me Guillotin** (avocate de Florian). Poursuivant Richebourg : Me Alexandra Illiaquer (5 rue Dobrée, 44100 Nantes, 02 51 84 99 70).
- **La Roche-sur-Yon** : un avocat déjà disponible (nom à renseigner). Vérifier l'inscription au barreau de La Roche-sur-Yon, pas seulement des Sables-d'Olonne.
- **Angers** (candidats) : Me Cécile Mérillon-Gourgues (cabinet individuel, spécialiste en droit immobilier, 37 bd Saint-Michel, 06 63 87 91 59 ou 09 51 62 41 89, contact@cmgavocat.fr) ; Me Aurélien Goguet, Astrolabe Avocats (1 av. Jeanne d'Arc, 02 41 34 16 50, cabinet@astrolabe-avocats.fr ; sûretés et mesures d'exécution ; 2 co-gérants). Non vérifiés : Oratio, Antarius, Défense & Conseil.
- **Tours** (candidats) : Me Éric Le Coz (cabinet individuel, Montlouis-sur-Loire, 02 47 45 04 66, info@lecoz-avocat.fr, généraliste) ; Me Karine Jolly (cabinet individuel, droit immobilier, 38 rue du Docteur Giraudet, 07 61 54 59 39, contact@jolly-avocat.fr, enchères à confirmer) ; Me Corinne Baylac, Envergure Avocats (3 avocats, 02 47 20 24 42, c.baylac@envergure-avocats.fr, immobilier et voies d'exécution, solution de repli).
- **Écartés par Florian** (cabinets à plusieurs associés ou jugés non adaptés) : Proxim Avocats, Kapia Avocats, Avoconseil, ACR, Lexcap (Angers) ; Cornu-Sadania-Paillot, Referens, Saint-Cricq & Associés, CTM Avocats, Walter & Garance, Arcole (Tours). Rabilier écartée (pratique non immobilière).
- **Blois, Le Mans** : à chercher selon les lots visés.

**Commissaires de justice**
- **Tours** : Étude SKS (100 rue Marceau, 02 47 05 66 34, sks@huissier-tours.com), seul commissaire listé sur les ventes d'Indre-et-Loire ; Me Stéphane Brudy, seul commissaire, indépendant (14 rue Galpin-Thiou, 02 47 20 90 30, 06 87 39 47 06, brudycdj@gmail.com).
- **Angers** : SCP Cojusticia (90 b route du Hutreau, Les Ponts-de-Cé, 02 41 44 65 75) ; Selarl Tessier Penhoat (29 rue Louis Gain, 02 41 87 47 53) ; HDJ49 (Baugé-en-Anjou, contact non trouvé).
- **Nantes** : SARL HNJURIS (8 rue des Renards), auteur du PV de description Richebourg.

## 12. Actions ouvertes, dans l'ordre

1. **Vérifier le résultat de Richebourg (56 000 €) et du studio Zola** et les saisir dans la base de résultats (premiers points de calibrage).
2. **Pineaux, 12/10 09h45** : confirmer plafond (environ 33 k€ sur cash, à revalider avec le prix réel du marché et le certificat d'urbanisme), avocat inscrit à La Roche-sur-Yon, chèque de banque de 3 000 € au bon ordre, assurance prête, banquier prévenu.
3. **Contigné, 12/10** : décider seulement si un avocat d'Angers est mandaté (expulsion avec enfants, trêve hivernale à partir du 1er novembre). Ne pas gagner deux biens : le cash ne couvre qu'un achat.
4. **West Campus, visite 06/10 14h-16h** : obtenir le bail CAPWEST (loyer HT) et deux estimations LMNP.
5. **Sautron, 16/10** : décider après la visite du 01/10 et la lecture du cahier. Demander permis et DAACT à la mairie.
6. **Tours / Blois / Le Mans** : recruter un avocat du barreau concerné avant d'investir du temps. Visites du 02/10 à Tours déjà passées pour les lots du 13/10.
7. **Comptable** : objet social de la SASU (achat-revente), régime 1115 CGI, TVA sur marge.
8. **Courtier** : devis PNO pour local ou maison vacante, avec date d'effet au jour du jugement.
9. **Questions standard à poser à chaque avocat poursuivant** : état des frais préalables, TVA, occupation, mobilier, bail éventuel, charges et arriérés, certificat d'urbanisme.

## 13. Pièges et erreurs déjà rencontrés (à ne pas refaire)

- Confondre 452/1000 et 452/10 000 des tantièmes (Richebourg : vrai 461/10 000, environ 730 €/an).
- Croire que Sautron passait le 02/10 : c'est le **16/10**.
- Présenter les "tentatives infructueuses" comme un signal favorable : inférence sans base, retirée.
- Utiliser un coefficient "prix adjugé / MAP" d'intuition : Richebourg l'a démenti (3,0 prédit, 2,24 réel).
- Compter dans les frais seulement les frais taxés : oublier honoraires de l'avocat qui enchérit, publication, évacuation, portage, diagnostics, TVA possible, assurance dès le jugement.
- Proposer un virement CARPA pour la caution : refusé par la jurisprudence citée par l'avocate. Chèque de banque ou caution bancaire irrévocable.
- Cabinets d'avocats trop gros ou trop chers : privilégier les indépendants.
- Contourner un site bloqué : interdit. Dire que la source est inaccessible.
- Ne pas supposer qu'un site d'avocat affiche ses ventes ou ses tarifs : vérifier.

## 14. Préférences de travail de Florian

- Français, concis, sans longs développements. **Pas de tiret cadratin** (utiliser le trait d'union ou des phrases courtes).
- Emails courts, rassurants, formules du type "mon avocate". Il veut que les emails soient prêts à envoyer.
- Aime les chiffres, les KPIs, les tableaux de comparaison, et des réponses franches avec les limites. Il pose des questions de vérification ("tu es sûr ?") : toujours distinguer certain et hypothèse.
- Il veut aller vite et professionnaliser, mais ne veut pas "faire peur" aux interlocuteurs.

## 15. Sources et fichiers

- Classeur : `pipeline_encheres_Q4_2026.xlsx` (dernier état, avec l'onglet Coûts Richebourg).
- Pages de ventes : encheres-publiques.com (événements Tours 13/10 et 10/11, Angers 12/10, lots Beaumont-Louestault, Morand, Bléré, Le Mans, Blois, Ouzouer-le-Doyen), licitor.com, vench.fr, informateurjudiciaire.fr, avocats-larochesuryon.com (Pineaux, West Campus).
- Pages d'avocats : cmgavocat.fr, astrolabe-avocats.fr (barreau-angers.org), lecoz-avocat.fr, jolly-avocat.fr, envergure-avocats.fr, proxim-avocats.com, kapia-avocats.com, avoconseil.com, cornu-sadania.fr, referens-avocats.fr, saint-cricq-avocats.com.
- Commissaires : cojusticia.fr, tessier-constat-angers.com, sks-huissiers37.fr, scpbrudy-commissaire.fr.
- Documents lus (dossier Richebourg) : cahier des conditions de vente du 12/06/2026, PV de description du 03/06/2026 (HNJURIS), diagnostics, dires (jugement du tribunal de commerce du 29/07/2026, PV d'AG du 10/06/2026), RCP du 31/08/1951 et modificatifs.
- Données de marché utilisées : MeilleursAgents (09/2026), DVF (médiane locaux 3 194 €/m² à Nantes), annonces (petits locaux Nantes 2 060 à 5 000 €/m²), adjudications Nantes antérieures citées 2 920 à 4 400 €/m². **À rapprocher des 1 280 €/m² du résultat Richebourg** : cette décote d'environ 40 à 60 % par rapport aux comparables est un indicateur de calibrage important.
