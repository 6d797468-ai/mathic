# MATHIC-BRAND-GAMEPLAY-PRINCIPLES

Document transversal de Mathic 1.0 — « chaque décision produit importante laisse une trace dans l'architecture et dans le code, uniquement là où elle a une justification fonctionnelle ».

Status : **DÉCISION PRODUIT ACTIVE (transverse)** · Verdict CG : CONTINUE · Aucune modification du noyau mathématique requise.

---

## 1. Brand Identity

Mathic est un jeu de réflexion mathématique. Son identité ne repose pas sur une esthétique, mais sur une promesse de gameplay vérifiable : à partir de nombres simples et d'opérations simples, le joueur construit plusieurs chemins, plusieurs résultats et plusieurs stratégies.

## 2. Name

Produit : **Mathic** (identité produit officielle depuis ce document).
Version cible : **Mathic 1.0**. Les prochaines étapes sont des briques internes de Mathic 1.0 — plus de V6, V7, V8.

## 3. Tagline

> **Les nombres sont magiques.**

Signature officielle. Elle est démontrée par le jeu, elle n'est pas récitée : elle apparaît au lancement du produit (header de l'écran de jeu) et son sens est rendu vérifiable par l'inventaire Number Magic (section 4 + annexe B).

## 4. Number Magic

**MATHIC-PRINCIPLE-001 — Number Magic** : Mathic doit révéler que des nombres simples peuvent produire des possibilités complexes lorsqu'ils sont combinés par les décisions du joueur.

Pipeline de conception (chaîne « possibilité → choix → conséquence ») :

```
Nombr  → Opération → Combinaison → État → Choix → Conséquence → Stratégie
```

Le principe est **émergent** (propriété du gameplay), jamais une règle mathématique : le Kernel reste mathématiquement pur (`+ − × ÷`, évaluation exacte, transformation, EXACTNESS). « Magie » n'est jamais dans le moteur.

## 5. Gameplay interpretation

Un niveau intéressant n'est pas `SOLVABLE = TRUE` seulement ; il démontre progressivement la promesse :

1. **Découverte** — le joueur découvre un premier calcul (`8 + 4 = 12`).
2. **Possibilité** — même objectif, plusieurs voies (`12 × 4`, `24 × 2`, ...) : « plusieurs chemins existent ».
3. **Conséquence** — des chemins mathématiquement corrects produisent des états et des scores différents : « les chemins ne sont pas équivalents ».

Anti-piège : **ne pas** imposer « chaque niveau doit avoir 5 solutions ». Un niveau avec solution unique (ex. N15) reste un excellent niveau : la magie vient de la **pertinence des choix**, pas du nombre brut de solutions.

## 6. Level Design implications

Indicateur interne de design (JAMAIS affiché au joueur) :

```
NM = f(R, D, C, S)
  R = diversité des routes
  D = diversité des décisions
  C = diversité des conséquences
  S = surprise stratégique
```

Extraits vérifiés (annexe B, via Solver + Engine + Replay) :

| Profil | Définition | Niveaux 2026-09-24 |
|---|---|---|
| `direct` | une seule route optimale, score unique, gagné au coup 1 | N15 |
| `single` | une seule route optimale (souvent profonde, avec chaîne) | N9, N20, N23, N31, N33, N36 |
| `choice` | plusieurs routes, même score (« chemins équivalents ») | N1–N6, N8, N11, N12, N17–N19, N25, N30 |
| `consequence` | plusieurs routes **et** scores distincts (« chemins non équivalents ») | N7, N10, N13, N14, N16, N21, N22, N24, N26–N29, N32, N34, N35 |

La diversité est **décroissante dans les mondes de synthèse** : les « single » (depth 3, tours) sont réservés à la fin (W6), conformément à la certification CG.

## 7. UX implications

Hiérarchie : `BOARD → ACTION → TRANSFORMATION → CONSEQUENCE → DISCOVERY → FEEDBACK`.

- Le plateau et la transformation sont au centre ; le jeu ne noie pas le joueur.
- Les animations montrent la conséquence du raisonnement (résultat issu de la formule), pas des effets décoratifs artificiels.
- Paliers de manifestation : découverte silencieuse → possibilité (plusieurs chemins) → conséquence (valeurs de score différentes).

