# MATHIC 1.0 — Contrat A15 : Persistence

**Référence** : BRIEF §20 (offline, pas de backend obligatoire), §22 · **Dépend de** : A9 (niveaux, versionnage), A13 (profil) · **Statut** : DESIGN (à valider).

Le gameplay doit rester **fonctionnel hors ligne** (mandat §19) : la persistance est **locale, versionnée, sûre**, jamais un edge-case « si réseau ».

---

## 1. Portée

Ce qui se persiste :
- **PROGRESSION** : profil joueur A13 (étoiles par niveau, mondes débloqués, bestScores, mastery, settings).
- **ÉTAT DE PARTIE** : si nécessaire (reprise en cours de niveau : board, moveCount, trace) — la reprise = **replay de la trace** (A1 §6), pas un snapshot sérialisé qui dériverait. → Le checkpoint est la **trace** + `{levelId, version, ruleVersion}`.
- **STATS / MASTERY** (calculées depuis traces, A13 §3) : persistées comme données dérivées (recalculables, jamais autorité).

Ce qui NE se persiste PAS : les faits Solver (cache reproductible, A10 §7), la certification (rapports versionnés côté outillage, pas côté runtime), les données télémétriques brutes (A16, local-first).

## 2. Schéma & version

- **`profileSchemaVersion`** (entier, incrémenté à chaque changement de forme du profil).
- Chaque entrée de niveau terminé == **`{levelId, levelVersion, ruleVersion, stars, score, bestScore, traceRef}`** — la version du niveau est **conservée**, pas reconstruite par hypothèse (A9 §4).
- **Migration** : toute évolution de schéma est une **migration scriptée + testée**, qui préserve l'historique. Passer d'un `ruleVersion` à un autre ne « translate » jamais silencieusement des niveaux : les données de niveaux joués restent telles quelles, identifiées par leur version d'interprétation.

## 3. Intégrité & corruption

- Écritures **atomiques** (write-to-temp + rename) ; double tampon (cache actif + dernier bon état).
- **Signature de cohérence** (checksum simple de la structure) → détection de corruption.
- En cas de corruption détectée : **ne jamais écraser silencieusement**. Restaurer le dernier bon état, journaliser (`persistence_corruption`), offrir « recommencer le niveau » (sample traceRef introuvable → replay impossible → reprise propre).
- Toute valeur lue repasse par les **validations du kernel A1 §7bis** (NaN/∞/flottant/out-of-bounds = corruption).

## 4. Reprise (resume)

- Côté niveau : `trace` rejouée (déterministe) → atteste que l'état est atteint à l'identique, sinon signaler désynchronisation (jamais réparer silencieusement ; c'est un STOP §33 « comportement V5/contrat en conflit »).
- Côté profil : le profil se recharge en machine local ; comportement **offline complet** (aucune fonction ne dépend du réseau pour jouer).

## 5. Non-objectifs

- Pas de compte, pas de cloud obligatoire, pas de sauvegarde multi-appareils en 1.0 (extension §21 BRIEF).
- L'anti-règle : **aucune décision de gameplay ne se prend dans la persistence** (elle stocke, elle ne juge pas — identique au principe SSOT des autres contrats).

## 6. Contractuel

- **A13** : format du profil ; **A9** : référence de niveau ; **A16** : événements de télémétrie **ne transitent pas par le profil** (séparés, local-first, jamais mêlés aux décisions de jeu).
- **Testabilité** : tests de cycle (write → read → migrate → read) sur chaque schéma, et test « offline : tout fonctionne sans réseau ».

---

**D-PER1** — checkpoint = trace plutôt que snapshot sérialisé (la reprise est un replay déterministe — cohérence strictement contrôlée). **D-PER2** — corruption jamais résolue par écrasement silencieux. **D-PER3** — 100 % offline en 1.0. Opposables.