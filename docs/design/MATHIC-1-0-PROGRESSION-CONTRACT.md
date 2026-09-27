# MATHIC 1.0 — Contrat A13 : Progression

**Référence** : BRIEF §5 (mondes), §8 (étoiles/XP/Mastery), §22 · **Dépend de** : A8 (objectifs), A9 (niveaux), A12 (difficulté) · **Concerné** : A15, A16 · **Statut** : DESIGN (à valider).

**Règle 1.0** : pas d'économie complexe (mandat §17). La progression = **mondes → niveaux → étoiles → déblocages → maîtrise**, à partir de données, jamais d'argent.

---

## 1. Modèle de progression

```
MONDE (W1..W10)      ← niveau cognitif (BRIEF §5) ; opérateurs/paramètres introduits PÉDAGOGIQUEMENT
   └── NIVEAUX       ← un niveau = équation de contraintes (A9) ; ordonnés par classe de difficulté (A12 §5)
        └── ÉTOILES  ← 1..3 par niveau (récompense A9.rewardConfiguration, adossée au score A7)
             └── DÉBLOCAGES ← (étoiles cumulées) → nouveau monde / nouvel opérateur / nouveau type d'objectif
```

## 2. Étoiles & rewards

- **⭐ 1** : objectif atteint (A8 validé).
- **⭐ 2** : objectif + (score ≥ seuil 2 **ou** contrainte remplie — définie au niveau, A9).
- **⭐ 3** : performance de maîtrise (score ≥ seuil 3, ou efficacité proche de l'optimum A10 §6).
- Seuils **toujours dérivés de `scoreEnvelope`** (A10) : jamais plus hauts que l'atteignable certifié, sinon le niveau ne passe pas (A11 QUALITY).
- Récompenses 1.0 : **déblocages** (mondes/opérateurs/objectifs) + **statistiques de maîtrise** (validées par des outils, pas d'économie). Cosmétiques éventuels : décoratifs et accessibles (pas de boosters payants).

## 3. Maîtrise (Math Mastery, BRIEF §8)

- Statistiques **par opérateur/technique** (Addition %, Soustraction %, Multiplication %, Division %, Combos %, Optimisation %), calculées depuis la **trace** des parties (`opUtilization` par opérateur, `chainMax`, `comboBest`, `efficiencyRatio`) — données A15, mais **calcul pur et dérivé** (aucun impact état).
- Niveau de maîtrise pilote l'aide de Momo (A14 : moins de maîtrise → plus d'étapes d'aide), pas la jouabilité (pas de « niveau verrouillé parce que vous ne maîtrisez pas × » — la progression reste étoile-basée).

## 4. Déblocages

- Un monde se débloque par **cumul d'étoiles** sur les mondes précédents (seuils énoncés, visibles dans l'UI, cohérents avec la plage de difficulté A12 §5 pour éviter les sauts de plage).
- Un **opérateur** se débloque dans un monde (W4 ×, W5 ÷, BRIEF §5) — cohérent avec le niveau cognitif du monde.
- **Anti-verrouillage abusif** : les niveaux d'essai/tutoriels des mondes suivants restent accessibles (aperçu) pour la curiosité du joueur, sans déblocage de progression (le jeu est un puzzle, pas une file d'attente de wh- end).

## 5. Rejouer (motivation)

Trois raisons, adossées à la certification/mesures (A11/A12) :
1. **battre son score** (meilleure note affichée, battable) — cible l'entêtement « attendez, je peux battre mon score » (test décisif §19 BRIEF) ;
2. **trouver une solution alternative** (le niveau affiche « une autre façon possible » si alternatives ≥ 2 — données A10) ;
3. **réussir les conditions 3★** (perfection) → partie `replay` dédiée.

## 6. Progression globale (profil joueur)

```
PROFILE = { mission: étoiles cumulées, unParMonde: nb mondes débloqués,
            mastery: stats par opérateur, bestScores: map niveau→score,
            history: traces récentes (rejeu), settings }
```
Conservé par A15, versionné (`profileSchemaVersion`). Aucune monnaie, aucun panier, aucune dépendance réseau pour la progression.

## 7. Contractuel

- **A9** : `rewardConfiguration.stars` ; **A7** : seuils de score ; **A12** : plage de monde.
- **A15** : persistance du profil ; **A16** : `level_completed / level_replayed` alimentent les assises de déblocage (pas de décision gameplay en télémétrie — c'est purement observateur).

---

D-P1 — les étoiles 2/3 dépendent de **seuils adossés à l'enveloppe solver** (pas de seuil inventé). D-P2 — la maîtrise **pèse sur l'aide**, jamais sur le verrouillage. D-P3 — pas d'économie 1.0. Opposables.