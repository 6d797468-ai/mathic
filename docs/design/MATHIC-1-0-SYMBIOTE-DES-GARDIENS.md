# MATHIC 1.0 — Architecture : Symbiote des Gardiens (MISSION 16)

**Statut** : LIVRÉ / VÉRIFIÉ  
**Rôle** : Guardian Composition Layer au-dessus du moteur V5 (mode `LAB`)  
**Fichiers source** : `src/atelier/symbiote.mjs`, `src/atelier/knowledge.mjs`, `src/atelier/web/atelier.js`, `src/atelier/web/index.html`, `src/atelier/web/atelier.css`  
**Tests** : `tests/atelier/symbiote.test.mjs` (17 tests SYM-01..17 PASS), `tests/atelier/knowledge.test.mjs` (26 tests KNOW PASS)  
**Rapport associé** : `docs/design/MATHIC-1-0-SYMBIOTE-DES-GARDIENS-REPORT.md`  

---

## 1. Univers narratif & Hiérarchie d'autorité

Dans l'univers Mathic, la magie est une science déterministe. Aucune autorité narrative ne peut altérer les lois mathématiques :

```
             ┌────────────────────────────────────────────────────────┐
             │       ROI OMÉGA & REINE PHI (Autorités Cosmiques)      │
             │       « Les lois universelles préexistent à toute      │
             │         manifestation. Rien ne s'invente. »            │
             └───────────────────────────┬────────────────────────────┘
                                         │
             ┌───────────────────────────▼────────────────────────────┐
             │      MAGGEEK (Mentor narratif de l'Atelier Astral)     │
             │      « Guide par la trace, consigne les faits dans      │
             │        les Marges de Maggeek. N'invente aucun fait. »  │
             └───────────────────────────┬────────────────────────────┘
                                         │
             ┌───────────────────────────▼────────────────────────────┐
             │          LES QUATRE GARDIENS DES LOIS DU CALCUL        │
             │   Al-Jabr (ADD)       ·  Fractalia (SUB)               │
             │   Nexus (MUL)         ·  Scindium (DIV)                │
             └───────────────────────────┬────────────────────────────┘
                                         │
             ┌───────────────────────────▼────────────────────────────┐
             │                  MOTEUR V5 IMMUABLE                    │
             │   validateSpec · createSession · apply · getMoves      │
             │   isSolved · replay · canonical                        │
             └────────────────────────────────────────────────────────┘
```

