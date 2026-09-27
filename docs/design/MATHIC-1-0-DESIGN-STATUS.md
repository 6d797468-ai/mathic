# MATHIC 1.0 — Matrice de statut de design

**Référence** : mandat §22 · **Date** : 2026-09-23 · **Statut de ce document** : DESIGN (à valider — ce document reflète l'état POST-BRIEF, post-contrats A1–A16, AVANT validation architecte).

**Rappels d'usage (§22 mandate) :**
- `Implemented ≠ Proven` · `Tests passants ≠ Gameplay validé` · `Contract ≠ Design validé` · `Prototype ≠ Produit`.
- Un élément statut "Validated" ici = **décision de DESIGN ferme** (à confirmer en revue), pas une preuve de gameplay.

---

## 1. Noyau & règles

| Élément | Statut | Note |
|---|---|---|
| Opérateurs `+ − × ÷` exacts, `/` entier, `b≠0` | **Validated** | hérité du laboratoire, prouvé G1/V5 – à ré-attester sur contrat A1 en revue |
| Bornes entières `[−1024, +4096]` défaut | **Validated (design)** | valeurs défaut congelables ; une re-limite = décision niveau |
| Anti-flottant/anti-`0.1+0.2`, déterministe | **Validated** | invariant non négociable |
| Sérialisation canonique + replay (A1 §7bis + revue B0/C-3) | **Validated (design)** | positions des 3 cellules témoignées dans la trace (ancrage rejouable à l'identique) |
| Divisions non exactes/négatives → `null` (rejet) | **Validated** | sémantique V5 conservée (corr. K-0 : texte contrat ré-aligné sur le lab) |
| Formule longueur fixe `a op b` (D-F1, pas de parenthèses) | **Proposed** | décision de design assumée, opposable ; variante arborescente = EXP-3 |

---

## 2. Plateau & action

| Élément | Statut | Note |
|---|---|---|
| Board rectangle 4×4…6×6, cellules typées | **Validated (design)** | A2 |
| Operators = tuiles sur le board (D-B1 / H-B1) — PAS palette illimitée | **EXPERIMENTAL** | **hypothèse de gameplay lourde** (position+ressource vs pur-choix-math) — preuve = slice B1 (revue B0 §2, S8) ; variante palette = EXP-2 conservée |
| Consommation des opérateurs (H-3→1) | **EXPERIMENTAL** | crée rareté → décision, mais risque frustration (revue B0 §4) — mesure B1 |
| Pas de regénération RNG en partie (D-B2) | **Validated (design)** | déterminisme strict = invariant ; la disponibilité des ressources est certifiée par A11 |
| Pas de contrainte de voisinage V1 (D-B3) | **Proposed** | voisinage = EXP-5 |
| Sélection n'altère pas l'état (D-B4/D1) | **Validated (design)** | seule `submit` consomme |
| Réservé/next-preview | **Experimental** | hors core, EXP reservzone |

## 3. Transformation / état

| Élément | Statut | Note |
|---|---|---|
| `state_before + action = state_after`, pure & atomique | **Validated** | invariant contractuel |
| Ancrage du résultat sur l'opérande 1 (D-T1 / H-AN) | **EXPERIMENTAL** | prévisibilité vs placement libre (revue B0 §3 cas A–E) — preuve B1 ; variante placement libre = EXP-4 |
| Consommation 3→1 (D-T2 / H-3→1) | **EXPERIMENTAL** | étudiée (revue B0 §3 : créé de la décision sur cas B/E — non prouvée) ; preuve B1 |
| Dédup solver par paire de CELLULES (C-3) | **Validated (design)** | ancrage conservé ; jamais de dédup par valeur seule (revue B0 §1, annexe 1) |
| `undo` non-transformatoire (méta-op) | **Validated (design)** | A4 §6 ; recalcul chaîne déterministe |

## 4. Chaîne / Combo / Score / Objectifs

| Élément | Statut | Note |
|---|---|---|
| Chaîne = dépendance de résultat, calcul pur | **Proposed** | A5 §3, recalculable depuis trace |
| Rejet ≠ coupure de chaîne (D-C1) | **Proposed** | opposable |
| Combo — taxonomie de 5 triggers math | **Proposed (taxonomie)** | réduisible après mesure (revue B0 §6) ; jamais figée |
| `comboThreshold = 5` (seuil, paliers) | **EXPERIMENTAL** | **N ∈ {3,4,5,6} à trancher par simulation+playtest — JAMAIS un invariant** (C-1) ; stepMultiplier/maxComboMultiplier pareil |
| Exclusion des cycles triviaux (anti-farm) | **Proposed** | A6 §6 |
| Score « composants × coefficients » data-driven | **Validated (design)** | impératif équilibrage |
| Formulaire score additive vs multiplicative | **Experimental** | décision différée jusqu'à A12/humain |
| `base` toujours actif (`c_base ≥ 1`) | **Proposed** | A7 |
| Objectif target + maxMoves + allowedOperators | **Validated (design)** | cœur V1 |
| Objectives minScore/minChain/minCombo/multi | **Experimental** | activés seulement si certifiés (borne solver) |
| Special operators / operator rules (×=DOUBLE) | **Deferred** | extension future (BRIEF §10) |
| `blocked ≠ failed` (D-O1) | **Proposed** | opposable |

## 5. Contenu & solver

| Élément | Statut | Note |
|---|---|---|
| Niveau = objet pur versionné (`version`+`ruleVersion`) | **Validated (design)** | A9 |
| Certification = seule source du statut de production | **Validated (design)** | A11 |
| Re-certification systématique à chaque changement de version | **Validated (design)** | A9 §4/A11 §3 |
| Solver exact/borné, cache, « même sémantique que moteur » | **Validated (design)** | A10 (hérité V5, à étendre) |
| BFS budgeté + DP enveloppe | **Proposed** | A10 §3 (méthode), vérif en phase impl |
| Difficulté = 8 dims mesurées, pondération calibrée | **Proposed/Experimental** | D-D2 : poids jamais définitifs |
| Difficulté — pièges (dead ends, couloirs, bruit) | **Proposed** | A12 §3 |

## 6. Produit

| Élément | Statut | Note |
|---|---|---|
| Progression = mondes→étoiles→déblocages ; pas d'économie | **Validated (design)** | A13 |
| Étoiles 2/3 adossées à l'enveloppe solver | **Proposed** | A13 §2 |
| Maîtrise nuit à l'aide, jamais au verrouillage | **Proposed** | A13 §3 |
| Momo = coach offline, jamais autorité, faits solver traçables | **Validated (design)** | A14 |
| Pas de LLM en 1.0 | **Proposed/Deferred** | EXP zone ; si nécessaire → expérimental strict |
| Persistance locale, versionnée, offline, corruption détectée | **Validated (design)** | A15 |
| Checkpoint = trace (replay) plutôt que snapshot | **Proposed** | A15 §4 |
| Télémétrie local-first, opt-in, minimum data | **Validated (design)** | A16 |
| Télémétrie → envoi réseau en 1.0 | **Rejected (1.0)** | extension future, jamais requis |

## 7. État des preuves (honnêteté §22 mandate)

| Acquis laboratoire | Statut |
|---|---|
| Kernel exact + oprel (G1, tests 31/31 racine) | **Proven** (lab) |
| Solver BFS budgeté (lab B, 17/17 lab) | **Proven** (lab, domaine B) — à ré-appliquer au domaine formula |
| `validateSpec` fail-fast + replay (lab) | **Proven** (lab) |
| Métriques G0 (branching, decision, …) | **Proven** (lab) |
| Gameplay MATHIC 1.0 (formula construction, chain, combo, score, objectives) | **Proposed** — AUCUNE preuve de gameplay encore (ce n'est pas le B du lab) |
| Slice 20 niveaux | **Proposed** — à créer |
| Test décisif §19 (5 phrases) | **Deferred** — dépend du slice joué |
| K12 (téléphone réel) | **Proposed** — appareil attendu (harnais prêt) ⇒ voir status V5 |

---

**NOTE PHASE B (gate B0)** : la revue croisée (`MATHIC-1-0-CROSS-CONTRACT-REVIEW.md`) a trouvé et corrigé 3 défauts — **K-0** (sémantique `−` du kernel, ré-alignée sur le lab), **C-3** (dédup solver par valeur → par cellules, ancrage conservé), **C-2** (double source `availableOperations` → dérivation unique), résolu **1** ambiguïté (**C-1** combo : règle monotone + `comboThreshold` configurable, EXP) et ajouté **1** garde (**C-7** Momo fail-soft). Verdict : **B0 = PROVEN (cohérence documentaire) avec réserve** — les hypothèses EXP ci-dessus ne sont PAS validées par ce gate ; leur preuve est **B1 (slice jouable + humain)**, seul juge des H-B1 / H-3→1 / H-AN et du seuil combo.

**Zones décisives à trancher en validation architecturale** (liste des opposables) :
D-F1 (longueur fixe) · **H-B1 (operators-tuiles — EXPÉRIMENTAL)** · D-B3 (pas de voisinage) · **H-AN (ancrage — EXPÉRIMENTAL)** · **H-3→1 (consommation — EXPÉRIMENTAL)** · D-C1 (rejet≠coupure) · D-O1 (blocked≠failed) · D-S1 (additif vs multiplicatif) · pondérations difficulté · **`comboThreshold` N ∈ {3,4,5,6} (EXPÉRIMENTAL)** · statut « operators = tuiles » vs palette · stepMultiplier/maxComboMultiplier · équilibrage relatif chain/efficience (S9).