## 8. Momo implications

Momo observe l'état, interroge le Solver, identifie les routes, applique une politique pédagogique, puis explique — il **n'invente jamais une solution**.

1. Encourager la découverte : « Il y a plusieurs façons d'atteindre l'objectif. »
2. Toucher la conséquence : « Regarde ce que deviendra le résultat après ton prochain coup. »
3. Aide explicite seulement en dernier recours.

## 9. Score implications

Le score actuel reste `Score = Base + Chain + OBJECTIVE_BONUS` (B2, fondation). L'architecture devra permettre d'ajouter plus tard `Efficiency` / `StrategicBonus` pour récompenser préparation, réutilisation, route non triviale, optimisation — **sans changer le moteur tant qu'il répond au besoin**.

## 10. Anti-patterns

- ❌ Réécrire le Kernel parce que « la philosophie » l'exige.
- ❌ Mettre « magie » dans le moteur ou dans les règles de calcul.
- ❌ Forcer 5 solutions par niveau.
- ❌ Afficher la métrique NM au joueur.
- ❌ Faire réciter le slogan par le jeu / par Momo.
- ❌ Difficulté par des nombres arbitrairement énormes (MATHIC-008).
- ❌ « Corriger » le libellé cosmétique interne « B1.5 » sans raison fonctionnelle.

## 11. Examples

- **Objectif 48** : `24 × 2`, `50 − 2`, `12 × 4`, `96 ÷ 2` — Mathic ne dit pas « voici la bonne réponse », il montre un espace de possibilités.
- **N15 (unique)** : une seule route de précision — la magie est la justesse du raisonnement.
- **N20 / N36 (flagships certifiés)** : préparation + chaîne ; la route optimale n'est pas un simple calcul direct.
- **N17** : `routes 4, finals 11` — plusieurs premiers coups gagnants, plusieurs valeurs terminales.

## 12. Certification criteria

Le principe est **vérifiable automatiquement** :

1. Le Kernel reste pur : aucune référence au concept « magique » dans `engine.mjs`, `solver.mjs`, `replay.mjs` (test `nm-principles`).
2. `Solver = Engine = Replay` sur chaque chemin compté.
3. L'inventaire NM (annexe B) est recalculé à partir du Kernel et comparé aux valeurs enregistrées — toute modification de gameplay qui changerait les profils est détectée.
4. La tagline est présente dans l'écran de lancement réel (`index.html` → `dist-b1`).

---

## Annexe A — Culture technique (règles permanentes)

- **MATHIC-001** — Mathématiques exactes, prévisibles.
- **MATHIC-002** — Une action = une intention.
- **MATHIC-003** — INVALID = NO STATE CHANGE.
- **MATHIC-004** — PREVIEW ≠ STATE.
- **MATHIC-005** — Solver = Engine = Replay.
- **MATHIC-006** — Board = héros.
- **MATHIC-007** — Plusieurs solutions doivent avoir des conséquences pertinentes lorsque le niveau le demande.
- **MATHIC-008** — La difficulté vient des décisions, pas de nombres arbitrairement énormes.
- **MATHIC-009** — Momo explique le système, il ne remplace pas le système.
- **MATHIC-010** — Les nombres sont magiques.

## Annexe B — Inventaire Number Magic vérifié (2026-09-24, budget Solver 40 000)

Valeurs issues de `src/b1/design.mjs` (`nmFacts`, `nmStage`) — non affichées au joueur, servent de référence de certification.

