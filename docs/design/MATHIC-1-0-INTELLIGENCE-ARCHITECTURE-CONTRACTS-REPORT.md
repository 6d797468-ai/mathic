# MATHIC-1-0-INTELLIGENCE-ARCHITECTURE-CONTRACTS — Rapport de mandat

Verdict précédent : CONTINUE (brique BRAND-GAMEPLAY-PRINCIPLES, `691d894`, puis LDG `daff47c`).
Ce mandat pose la **frontière architecturale de l'intelligence joueur** avant toute écriture d'intelligence : plan de contrat pur (`src/intel/`), cinq contrats documentés, interdictions opposables, politique déterministe de repli.

## PRESERVE
Math Kernel, règles mathématiques, Solver, Replay, score B2, invariants (`INVALID → NO STATE CHANGE`), N1-N36, Level Design Grammar, PREVIEW/APPLY, progression linéaire, sauvegarde offline-first, certification. **Aucune ligne des couches Game Core (`src/b1`, `src/v5`) n'a été modifiée.** Architecture Mathematics ≠ Gameplay ≠ Intelligence ≠ UI ≠ Persistence ≠ Telemetry.

## ADD
- `src/intel/contracts.mjs` — plan de contrat pur, **zéro import vers le Game Core** : `EVIDENCE_TYPES` (16 types figés), anti-collecte (`FORBIDDEN_EVIDENCE_FIELDS`), `defaultProfile` (neutre, figé, déterministe), `PROFILE_DIMENSIONS`, `isProfileShape/validateProfile` (versionnage + corruption), `PROVIDER_METHODS` + `isIntelligenceProvider` (interface sans nom de modèle), `isRecommendation` (objets déclaratifs sans score/board/state), `hasWriteCapability` (interdiction AI→GameState), `deterministicDefaultPolicy` (fail-safe non-model), `COACH_METHODS` + `isCoach`, `INTEL_PROHIBITIONS` (001-004), `validateProhibitionCompliance`.
- `docs/design/MATHIC-1-0-INTELLIGENCE-ARCHITECTURE.md` — frontière, chemin de dépendance obligatoire, diagramme cible E6, règle de non-régression.
- `docs/design/MATHIC-1-0-EVIDENCE-CONTRACT.md` — Player Evidence : norme 16 événements, forme du contrat, anti-collecte, granularité rejouable.
- `docs/design/MATHIC-1-0-PLAYER-PROFILE-CONTRACT.md` — état dérivé : 8 axes comportementaux + confidence + evidenceWindow, contraintes [0,1], versionnage, explicabilité, dynamique.
- `docs/design/MATHIC-1-0-INTELLIGENCE-PROVIDER-CONTRACT.md` — interface interchangeable (Deterministic/Local/Cloud/Future), nom de modèle jamais lu, états de disponibilité, interdictions.
- `docs/design/MATHIC-1-0-PROGRESSION-POLICY-CONTRACT.md` — Policy = autorité fonctionnelle, contrat des entrées/sorties, deux-fleuves décisionnels, **DETERMINISTIC DEFAULT POLICY**.
- `docs/design/MATHIC-1-0-COACH-CONTRACT.md` — interface `explain/hint/encourage/summarize/recommend`, lecture seule du GameState, « Coach helps thinking, does not replace thinking », AI = optional.
- `tests/intel/contracts.test.mjs` — 23 tests du plan de contrat.

## CHANGE
Aucun changement de comportement du socle. `npm test` : 138 → 161 (23 nouveaux), zéro régression.

## DO NOT DO
Détection de profil (Brique 3), émission d'évidence (Brique 2), orchestration (Brique 5), coach opérationnel (Brique 7), adapter/provider IA (Briques 8-9), toute modification du Game Core, diagnostic d'âge/d'intelligence, IA qui écrit dans le GameState, ajout d'un niveau, changement du score.

## EVIDENCE (démontré automatiquement)
- **Frontière découplée** : `contracts.mjs` sans aucun import relatif vers le Game Core ; `engine/solver/replay/levels/save` (b1 + v5) sans aucune référence au plan d'intelligence (tests INTEL-C21/C22).
- **Interdictions portées par le contrat** : un provider/coach exposant `apply`/`setScore`/`setBoard` est rejeté par `hasWriteCapability`/`validateCoach` (INTEL-C11, C19) ; une recommandation portant `score`/`board`/`state`/`apply` est rejetée (INTEL-C12).
- **Fail-safe déterministe** : `deterministicDefaultPolicy` garantit `allowed ⊆ available`, ne sort jamais du Level System, immuable sur entrées gelées, identique à deux appels (JSON), et entrées invalides ⇒ `null` (INTEL-C13 → C17).
- **Données corrompues** : évidence (type/levelId/atMs/payload), profil (NaN, hors [0,1], clé inconnue, version ancienne), décision (confidence, policyVersion, rationale) — toutes rejetées sans crash (INTEL-C4, C7, C8, C16, C17).
- **Docs** : les 6 documents vérifiés par marqueurs (titre, référence, opposabilité, listes normées) (INTEL-C1).
- `npm test` : **161/161 ✔** (138 hérités + 23 contrats) · playtest Coup Parfait inchangé ✅.

## Classification des niveaux
Inchangée (N1-N36, feuille LDG figée au commit précédent).

## INTEGRATION
Cette brique ne branche **rien** sur la boucle de jeu : la frontière est posée, les garde-fous sont l'API de toutes les briques suivantes. La prochaine brique (Player Evidence, Brique 2) devra émettre des évidences **conformes à ce contrat** depuis l'Engine réel, puis le détecteur (Brique 3) produira un profil **au format PlayerProfile** validé par `validateProfile`, puis l'Orchestrateur (Brique 5) passera par `deterministicDefaultPolicy` en fail-safe, et le Coach (Brique 7) importera `isCoach` comme contrat d'interface. Aucune brique ne pourra court-circuiter le plan de contrat sans régression testable.

## Critère ultime
L'IA reste remplaçable, le système fonctionne sans IA, l'état critique du jeu demeure déterministe — vérifiable par `npm test`.