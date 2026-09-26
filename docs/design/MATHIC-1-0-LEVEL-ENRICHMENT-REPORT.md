# MATHIC 1.0 — Rapport de mandat : Enrichissement du catalogue (MISSION 9)

**Référence** : MISSION 9 — `LEVEL GRAMMAR + CONTENT ENRICHMENT` · Méthode : `MATHIC-1-0-LEVEL-ENRICHMENT.md`
**Décisions produit** : 5 nouveaux niveaux · désert médian comblé · MASTERY réelle (propriété Solver).
**Statut** : IMPLÉMENTÉ, TESTÉ, PROUVE.

---

## 1. Objet

Éliminer le **désert de contenu sémantique** identifié par l'audit M9 : dans les
fenêtres de progression (k=3, M8) du milieu de ladder, la Policy ne disposait
d'aucune alternative de grammaire (niveaux quasi-identiques). Et garantir une
**MASTERY réelle** (propriété certifiée par le Solver) avant le couronnement N36,
qui n'en avait que l'intention déclarée. Zéro modification du pipeline, zéro
nouveau layer IA, aucun niveau fabriqué pour satisfaire un profil : chaque niveau
ajouté est une énigme authentique qui franchit toute la certification réelle.

## 2. Livrables

| Livrable | Type | Fichier |
| --- | --- | --- |
| 5 niveaux certifiés (N37-N41) | Code (ADD) | `src/b1/levels.mjs` — LADDER : N37/N38/N39 comblent le désert, N40/N41 pinnacles MASTERY |
| Difficulté par position | Code (MOD) | `src/b1/web/intel-navigation.mjs` — `DIFFICULTY()` index = position LADDER (N37↔25, plus `id.slice(1)`) |
| Tests du catalogue élargis | Test (MOD) | `tests/b1/cg-levels.test.mjs`, `b1-5-grammar.test.mjs`, `level-design.test.mjs`, `nm-principles.test.mjs` |
| Tests de fenêtre et d'expérience | Test (MOD) | `tests/intel/window-progression.test.mjs` (W-01/W-09), `adaptive-progression.test.mjs` (AP-06), difficulté locale alignée |
| Conception + rapport | Docs (ADD) | `docs/design/MATHIC-1-0-LEVEL-ENRICHMENT.md` + `-REPORT.md` |

**PRESERVE (intouché)** : M1..M8 (kernel, save, solver, policy, orchestrator,
runtime, pont UI). Seule la **donnée** (catalogue) et la **métadonnée de
position** changent.

### Corrections effectuées en route

1. **Audit initial** : la croyance héritée « COMBINATION = N13.. » était fausse
   (elle lisait le stage clampé par monde). L'audit s'appuie sur la **propriété
   Solver exacte** + `stage.name` — signature identique à ce que mange la Policy.
   Résultat : 7 COMBINATION réels, 0 MASTERY, 19/35 fenêtres discriminantes.
2. **Conception des candidats** : aucune grille n'a été posée « au hasard » ;
   les 5 candidats ont été conçus depuis des idées pédagogiques, certifiés au
   pipeline réel, et **vérifiés non-dupliqués** (`numMultiset+opMultiset`) vs le
   catalogue. Un candidat MASTERY répliquant N14 exactement a été **rejeté**.
3. **Ordre d'insertion** : la simulation a montré qu'insérer N37/N38/N39 aux
   bons anchors rend chaque fenêtre N23..N29 discriminante. Une tentative
   intermédiaire avait placé N39 trop tôt (fenêtre N29 vide) — corrigée avant
   l'écriture dans LADDER (ordre pédagogique réel : N37,N25,N26,N27,N38,N28,
   N29,N39,N30…).
4. **DIFFICULTY()** : le pont indexait la difficulté par `Number(id.slice(1))` ;
   avec des ids non alignés sur l'ordinal (N37 en 25e position), la bande de
   difficulté de la Policy (difficultyBand ±1) aurait produit un penalty fantôme
   systématique. Passage à l'index de position LADDER.
