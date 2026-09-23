# MATHIC 1.0 — Contrat A7 : Score

**Référence** : BRIEF §4 (Score), §17 (métriques), §22 · **Dépend de** : A4, A5, A6, A8 · **Consommé par** : A9, A13, A16 · **Statut** : DESIGN (à valider — cf. règle « coefficients calibrés par simulation + tests humains », BRIEF §4).

Le score récompense la **pensée**, pas les calculs mécaniques. Ce contrat définit les **composants** et le **mécanisme d'équilibrage** — aucune formule finale n'est déclarée définitive ici.

---

## 1. Principe

- Le score est calculé **par transformation** puis agréé en score cumulé de partie.
- Toute formule est un **policy** (composables), inséré dans `scoreConfiguration` du niveau (A9). **L'équilibrage se fait en data, jamais en réécrivant le moteur** (exigence §11 du mandate).
- Le jeu doit rester « mathématique » avant tout : le score récompense la valeur mathématique ET les choix (chaîne/combo/efficacité/objectif), il n'est jamais le juge du plaisir.

## 2. Composants (tous optionnels, chacun un coefficient)

| Composant | Sémantique | Dépendance | Statut |
|---|---|---|---|
| `base(r)` | grandeur du résultat (`f\|r\|`, ex. centimes /10) | A1 | **Validated** (support de score) |
| `complexity` | diversité opérateurs + longueur de chemin tenté | A3, A5 | Proposal → Experimental |
| `chain` | longueur de chaîne au moment du calcul | A5 | Experimental |
| `combo` | multiplicateur courant (événements math) | A6 | Experimental |
| `efficiency` | distance à l'optimum solver (A10 §6 enveloppe) | A10 | Experimental |
| `objective` | bonus fixe à la satisfaction d'un objectif | A8, A4 | Experimental |

- Chaque composant a un **coefficient** `c` ∈ `[0, +∞)` (0 = composant inactif) → désactivation par config.
- `base` est **toujours actif** (c_base ≥ 1) : sans lui, pas d'orientation « construis des valeurs ».

## 3. Forme d'agrégation (EXPERIMENTAL — à trancher par simulation)

Deux formes candidates (les deux sont sollicitées par A12 ; la première est le défaut provisoire) :

- **ADDITIVE (défaut d'étude)** : `score_n = base(r_n)·c_base + complexity·c_cx + chain·c_ch` — puis le multiplicateur combo vient après : `scored_n = score_n × comboMultiplier_n`.
- **MULTIPLICATIVE (variante de test)** : `scored_n = base(r_n) × (1+complexity·c_cx) × (1+chain·c_ch) × comboMultiplier_n × ratio_efficiency`.

Aucun chiffre ci-dessus n'est « V1 ». Le dashboard §17 BRIEF (dispersion, écart inter-joueurs, abus de stratégie) décide, pas l'intuition. **Décision gelée d'architecture** : la structure « composants × coefficients » est la seule promesse ; la combinaison peut changer.

## 4. Score cumulé & archive

- `totalScore = Σ scored_n` sur la partie (enregistré en A13/P15 pour étoile ⭐ pourcentage-sujet).
- Rejouer un niveau permet de **battre** son propre score (motivation de rejeu, BRIEF §8) — aidé par l'affichage de la **meilleure note** et du **chemin optimal affiché** (Momo/parcours).
- Un niveau avec objectif de score (A8 experimental) fixe un **seuil** — son atteinte s'évalue sur `totalScore`.

## 5. Bornes & invariants

- Score **toujours ≥ 0** (jamais négatif ; un ratio d'efficacité <1 pénalise mais jamais sous 0).
- Pas d'overflows (JS integer safe via bornes integer §2 A1).
- Score **purement dérivé** : il n'entre jamais dans `state_after` (A4 §6) — il est observable après transformation, non constituant d'état. → replay inchangé.

## 6. Métriques d'équilibrage (le dashboard §17)

- Dispersion du score par niveau (écart inter-joueurs) ;
- Fréquence/abus des stratégies dominantes (§25 du mandat) ;
- Intérêt relatif de chaque opérateur (% usage +/− × ÷, BRIEF §17) ;
- Distribution des combos (fréquence, moyenne, plafond atteint) ;
- Score plateau (peut-on « grinder » ?) — à mesurer par simulation A12.

Ces métriques **alimentent un changement de coefficients** (data) — jamais de refonte du moteur. C'est LA règle d'équilibrage.

## 7. Contractuel avec telemetry

- Événements : `move_made` porte `score_n`, `scoreTotalAfter` (A16). Permet reconstruction de la politique rétroactive.

---

**D-S1 — politique « composants × coefficients, data-driven »** (geldé). **OPEN** — la forme additive vs multiplicative reste ouverte jusqu'à simulation + playtest (A12 → test humain). Opposable.
**Risque assumé** : des coefficients mal équilibrés rendent +/× triviaux (test de domination). La certification (A11) embarquera un **check anti-domination** (présence de strats dominantes → niveau rejeté ou coefficients différents).