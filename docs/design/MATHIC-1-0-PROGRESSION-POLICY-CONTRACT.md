# MATHIC 1.0 — Intelligence Contract : Progression Policy

**Référence** : Feuille de route MATHIC 1.0 §5.D, §7 (Gate G2), §24 · **Consomme** : PlayerProfile (Brique 1), Level System (facts) · **Consommé par** : Progression Orchestrator (Brique 5) · **Statut** : CONTRAT (socle Brique 1, opposable).

La policy est **l'autorité fonctionnelle** de la progression adaptative. Le profil produit une recommandation ; la policy décide ; l'orchestrateur exécute.

---

## 1. Signature du contrat

```text
Profile
   +
LevelState
   +
AvailableLevels
   +
Policy
      ↓
AllowedProgression
```

```text
evaluate({ profile, levelState, availableLevels })
   → { allowedLevels, blockedLevels, confidence, policyVersion, rationale }
```

## 2. Contrat des entrées (`validateProgressionInput`)

- **`profile`** : forme PlayerProfile valide (`version` courante, dimensions [0,1], données finies).
- **`levelState`** : `{ unlocked: LevelId[], completed: Record<LevelId, {wins,bestScore,...}> }` — l'état réel de progression du joueur (persistance existante).
- **`availableLevels`** : catalogue des niveaux **déjà disponibles** pour le joueur, avec leurs métadonnées (`id`, `world`, `difficulty`, `minMoves`, `routeCount`, ...). Il ne propose jamais un niveau du Level System non autorisé.

## 3. Contrat des sorties (`isProgressionDecision`)

- `allowedLevels ⊆ availableLevels` — la décision ne sort **jamais** du périmètre du Level System ;
- `blockedLevels` — complément explicite (rappel des contraintes) ;
- `confidence ∈ [0,1]` — la confiance de la **décision**, pas du modèle ;
- `policyVersion = POLICY_VERSION` — toute évolution de règle est versionnée ;
- `rationale: string[]` — la décision s'explique (explicabilité).

## 4. Le deux-fleuves des décisions

```text
PROFILE → RECOMMENDATION → POLICY VALIDATION → ALLOWED LEVEL
```

Deux cas seulement sont possibles en sortie :

| Cas | Condition | Comportement |
|---|---|---|
| Recommandation **validée** | profil cohérent, confiance suffisante, contraintes Level System respectées | policy construit `allowedLevels` adapté aux recommandations certifiées |
| Recommandation **absente/invalide** | AI unavailable, timeout, profil invalide, confidence basse, profil contradictoire, provider incompatible | **DETERMINISTIC DEFAULT POLICY** — le joueur continue |

## 5. DETERMINISTIC DEFAULT POLICY (fail-safe, dès Brique 1)

Fournie dans `src/intel/contracts.mjs` :

- renvoie **tous** les `availableLevels` (progression linéaire du Level System intacte) ;
- `confidence = 0.5` (décision sûre par construction, pas par modèle) ;
- `rationale = [DETERMINISTIC DEFAULT POLICY — aucun modèle requis, contraintes du Level System respectées]` ;
- entrées **jamais mutées** (immutabilité vérifiable) ;
- entrées invalides → retour `null` (l'orchestrateur reste sur la sélection autorisée précédente) ;
- déterministe : mêmes entrées → même sortie (compare par JSON).

## 6. Prohibitions

- ❌ Aucune politique qui « saute » un niveau hors des contraintes du Level System.
- ❌ Aucune décision de policy qui modifierait un score, un état de plateau ou une sauvegarde.
- ❌ Aucune dépendance à un modèle : la policy fonctionne **sans IA** (Gate G2).

---

**D-POL1** — la policy est l'autorité ; la recommandation n'est qu'un candidat. **D-POL2** — l'adaptation n'existe qu'à l'intérieur du Level System. **D-POL3** — défaillance de l'intelligence ⇒ repli déterministe, jamais de blocage. Opposables.