| Niveau | finals | coups légaux (1er) | routes min | runs | direct | scores distincts | meilleur | chaîne | profil |
|---|---|---|---|---|---|---|---|---|---|
| N1 | 1 | 2 | 2 | 2 | oui | 1 | 10 | 0 | choice |
| N2 | 5 | 12 | 4 | 4 | oui | 1 | 10 | 0 | choice |
| N3 | 5 | 12 | 4 | 4 | oui | 1 | 12 | 0 | choice |
| N4 | 6 | 12 | 2 | 4 | non | 1 | 19 | 4 | choice |
| N5 | 10 | 24 | 2 | 4 | non | 1 | 16 | 4 | choice |
| N6 | 6 | 12 | 2 | 6 | oui | 1 | 14 | 0 | choice |
| N7 | 16 | 30 | 7 | 14 | non | 3 | 20 | 8 | consequence |
| N8 | 12 | 24 | 4 | 8 | non | 1 | 15 | 8 | choice |
| N9 | 15 | 27 | 1 | 2 | non | 1 | 15 | 2 | single |
| N10 | 16 | 30 | 4 | 6 | non | 2 | 19 | 6 | consequence |
| N11 | 17 | 30 | 2 | 12 | oui | 1 | 16 | 0 | choice |
| N12 | 17 | 30 | 2 | 29 | oui | 1 | 13 | 0 | choice |
| N13 | 20 | 50 | 2 | 11 | non | 3 | 40 | 8 | consequence |
| N14 | 14 | 26 | 1 | 8 | non | 2 | 27 | 8 | consequence |
| N15 | 19 | 31 | 1 | 1 | oui | 1 | 11 | 0 | direct |
| N16 | 27 | 52 | 3 | 42 | non | 2 | 55 | 4 | consequence |
| N17 | 11 | 24 | 4 | 4 | oui | 1 | 11 | 0 | choice |
| N18 | 12 | 24 | 2 | 4 | non | 1 | 18 | 4 | choice |
| N19 | 10 | 24 | 2 | 4 | non | 1 | 14 | 4 | choice |
| N20 | 18 | 30 | 1 | 4 | non | 1 | 20 | 4 | single |
| N21 | 17 | 40 | 4 | 8 | non | 2 | 20 | 8 | consequence |
| N22 | 18 | 30 | 3 | 10 | non | 2 | 27 | 4 | consequence |
| N23 | 26 | 50 | 1 | 2 | non | 1 | 24 | 2 | single |
| N24 | 24 | 50 | 4 | 15 | non | 3 | 29 | 8 | consequence |
| N25 | 10 | 20 | 2 | 4 | non | 1 | 16 | 4 | choice |
| N26 | 6 | 16 | 2 | 8 | non | 2 | 22 | 8 | consequence |
| N27 | 8 | 26 | 5 | 8 | non | 2 | 66 | 8 | consequence |
| N28 | 26 | 50 | 3 | 32 | non | 2 | 24 | 6 | consequence |
| N29 | 22 | 50 | 6 | 12 | non | 3 | 22 | 8 | consequence |
| N30 | 22 | 50 | 2 | 47 | oui | 1 | 22 | 0 | choice |
| N31 | 28 | 57 | 1 | 25 | non | 1 | 29 | 2 | single |
| N32 | 23 | 47 | 6 | 30 | non | 3 | 96 | 8 | consequence |
| N33 | 29 | 50 | 1 | 4 | non | 1 | 32 | 4 | single |
| N34 | 23 | 57 | 4 | 44 | non | 2 | 27 | 8 | consequence |
| N35 | 30 | 52 | 4 | 23 | non | 2 | 43 | 8 | consequence |
| N36 | 35 | 84 | 1 | 74 | non | 1 | 49 | 2 | single |

Notes : `finals` = valeurs terminales distinctes atteignables au premier coup ; `routes min` = premiers coups distincts parmi les victoires à profondeur minimale ; `runs` = victoires minimales trouvées ; `scores distincts` = scores différents entre routes minimales trouvées (la « conséquence » visible du joueur).

## Annexe C — Gouvernance des mandats (cadre permanent Kali)

Chaque mandat devra explicitement contenir :

- **PRESERVE** — ce qui ne doit pas être touché (Kernel, Solver, Replay…).
- **ADD** — ce qui doit être ajouté.
- **CHANGE** — ce qui peut être modifié.
- **DO NOT DO** — explicitement hors périmètre.
- **EVIDENCE** — ce que l'agent doit démontrer automatiquement.
- **INTEGRATION** — où la décision apparaît dans le squelette de Mathic.

Boucle de fabrication d'une décision produit : décision produit → principe d'architecture → principe gameplay → principe niveau → vérification automatique (Solver + Engine + Replay) → intégration produit. Le résultat s'inscrit ensuite dans le squelette **à l'endroit précis où il a une justification fonctionnelle**, jamais comme une refonte globale.