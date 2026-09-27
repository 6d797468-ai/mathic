# MATHIC 1.0 — Décision de gouvernance M11-DEFER

**Statut** : DÉCISION D'ARCHITECTURE · **Date** : 2026-09-25 · **Source** : décision unanime de l'équipe projet, post-audit M17/M18.

**Contexte** : EXP-05 (validation humaine de M11) n'a pas été exécutée. Le report est **délibéré**, jamais un échec technique du système adaptatif.

---

## 0. Principe directeur

> **La preuve automatisée valide le système. La preuve humaine valide l'expérience.**

Ces deux preuves restent **séparées**. Leur séparation est une règle de gouvernance, non une option.

---

## 1. Statut M11

```text
M11.automated = PROVEN
M11.simulation = PROVEN
M11.human     = DEFERRED   (EXP-05 → Calibration humaine intégrée post-M21)
M11.closed    = FALSE      (ne devient CLOSED qu'après observation humaine)
```

EXP-05 est transférée vers une **Calibration Humaine Intégrée post-M21**. M11 n'est pas `FAILED`. M11 n'est pas `CLOSED`. Il est `TECHNICALLY PROVEN / HUMAN VALIDATION DEFERRED`.

Le report de EXP-05 **ne bloque pas** M18–M21. M21 ne peut pas servir d'excuse pour supprimer la validation humaine.

---

## 2. Condition de levée (M11 → CLOSED)

M11 ne devient véritablement `CLOSED` qu'après qu'une observation humaine instrumentée ait produit :

1. une trace de session ;
2. l'identification des comportements observés ;
3. les anomalies UX/gameplay éventuelles ;
4. un verdict explicite :
   - `GAMEPLAY_FREEZE` (accepté), ou
   - `TARGETED_RETURN` (anomalie → correction ciblée).

---

## 3. Interdictions liées au report

Le report d'EXP-05 ne doit provoquer :

* aucune modification opportuniste du moteur de jeu ;
* aucune modification des règles pour "faciliter" la calibration ;
* aucun ajustement de seuil pendant l'observation ;
* aucune simulation de joueur humain par le code ;
* aucune fermeture artificielle de M11.

Le build observé doit être **traçable, reproductible et gelé** pendant chaque vague.

---

## 4. Checkpoint humain précoce

### Placement
Au premier build suffisamment intégré **avant le gel final de M20**, sans attendre M21.

### Objectif
Détecter un éventuel défaut **fondamental** (et seulement ceux-ci) :

* compréhension spontanée ;
* compréhension de la boucle ;
* capacité à effectuer les premières actions ;
* perception du résultat ;
* volonté spontanée de continuer.

### Sortie
```text
SIGNAL-GO        → continuer M18 → M19 → M20
SIGNAL-NO-GO     → TARGETED RETURN → corriger le défaut fondamental → reprise
```

### Ce checkpoint n'est PAS
* une fermeture de M11 ;
* une certification UX ;
* une calibration complète ;
* une validation finale.

---

## 5. Chaîne d'événement attendue

```text
                    M11
                     │
        TECHNICAL PROVEN / HUMAN DEFERRED
                     │
            [CHECKPOINT SIGNAL pré-M20]
                     │
                     ▼
                  M18  (Saga)
                     │
                     ▼
                  M19  (Maggeek / Momo)
                     │
                     ▼
                  M20  (Polish)
                     │
                     ▼
                  M21  (Device QA)
              BUILD FREEZE
                     │
         ┌───────────┴───────────┐
         ▼                       ▼
      HG-01                   HG-02
      Signal                Cohérence
         │                       │
         └───────────┬───────────┘
                     ▼
                   HG-03
             Calibration finale
                     │
          ┌──────────┴──────────┐
          ▼                     ▼
   GAMEPLAY_FREEZE       TARGETED_RETURN
          │                     │
          ▼                     └──→ correction ciblée
         M22                         │
          │                          └──→ re-test HG-03 (axes concernés)
          ▼
      RELEASE CANDIDATE
```

---

## 6. Calibration Humaine Intégrée

### 6.1 — HG-01 : Signal

