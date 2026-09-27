# MATHIC V6 — M25 CONTRACTS (REFOUNDATION GAMEPLAY)

## 1. GAMEPLAY-CONTRACT
**Objectif** : Transformer la cible du joueur. 
La victoire ne consiste plus à "trouver le bon résultat" (puzzle de calcul), mais à **"choisir et exécuter une stratégie de transformation mathématique"**. 
Le gameplay est centré sur l'utilisation délibérée de **Méthodes** (compétences/sorts).

**Invariants** :
- `G-01` : Un niveau doit offrir au moins deux stratégies légales distinctes (plusieurs combinaisons de méthodes).
- `G-02` : La validité finale reste exclusivement déterminée par le moteur `V5` (pas de magie ni d'invention de règle).

## 2. METHOD-CONTRACT
**Objectif** : Une Méthode est une primitive de gameplay choisie par le joueur.
Chaque méthode est un objet décrivant *comment* le joueur veut utiliser les lois mathématiques fondamentales (+, -, *, /).

**Contrat canonique** :
- `id` : Identifiant unique (ex: `METHOD_DECOMPOSE`, `METHOD_FUSE`, `METHOD_FACTORIZE`).
- `name` : Nom lisible de la méthode.
- `parameters` : La signature des données attendues par la méthode.
- `preconditions` : Règles (état du plateau) devant être satisfaites pour que la méthode soit invocable.
- `primitiveOperations` : Les lois V5 (`+`, `-`, `*`, `/`) que la méthode utilise sous le capot.
- `cost` : Coût en Éther ou ressource.

**Interdiction formelle** (Non-Magie) :
- `M-01` : Une méthode ne peut jamais muter l'état du jeu sans prouver sa transformation en une séquence d'opérations primitives valides dans V5.

## 3. COMMAND-CONTRACT
**Objectif** : Couplage strictement descendant. Le `Method Engine` (couche gameplay) envoie des *Intents* (Intentions) compilés en commandes au `V5 RULE KERNEL`.

**Règles** :
- `C-01` : V5 est **IMMUTABLE**. La couche V5 ignore tout de la couche Méthode.
- `C-02` : Le `Method Engine` traduit les paramètres du joueur en séquences de coups V5 validables.
- `C-03` : V5 `apply()` ou `validate()` retourne un résultat (Succès ou Échec). Si V5 rejette, la méthode échoue et la mutation est annulée.

## 4. SESSION-CONTRACT
**Objectif** : La session de jeu n'est plus une boucle d'action immédiate, mais une machine d'état structurée autour de l'anticipation.

**États obligatoires** :
- `WORLD` : Exploration de la carte/saga.
- `ROOM_INTRO` : Découverte du problème, événements narratifs.
- `OBSERVE` : Le joueur lit le plateau sans interaction directe.
- `PLAN` : Le joueur sélectionne une Méthode et ses cibles.
- `PREVIEW` : **Crucial**. Le jeu montre l'état avant/après et la chaîne de preuve *avant* validation.
- `EXECUTE` : L'action est confirmée, la méthode s'applique, le V5 valide.
- `CONSEQUENCE` : Déclenchement des conséquences visuelles, narratives et lore.
- `RESOLVE` : Vérification des conditions de victoire.

## 5. PLAYER-CHOICE-CONTRACT
**Objectif** : Mesurer et récompenser l'intention stratégique.
Puisque plusieurs méthodes sont valables, le système doit pouvoir évaluer le choix du joueur.

**Métriques dérivées** :
- `Efficiency` : Nombre de coups primitifs générés vs idéal.
- `Ether Cost` : Dépense énergétique.
- `Stability` : Mesure de la préservation des structures.
- `Chain Length` : Nombre d'effets en cascade déclenchés.

*Ces contrats scellent l'architecture V6. Tout ajout futur doit s'y conformer strictement.*
