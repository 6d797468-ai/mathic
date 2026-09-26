# MATHIC 1.0 — Intelligence Contract : PlayerIntelligenceProvider

**Référence** : Feuille de route MATHIC 1.0 §5.C, §10, §22 · **Consommé par** : Progression Orchestrator, Coach · **Consomme** : rien du Game Core · **Statut** : CONTRAT (socle Brique 1, opposable).

L'interface est **indépendante du modèle**. Le système ne dépend jamais du nom du modèle, de sa famille, de sa taille ni de son éditeur.

---

## 1. Position dans l'architecture

```text
CORE GAME AUTHORITY                    INTELLIGENCE PLANE
Kernel / Engine / Solver          PLAYER ──► COACH
Replay / Rules / State                 │
            ▲                          ▼
            │  jamais                  MODEL ADAPTER
            │                           │
            │              ┌────────────┼────────────┐
            │              ▼            ▼            ▼
          AUCUNE IA       LOCAL       CLOUD       FUTURE
          DIRECTE sur     MODEL       MODEL      PROVIDER
          GameState
```

## 2. Interface du contrat

```text
PlayerIntelligenceProvider
{
  info:        () -> { providerId, capability, available, modelTag? }
  isAvailable: () -> boolean
  analyze:     (evidence: PlayerEvidence[]) -> ProfileRecommendation | null
  recommend:   (ctx) -> ProgressionRecommendation | null
  explain:     (req) -> Explanation | null
}
```

Implémentations possibles (aucune n'est obligatoire) :

```text
DeterministicProvider      // par défaut, aucun modèle
LocalModelProvider         // GGUF local optionnel
CloudModelProvider         // distant, optionnel
FutureProvider             // inconnu aujourd'hui, interface stable
```

Chaque résultat est une **recommandation déclarative**, jamais une mutation (voir §4).

## 3. Le nom du modèle n'est pas un contrat

- `modelTag` est **informatif et optionnel** : jamais lu pour décider.
- Le **`providerId`** (ex. `deterministic`, `local-gguf`, `cloud-llm`) est l'identifiant de routage, pas le modèle.
- Un provider peut être retiré/remplacé **sans toucher au produit** : seule l'implémentation change.

## 4. Les recommandations restent des objets déclaratifs

Contrat `isRecommendation` de `src/intel/contracts.mjs` :

- clé `kind` ∈ { profile, progression, explanation, assistance, default } ;
- clés autorisées uniquement : `kind`, `levelId(s)`, `targets`, `rationale`, `confidence`, `text`, `lines`, `family`, `providerId` ;
- **aucune** clé `apply` / `mutate` / `score` / `board` / `state` / `commit`.

Un résultat portant une clé hors norme est **rejeté par le contrat** (l'orchestrateur n'en tient pas compte).

## 5. Interdictions portées par le contrat

- `AI → GameState` : jamais (`hasWriteCapability` détecte toute méthode d'écriture).
- `AI → level obligatoire` : jamais (la policy reste l'autorité).
- `AI → score` : jamais (le score appartient au moteur).
- `AI → modification arbitraire du plateau` : jamais.

## 6. États de disponibilité

```text
unavailable   → analyze/recommend/explain renvoient null ; capacity gère le repli
timeout       → traité comme unavailable (jamais de blocage du jeu)
invalid       → rejeté par le contrat (provider invalide = repli déterministe)
```

Pour chaque état : **DETERMINISTIC DEFAULT POLICY** (Brique 1) — le joueur continue de jouer.

---

**D-IP1** — provider = interface ; modèle = détail d'implémentation. **D-IP2** — une recommandation hors norme est ignorée, pas exécutée. **D-IP3** — aucun état de provider ne rend le jeu inutilisable. Opposables.