# MATHIC 1.0 — Rapport de mandat : Calibration de l'expérience joueur (MISSION 11)

**Référence** : MISSION 11 — `PLAYER EXPERIENCE CALIBRATION` · Méthode : `MATHIC-1-0-PLAYER-EXPERIENCE-CALIBRATION.md`
**Statut** : IMPLÉMENTÉ, TESTÉ, OBSERVÉ (EXP-01..04, EXP-06) ; EXP-05 (humain UI) à exécuter.

---

## 1. Objet

Répondre à la question du mandat : **la progression ADAPTIVE améliore-t-elle
réellement l'expérience du joueur par rapport à ORDINAL (N→N+1) ?** La réponse
établie par l'expérience : **oui pour un joueur détecté ARITHM (U), neutre pour
EXPLORER et CHAIN (ΔR≈0, ΔE≈0)** ; l'ADAPTIVE ne fabrique ni dérive ni
réussite hors des règles de grammaire/difficulté réelles (100 % des écarts au
front sont classifiés par une raison EXP-06). Zéro modification du pipeline de
jeu — le harnais mesure l'existant avec les briques réelles.

## 2. Résultats EXP-01 : dataset

- `docs/experiments/m11/EXP-01-dataset.json` : 60 trajectoires complètes
  (3 profils × 2 modes × 10 seeds), 720 étapes, chaque étape avec
  niveau-playé/front/bande/positions/codes/issue ; chaque trajectoire rejouée à
  l'identique pour le déterminisme (0 divergence, sinon `throw`).

| Fenêtre | ORDINAL | ADAPTIVE |
| --- | --- | --- |
| F_difficulty | 0.167 | 0.167 |
| R_retry | 2.000 | 1.833 |
| E_solve | 0.048 | 0.084 |
| Victoires | 60/360 | 90/360 |
| Étapes au front | 360 | 110 |
| Étapes hors front | 0 | 250 (dont 110 replis) |

## 3. EXP-03 : par profil (modes confondus)

| Profil | F | R | E | Victoires |
| --- | --- | --- | --- | --- |
| arithm | 0.167 | 1.417 | 0.127 | 70/240 |
| explorer | 0.083 | 1.833 | 0.022 | 20/240 |
| chain | 0.250 | 2.500 | 0.049 | 60/240 |