Chaque Gardien est l'incarnation narrative d'un **opérateur réel** du moteur V5 :
- **Al-Jabr** : opérateur `+` (loi de ligne ADD, « l'ordre qui ajoute »).
- **Fractalia** : opérateur `-` (loi de ligne SUB, « la faille qui retranche sous zéro refusée »).
- **Nexus** : opérateur `*` (loi de ligne MUL, « le nœud qui multiplie »).
- **Scindium** : opérateur `/` (loi de ligne DIV, « le miroir qui divise avec reste nul obligatoire »).

---

## 2. Dérivation stricte : Lore → Presentation → Use-Case → Contract → Engine

Le principe de dérivation impose qu'aucune règle de lore ne puisse descendre directement dans le moteur :

```
Lore (Récit / Gardiens / Marges)
  ↓
Presentation / UX (Cartes Gardiens, badge Résonance, panneau #symbiote)
  ↓
Use-case (Composer une Chambre hybride pour explorer la dualité/triade)
  ↓
Contract (SymbioteSpec, validateSymbiote, composeGuardianSpec)
  ↓
Engine V5 (createSession, apply, isSolved, certify — STRICTEMENT INTACTS)
```

**Règle d'or** : Le Symbiote ne dispose que de la **SPÉCIFICATION** (`SessionSpec`). Une fois la session créée via `engine.createSession(composedSpec)`, le moteur applique ses lois universelles sans savoir qu'un Symbiote a configuré la chambre.

---

## 3. Guardian Composition Layer (GCL)

Le GCL n'est **jamais un moteur**. C'est un **compositeur de configuration pure** :

1. Reçoit une `baseSpec` (grille, réserve, dimensions) et une liste de Gardiens sélectionnés.
2. Assigne de façon déterministe les lois d'opérateurs sur les lignes et colonnes de la grille.
3. Résout par backtracking canonique avec budget fini (`FILL_BUDGET = 6000`) les cibles nécessaires pour que la grille soit certifiable.
4. Produit une `SessionSpec` valide selon le contrat V5, où la grille contient `-1` sur toutes les cellules libres (la solution n'est **jamais** pré-remplie).
5. Si aucune configuration mathématique n'existe pour ce shape et ces Gardiens, la composition est **rejetée par contrat** (`ok: false`), sans jamais inventer de règles ad-hoc ni modifier la réserve du joueur.

---

## 4. Modèle de Contrat : `SymbioteSpec`

```typescript
interface SymbioteSpec {
  guardians: GuardianId[]; // AL_JABR | FRACTALIA | NEXUS | SCINDIUM
  baseSpec: SessionSpec;   // Validée selon engine.validateSpec
  mode: "LAB";             // Mode obligatoire, isolé de la Progression
}
```

### Invariants stricts :
- `guardians.length >= 1` : au moins un Gardien requis.
- Aucun doublon dans `guardians` : `Set(guardians).size === guardians.length`.
- Tout Gardien doit appartenir à `GUARDIAN_IDS`.
- `mode === "LAB"` : tout autre mode est rejeté.
- `baseSpec` doit passer avec succès `engine.validateSpec(baseSpec)`.
- Rejets motivés par un tableau de `reasons: string[]` explicites.

---

## 5. Algorithme de Composition Déterministe (`composeGuardianSpec`)

L'algorithme garantit $F(B, G) = F(B, G)$ sans aucune dérive :

1. **Assistance de loi** :
   $$\text{rowOp}(r) = \text{op}(\text{guardians}[r \bmod |G|])$$
   $$\text{colOp}(c) = \text{op}(\text{guardians}[(|R| + c) \bmod |G|])$$
2. **Recherche de cibles** : parcours ligne-major des cellules libres, sélection des valeurs ordonnées de la réserve, élagage immédiat dès qu'une ligne ou colonne complète produit un résultat invalide (`null` sous V5).
3. **Plafonnement de budget** : si le nombre de nœuds dépasse le budget sans solution, retour `null` (composition **infaisable sous budget** — `null` signale l'absence de solution trouvée dans `FILL_BUDGET`, ce qui n'est **pas** une preuve mathématique d'infaisabilité ; sémantique tri-état `SOLVED / UNSOLVABLE_PROVEN / SEARCH_BUDGET_EXCEEDED` prévue en M16.x).
4. **Intégrité de grille** : la grille retournée reproduit exactement la grille de base (`-1` pour chaque case libre, conservation des cases fixes éventuelles).

---

## 6. États Narratifs Purs du Symbiote

La couche narrative évalue l'évolution du joueur par une fonction pure sur la séquence d'événements observés :

$$\text{evaluateSymbiosis}(E) \to \{ \text{state}: \text{SymbioteState}, \text{sets}: \text{number} \}$$

| État narratif | Condition d'activation | Définition technique |
|---|---|---|
| **DORMANT** | Défaut | Aucune interaction symbiotique |
| **AWAKENED** | `SYMBIOTE_AWAKENED` | Premier contact avec les Gardiens |
| **BOUND** | `SYMBIOTE_COMPOSED` avec $|G| \ge 2$ | Au moins une dualité engagée |
| **RESONANT** | `SYMBIOTE_COMPOSED` $|G| \ge 2$ suivi de `CHALLENGE_COMPLETED` | Un défi hybride a été résolu |
| **MASTERED** | $\ge 3$ compositions distinctes $|G| \ge 2$ engagées | Maîtrise de multiples configurations |

---

## 7. Seam d'Extension M15 : Mémoire du Symbiote

Le Symbiote alimente la mémoire pédagogique de l'Atelier via la seam de contexte introduite en M15 dans `src/atelier/knowledge.mjs` :

- **Clé de stockage conservée** : `mathic.knowledge.v1` (aucune clé parallèle orpheline).
- **Catalogue étendu** : 5 fragments M15 de base + 5 fragments Gardiens M16.
- **Fragments M16** :
  - `LORE_AL_JABR_001` : découverte de la loi d'Al-Jabr (`+`).
  - `LORE_FRACTALIA_001` : découverte de la loi de Fractalia (`-`).
  - `LORE_SYMBIOSIS_001` : première composition multi-Gardiens ($|G| \ge 2$).
  - `LORE_AL_JABR_FRACTALIA_001` : dualité canonique addition + soustraction.
  - `LORE_NEXUS_SCINDIUM_001` : dualité canonique multiplication + division.
- **Indépendance absolue de la Progression** : la sauvegarde des niveaux N1..N41 (`mathic.save`) ne contient aucune clé de savoir, aucun flag de lore.

---

## 8. Pipeline Utilisateur (UX)

L'expérience suit fidèlement le flux narratif et technique :

```
[ 1. Choisir les Gardiens ]
       │ Toggles interactifs Al-Jabr, Fractalia, Nexus, Scindium
       ▼
[ 2. Lier les Sceaux ]
       │ Clic sur « ⚚ Lier les Sceaux & Forger le Défi »
       │ Émission de SYMBIOTE_COMPOSED
       ▼
[ 3. Observer la Résonance ]
       │ Le badge passe de DORMANT → AWAKENED / BOUND
       ▼
[ 4. Forger le Sceau de Défi ]
       │ Optionnel : encodeSeal(spec) génère la clé portable MATHIC-CHAL-1
       ▼
[ 5. Résoudre le Défi sur la Grille ]
       │ Coups vérifiés par ReplayController, Sablier disponible, Oculus actif
       ▼
[ 6. Débloquer les Fragments ]
       │ CHALLENGE_COMPLETED active RESONANT et débloque le savoir dans les Marges
```

---

## 9. Corrections et Clarifications du Corpus (§10 Mandat)

1. **Nature du Sceau de Défi** :
   Le Sceau généré par `canonical(spec)` et encodé en base64url n'est **pas une clé cryptographique asymétrique**. C'est un **identifiant canonique déterministe et vérifiable** (protection d'intégrité CRC32 + payload structuré).
2. **Distinction des structures de données** :
   - `SessionSpec` : définition statique du problème (grille initiale, cibles, lois, réserve).
   - `SessionState` : état mutable/courant au curseur (grille partielle, réserve restante, coups, solved).
   - `ChallengePayload` : enveloppe sérialisée pour l'échange de défi.
3. **Comportement du Sablier de Chronos** :
   Le Sablier n'annule jamais une « fusion illégale » : une commande illégale est rejetée immédiatement par `apply()` et **ne produit aucun événement dans la trace**. Le Sablier recule uniquement dans la trace des événements légaux validés.
4. **Réserve vidée symétriquement** :
   Le concept narratif de « vider la réserve symétriquement » est traité comme un **haut fait optionnel** de résolution (Option B de la gouvernance), jamais comme une contrainte bloquante du moteur.
