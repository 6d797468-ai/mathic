# SPIKE — Portage campagne b1 → V5 (N1..N3) · Données du débat

**Date** : 2026-09-25 · **Branche** : `lab/v5-portage-spike` (jetable) · **Moteurs modifiés** : ZÉRO (I-1 respectée)
**Runner** : `lab/v5-portage-spike.mjs` — vérité b1 = BFS exhaustif réel ; vérité V5 = `validateSpec` + `certify()` réels.
**Portée** : N1..N3 = le **MEILLEUR cas** pour le portage (aucun chaînage — il arrive à N5 ; pas de score décisionnel — il arrive à N6).

---

## 1. Résultats par niveau

| Niveau | Vérité b1 (BFS réel) | Traduction V5 (fair-play) |
|---|---|---|
| **N1** « La Première Formule » | 3 états · 2 gagnants · formules `2+3` et `3+2` | **DIRECTE** (1 spec) : valide, solvable, **1 solution** |
| **N2** « Deux Chemins » (choix = valeur) | 13 états · 4 gagnants · `2+3 / 3+2 / 4+1 / 1+4` | **ÉCLATÉE : 4 specs pour 1 niveau** — chaque spec fige une formule, 1 solution chacune |
| **N3** « L'État Après » | 13 états · 4 gagnants · `6×4 / 4×6 / 8×3 / 3×8` | **ÉCLATÉE : 4 specs pour 1 niveau** — idem |

**Lecture** : le nombre de specs éclatées suit exactement le nombre de formules gagnantes (4/4 sur N2 et N3). La proportion pédagogique de N2 — *« plusieurs formules vers le même objectif (choix = valeur) »*, idée gravée dans le LADDER — **ne survit pas à la traduction** : elle devient quatre niveaux différents à solution unique.

## 2. Preuve mécanique du verrou de colonnes (D5/D6)

Test réel sur N2, exécuté par le runner :

1. Une spec V5 1×2 avec cibles de colonnes `{2,3}` → **1 solution** (2+3) ;
2. Une spec avec cibles `{4,1}` → **1 solution** (4+1) ;
3. Une spec **sans cibles de colonnes** (pour laisser le choix) → **rejetée par `validateSpec`** (« target entier requis »).

Dans V5, une colonne d'une ligne 1×N a une seule cellule ; `lineOk` y impose une **égalité stricte**. Figer les colonnes est donc *obligatoire*, et figer une colonne élimine toute autre valeur pour cette case. **Conclusion mesurée : un « Deux Chemins » est structurellement inexprimable en une spec V5.**

## 3. Les deltas noyau (k = 6)

| # | Delta | Nature |
|---|---|---|
| D1 | Cellule-opérateur positionnée (choisir l'op **et** son couple) | **STRUCTUREL** — changement de grammaire |
| D5 | Colonnes non-figées (cible = égalité stricte obligatoire) | **STRUCTUREL** — changement de grammaire |
| D2 | Fusion avec consommation + réécriture de tuiles (a⊕b→résultat, chaînes N5+) | Règle nouvelle |
| D3 | Terminalité win/lose/blocked + budget de coups | Règle nouvelle |
| D4 | Score + bonus de chaîne | Règle nouvelle |
| D6 | Multi-formules en une spec (au-delà de l'éclatement) | Conséquence de D5 |

**k = 6, dont 2 changements de grammaire.** Et ce sur le cas le plus favorable : N1..N3. Le chaînage (N5+), le score décisionnel (N6+) et les mondes supérieurs ne feraient qu'ajouter des variantes de D2–D4.

## 4. Verdict du spike

> **La traduction n'est pas un transport, c'est une reconstruction.** Porter N2 vers V5 détruit précisément ce que N2 enseigne. Pour préserver la pédagogie, V5 devrait gagner 6 règles dont 2 changements de grammaire — c'est-à-dire devenir un autre moteur. Le nom honnête de ce projet n'est pas « portage », c'est **V6**.

Conséquences pour la décision d'architecture :
- La **façade commune** (statu quo du contrat M17) est confirmée par données : le coût du portage (6 deltas + re-certification totale + migration de save) dépasse largement le coût de la seam (déjà écrite, zéro maintenance mesurée).
- Le critère de bascule n°1 du débat (mécanique exigeant `certify()`) reste ouvert mais **pèse désormais la preuve du contraire** : `certify()` sur des specs éclatées ne rendrait pas le choix au joueur.

## 5. Conditions de révision de ce verdict

Le verdict est révisable si l'un de ces faits devient vrai (à re-mesurer, pas à re-débattre) :
1. Une mécanique de campagne nouvelle **exige** une preuve de solvabilité que le solveur b1 ne fournit pas ;
2. Le coût de double maintenance devient tracé et significatif (bifurcations répétées moteur) ;
3. Le Symbiote devient une mécanique de campagne (composer des Gardiens dans le mode histoire) ;
4. Le gel M22 identifie le double noyau comme bloqueur de Release Candidate.

**Reproductibilité** : `node lab/v5-portage-spike.mjs` (zéro dépendance, zéro modification moteur).