* **Population** : 1 joueur
* **Durée** : 20–30 min
* **Axes** :
  - A. FTUE / compréhension
  - B. gameplay fondamental
  - P. envie de continuer
* **Sortie** : `PASS` / `TARGETED RETURN`.

### 6.2 — HG-02 : Cohérence

* **Population** : 3 joueurs
* **Build** : M20 ou pré-RC M21
* **Objectif** : vérifier que les couches du jeu forment une expérience compréhensible et cohérente.
* **Axes** :
  - C. formules · D. décisions · E. chaînes · F. score · G. étoiles · H. Saga · I. déblocages · K. Momo
* **Sortie** : `COHERENCE-PASS` / `TARGETED RETURN`.

### 6.3 — HG-03 : Calibration finale

* **Population** : 5 joueurs
* **Build** : M21 final
* **Durée** : 5 × 45 min = 3 h 45 + 45 min consolidation = 4 h 30
* **Axes** (17) :
  - A. FTUE · B. Gameplay · C. Formules · D. Décisions · E. Chaînes · F. Score · G. Étoiles · H. Saga · I. Unlocks · J. Adaptation · K. Momo · L. Replay · M. Friction · N. Mobile · O. Performance perçue · P. Continue · Q. Replay

### 6.4 — Hiérarchie des observations

| Niveau | Exemples | Traitement |
|---|---|---|
| **Niveau 1 — Critical** | incompréhension, blocage, feedback contradictoire, perte d'état, crash mobile | `TARGETED RETURN` |
| **Niveau 2 — Major** | compréhension lente, score mal interprété, navigation confuse, Momo peu utile, rythme incohérent | correction ciblée |
| **Niveau 3 — Minor** | animation, micro-feedback, friction mineure | traitement avant/après freeze selon impact |

---

## 7. Instrument

Le code **prépare** la calibration. Le code **ne fabrique pas** la calibration.

### Trace structurée (champs techniques — remplis par le code)
```json
{
  "session_id": "...",
  "player_id": "...",
  "build": "...",
  "device": "...",
  "level": "...",
  "timestamp": "...",
  "action": "...",
  "outcome": "...",
  "retry": false,
  "help_requested": false,
  "abandoned": false
}
```

### Couche qualitative (champ **humain** — jamais rempli par le code)
```text
OBSERVED_BEHAVIOR
PLAYER_COMMENT
OBSERVER_NOTE
ISSUE
SEVERITY
HYPOTHESIS
```

**Interdit** : le système ne doit jamais remplir artificiellement :
*"understood_spontaneously": true* · *"wanted_to_replay": true*

Ces champs viennent de l'humain.

---

## 8. Rapport de calibration (séparation stricte des preuves)

```text
PROVEN BY CODE          ← M1–M10, M12–M18 (logique, intégration, E6)
PROVEN BY SIMULATION    ← M11 (EXP-01/03/04/06, trajectoires bot)
OBSERVED BY HUMAN       ← EXP-05 / HG-01..03 (compréhension, souhait, frustration)
NOT YET PROVEN          ← rétention longue durée, supériorité pédagogique
```

La calibration humaine doit avoir le droit de **contredire** les preuves techniques. C'est précisément pour cela qu'elle reste indépendante du codeur.

---

## 9. Décision pré-M22

Après HG-03 :

```text
Cas A : aucun défaut Critical / pas de défaut Major systémique / boucle jouable
     → GAMEPLAY_FREEZE → M22

Cas B : défauts Major précisément localisés
     → TARGETED RETURN → correction ciblée → re-test HG-03 (axes concernés)

Cas C : défaut fondamental
     → NO-GO → retour architecture/gameplay → M22 interdit
```

---

## 10. Position finale

> **Nous ne cherchons pas à prouver que MATHIC est agréable.**
>
> **Nous construisons suffisamment de preuves pour savoir honnêtement s'il l'est — pour qui, à quel endroit, et avec quels défauts résiduels.**

```text
MATHIC 1.0
TECHNICALLY PROVEN
DEVICE PROVEN
HUMAN OBSERVED
GAMEPLAY FROZEN
RELEASE CANDIDATE
```
