# Contrat : GAME-RULES-V1

> Gate : G1 — MATHIC V4

Ce contrat définit les règles métier intouchables du moteur. Il est la source de vérité pour les fusions et la progression.

## 1. Règle du Glissement Unique
- **Règle :** Lors d'un glissement directionnel, une tuile ne peut fusionner **qu'une seule fois**.
- **Motivation :** Prévenir les réactions en chaîne incontrôlables sur un seul swipe. Héritage de la Phase 2.

## 2. Règle de l'Opérateur Asymétrique
- **Contexte :** La fusion fait intervenir une tuile arrivante (A) et une tuile percutée (B). B reste en place, A disparaît, le résultat prend la place de B.
- **ADD (+) :** Exige `A === B` (tuiles identiques). Résultat = `A + B`.
- **SUB (−) :** Exige `A > B` (strictement). Résultat = `A - B`. *Corollaire : aucun nombre ≤ 0 ne peut exister.*
- **MUL (×) :** Toujours autorisé, quelles que soient A et B. Résultat = `A * B`.
- **DIV (÷) :** Exige que `A % B === 0` (A multiple de B). Résultat = `A / B`. *Corollaire : aucun reste, que des entiers.*

## 3. Règle du Plafond (VALUE_CAP)
- **Valeur :** `999`
- **Règle :** Toute opération (généralement MUL ou ADD) dont le résultat mathématique dépasserait strictement `VALUE_CAP` est **refusée**. Les tuiles glissent l'une contre l'autre mais ne fusionnent pas.
- **Motivation :** Empêcher les valeurs absurdes, forcer le joueur à utiliser la division et la soustraction ("l'Effondrement").

## 4. Règle de la Cible (TARGET_NUMBER)
- **Valeur :** `24`
- **Règle :** Si le résultat d'une fusion vaut EXACTEMENT `TARGET_NUMBER`, les tuiles fusionnent puis **explosent** immédiatement, laissant la case vide, et déclenchant un événement `TARGET_COLLAPSED`.
- **Motivation :** C'est le cœur de la boucle de jeu. Vider le plateau en atteignant la cible.

## 5. Règle du Spawn Naturel
- **Règle :** Après un swipe *fructueux* (ayant entraîné au moins un glissement ou une fusion), une et une seule tuile est générée sur une case vide aléatoire.
- **Valeurs :** Le spawn naturel est strictement confiné à l'intervalle `[1, 5]`.
- **Motivation :** Les grandes valeurs (> 5) ne doivent être obtenues que par l'ingéniosité du joueur (fusions).