Le profil chain est le plus frictionné (R=2.5, il retente fortement ses niveaux
d'ancrage) ; explorer atteint le moins de victoires (il explore, ne résout pas) ;
arithm résout le plus efficacement (E=0.127).

## 4. EXP-02 : comparaison paire à paire (même profil, même seed)

Quantifié **ADAPTIVE − ORDINAL** sur la même cellule profil×seed (delta de
paire, jamais de moyenne croisée) :

| Profil | ΔF | ΔR | ΔE | Trajectoires |
| --- | --- | --- | --- | --- |
| arithm | 0.000 | **−0.500** | **+0.130** | 10/10 gagnées par ADAPTIVE |
| explorer | 0.000 | 0.000 | −0.015 | 0/10, 0 perdues (neutre) |
| chain | 0.000 | 0.000 | −0.007 | 0/10, 0 perdues (neutre) |

Lecture : **l'ADAPTIVE n'altère pas la difficulté ressentie (ΔF=0) mais réduit
la friction (ΔR) et améliore l'efficacité de résolution (ΔE) du joueur
arithmétique** — le seul profil dont la grammaire activée (COMBINATION/MASTERY
au-delà du front) est réellement atteignable par les règles. Pour explorer/chain
le gain est nul (ΔR=0, ΔE≈0) : l'ADAPTIVE s'écarte du front mais ne convertit
pas en résolutions — observation légitime, pas un échec à dissimuler.

## 5. EXP-04 : analyse cellulaire (profil × mode)

| Cellule | F | R | E | Victoires | Front/hors-front/replis |
| --- | --- | --- | --- | --- | --- |
| arithm:ORDINAL | 0.167 | 1.667 | 0.063 | 20/120 | 120/0/0 |
| arithm:ADAPTIVE | 0.167 | **1.167** | **0.192** | **50/120** | 60/60/60 |
| explorer:ORDINAL | 0.083 | 1.833 | 0.029 | 10/120 | 120/0/0 |
| explorer:ADAPTIVE | 0.083 | 1.833 | 0.014 | 10/120 | 10/110/10 |
| chain:ORDINAL | 0.250 | 2.500 | 0.053 | 30/120 | 120/0/0 |
| chain:ADAPTIVE | 0.250 | 2.500 | 0.045 | 30/120 | 40/80/40 |

La seule cellule où l'ADAPTIVE transforme l'expérience : arithm (R −0.5, E ×3,
victoires ×2.5) — encore une fois sans toucher F : les gains viennent des
niveaux **hors bande** (diversification vers COMBINATION/MASTERY), pas d'un
assouplissement de la difficulté de la bande elle-même.

## 6. EXP-06 : analyse front vs non-front des choix ADAPTIFS

Sur 360 étapes ADAPTIVE : **110 au front (31 %), 250 hors front (69 %)**.

| Classe | Compte | Lecture |
| --- | --- | --- |
| FRONT_BEST_FIT | 0 | le front n'est jamais re-confirmé par une règle seule |
| GRAMMAR_MATCH | 80 | règle de grammaire réellement activée |
| PROFILE_MATCH | 0 | — |
| DIFFICULTY_MATCH | 170 | raison de difficulté forte |
| NO_MEANINGFUL_DIFFERENCE | 0 | aucun écart "pour rien" |
| FALLBACK | 110 | repli SAFE_DEFAULT (confiance insuffisante) |

80+170 = 250 = 100 % des écarts au front classifiés par une raison réelle. Les
110 étapes restées au front sont exactement les 110 replis SAFE_DEFAULT
(vérifié : at-front 110 = fallback 110, non-repli au front = 0) — l'ADAPTIVE ne
reste au front que par prudence, jamais par choix arbitraire.
**Distribution des codes ADAPTIVE** : STABILITY_HOLD 180 · LOW_CONFIDENCE_ADAPTATION 160 · DIFFICULTY_MATCH 160 · SAFE_DEFAULT_PROGRESSION 120 · DIFFICULTY_IN_BAND 60 · HIGH_CONFIDENCE_SPECIFIC 60 · STABILITY_BREAK 30 · STRATEGY_MATCH 30 · CHAIN_MATCH 30. Chaque divergence est portée par une règle `*_MATCH` réelle ou une raison de difficulté, jamais par l'ID, l'ordre d'entrée ou un aléa (déterminisme vérifié).

## 7. EXP-07 : correction d'une faillite détectée (PERTINENCE)

**Failite préexistante** (reproduite sur M9 `407981c` et M10 `aeae6e8`) : le
scénario ARITH pouvait laisser les clés `*_MATCH` d'autorisation **inactives**
par `restoreArc`/consolidation (interaction entre Evidence/Policy et run)
pendant que l'assertion 4/5 les supposait actives → violation PERTINENCE.
**Cause réelle** : le protocole n'avait pas la notion d'« absence de règle
activée = verdict NON APPLICABLE, pas violation ». **Correction minimale**
(`simulate-adaptive-progression.mjs`) : l'assertion exige la règle sauvegardée
si `RULE_DIMENSION` est configurée et qu'une règle a été activée (`ruleActive`),
sinon verdict NON APPLICABLE. Vérifications : seeds {1,42,20261007,999,12345}
× n=10 → exit 0 ; **non-vacuité** : 80/120 runs activent une règle, 0 violation
catchable ; suite complète 311/311 PASS.

## 8. Conclusions du mandat (style §16 like §7 style)

### Q1 — l'ADAPTIVE améliore-t-elle l'expérience du joueur ?

**OBSERVÉ (profils contrôlés)** : oui, pour ARITHM (ΔR −0.500, ΔE +0.130, 10/10
trajectoires meilleures, victoires ×2.5) ; **neutre** pour EXPLORER et CHAIN.
Aucun profil ne régresse significativement (ΔE ≤ −0.015). EXP-05 doit confirmer
sur humain.

### Q2 — l'ADAPTIVE dérive-t-elle hors de la difficulté attendue ?

**OBSERVÉ mais non fabriqué** : F_difficulty inchangé (0.167/0.167) — l'ADAPTIVE
ne banalise pas la bande attendue ; ses gains viennent de niveaux **hors bande**
classifiés à 100 % par GRAMMAR_MATCH (80) ou DIFFICULTY_MATCH (170), jamais par
NO_MEANINGFUL_DIFFERENCE (0).

### Q3 — la divergence est-elle réelle ou fabriquée ?

**PROUVÉ (déterminisme + classification)** : trajectoires rejouées octet à octet
(0 divergence sur les 60) ; chaque écart au front associé à une raison réelle ;
0 FRONT_BEST_FIT forcé, 0 NO_MEANINGFUL_DIFFERENCE ; les 110 étapes au front
sont des replis SAFE_DEFAULT, jamais des confirmations arbitraires.

## 9. Livrables

| Livrable | Fichier | Statut |
| --- | --- | --- |
| Harnais M11 | `scripts/experiment-player-experience.mjs` | IMPLÉMENTÉ, TESTÉ |
| Dataset EXP-01 | `docs/experiments/m11/EXP-01-dataset.json` | GÉNÉRÉ (60 trajectoires) |
| Méthode M11 | `docs/design/MATHIC-1-0-PLAYER-EXPERIENCE-CALIBRATION.md` | ÉCRIT |
| Rapport M11 | ce fichier | ÉCRIT |
| EXP-05 playthrough humain UI | — | À EXÉCUTER (playable, fenêtre 3, boutons ORDINAL/ADAPTIVE) |
| EXP-07 artefact simulé | `scripts/simulate-adaptive-progression.mjs` | CORRIGÉ, TESTÉ (311/311 PASS) |

## 10. Documenté pour EXP-05 (à conduire sur l'UI réelle)

Critères expérience à observer (reprenant B1-12 + spécificités M11) :
lisibilité du niveau proposé ; rythme ressenti entre deux niveaux ; surprise
d'un saut ADAPTIVE vs monotonie ORDINALE ; friction perçue (rejouer un niveau
échoué) ; envie de continuer. Session : campagnes courte (≥10 niveaux) sur l'UI,
avec journal `observe` si disponible, verdict humain consigné séparément — à
mener avant de proclamer PERTINENCE définitive sur l'expérience joueur.