5. **Tests figés** : les assertions « exactement N1..N36 » et distributions
   figées ont été **étendues** aux faits réels du nouveau catalogue (signatures
   Solver N37-N41 générées par exécution, distribution LD/NM recalculée) — elles
   restent des garde-fous, simplement mis à jour. W-01/W-09 documentent que N36
   reste le dernier niveau ; AP-06 attend désormais 2 MASTERY (et plus l'absence).

## 3. Résultats — répondre aux questions (style §20)

### Q1 — Le désert médian est-il réellement comblé ?

**PROUVÉ** (audit final, catalogue réel). Chaque fenêtre du désert embarque au
moins un COMBINATION :

```
windowOf(N23)={N24,N37,N25}  windowOf(N24)={N37,N25,N26}  windowOf(N25)={N26,N27,N38}
windowOf(N26)={N27,N38,N28}  windowOf(N27)={N38,N28,N29}  windowOf(N28)={N29,N39,N30}
windowOf(N29)={N39,N30,N31}
```

Fenêtres discriminantes : **22/40** (19/35 avant). Le reste non discriminante est
assumé : N1–N9 onboarding (pédagogie), N14–N16/N22 intermédiaires, N35/N37/N39/
N40/N41 (niveaux dont la fenêtre *suite* est elle-même déjà riche / extrêmes de
ladder, tous MASTERY ou COMBINATION en fin de jeu).

### Q2 — MASTERY est-elle une propriété réelle, ou une intention ?

**PROUVÉ** : les tests AP-06 et l'audit lisent la **propriété Solver**
(`properties` de `analyzeLevel`) — passée au catalogue réel. N40 (MULTI-PATH,
routes=2) et N41 (SINGLE-PATH, routes=1) portent **MASTERY certifiée**. N36
garde son statut de couronnement déclaré (intention, cap W6), mais il n'est plus
le *seul* niveau de toute la ladder à « prétendre » la maîtrise : les pinnacles
qui le précèdent dans sa fenêtre (`windowOf(N35)={N40,N41,N36}`) la prouvent.

### Q3 — Le pipeline a-t-il été modifié pour « produire » ce que voulait l'audit ?

**PROUVÉ NON**. `level-design.mjs`, `engine.mjs`, `solver.mjs`, `save.mjs`,
policy, orchestrator, runtime : **zéro ligne modifiée** (git diff). Le pipeline
génère → certifie → catalogue ; nous n'avons ajouté que de l'énigme authentique.
La police MASTERY est strictement la police existante de `level-design.mjs`.

### Q4 — La progression et ses invariants sont-ils préservés ?

**PROUVÉ** (W-01, W-09, suite complète). N36 reste le **dernier** niveau →
recadrage de fin intact (`windowOf(N36)=[]`). `markCompleted` horizon=1 reste
non-régressif ; la divergence arithm/explorer reste dans la fenêtre (W-06).

### Q5 — Non-régression / sauvegarde / UI ?

**PROUVÉ** : suite complète **294/294** PASS (les 289 antérieurs non-régressés,
les 5 nouveaux niveaux ajoutent leurs propres tests), playtest 50/50 PASS,
`npm run build` PASS, `npm run build:b1` PASS. Le pont UI continue d'exposer la
fenêtre réelle ; la difficulté est désormais indexée par position (la bande de
difficulté de la Policy est maintenant correcte sur tout le catalogue).

## 4. Chiffres de certification (Solver, catalogue réel, budget 40000)

| Id | stage (nom) | minMoves | routes | fins | profils NM | propriétés (extrait) |
| --- | --- | --- | --- | --- | --- | --- |
| N37 | 6 OPTIMIZATION | 3 | 6 | 13 | consequence | MULTI-PATH, CHOICE, CONSEQUENCE, CHAIN, OPTIMIZATION, COMBINATION |
| N38 | 6 OPTIMIZATION | 3 | 2 | 14 | consequence | idem incl. COMBINATION |
| N39 | 7 COMBINATION | 3 | 1 | 13 | single | SINGLE-PATH, CHAIN, COMBINATION |
| N40 | 8 MASTERY | 3 | 2 | 14 | consequence | MULTI-PATH, CHOICE, CONSEQUENCE, CHAIN, OPTIMIZATION, COMBINATION, MASTERY |
| N41 | 8 MASTERY | 3 | 1 | 14 | consequence | SINGLE-PATH, CONSEQUENCE, CHAIN, OPTIMIZATION, COMBINATION, MASTERY |

Distribution LD N1-N41 : multiPath 31 · consequence 23 · equivalent 10 ·
uniqueSol 1 · singlePath 10 · choice 21 · chain 32 · optimisation 19 ·
combination **12** · mastery **2**.