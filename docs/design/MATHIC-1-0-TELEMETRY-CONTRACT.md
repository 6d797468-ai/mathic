# MATHIC 1.0 — Contrat A16 : Telemetry

**Référence** : BRIEF §17 (tableau de contrôle), §20 · **Consommé par** : runtime → émission · **Consomme** : A4, A5, A6, A7, A8, A14 · **Statut** : DESIGN (à valider).

La télémétrie **étudie le gameplay réel** (mandat §20) sans collecter de données personnelles inutiles. Elle est **local-first** (base+journal locale) et **déclenchable/exportable** — elle n'est jamais un prérequis de jeu.

---

## 1. Principes

1. **Minimal data** : rien d'identifiant (pas de nom, pas d'ID homothétique, pas de géoloc, pas d'IMEI/GAID). Un **identifiant de session** local, rotatif, non réactivable.
2. **Local-first** : les événements s'écrivent **localement** (tampon journalisé, taille bornée). L'envoi réseau peut s'effectuer **opt-in**, batché, signé pour non-corruption. **Par défaut : pas d'envoi** (le jeu et l'analyse fonctionnent intégralement offline ; l'envoi est un canal séparé futur-option).
3. **Observateur-pure** : la télémétrie ne décide jamais (elle n'influence ni GameState ni objectifs ni scores).
4. **Schéma versionné** (`telemetrySchemaVersion`), événements versionnés → les tableaux de bord restent lisibles après migration.

## 2. Événements opérationnels (liste normée, BRIEF §22 / §34)

```jsonc
level_started      { id, version, ruleVersion, seed }
move_made          { action }                // A3 §7 (formule)
formula_created    { expr }                  // formule validée et évaluée r ≠ null
formula_rejected   { expr, invalidation }    // catégorie A1 §7
transformation     { stateHash, anchor }     // A4 (mutation exécutée)
chain_started      { len=1 }
chain_extended     { len }                   // A5 : nouvelle longueur
combo_started      { trigger }               // A6 : événement math (REUSE/TARGET/…)
objective_progress { conditionId, status }   // A8 : conditions satisfied/… (niveau non gaz)
level_completed    { stars, score, chainLen, comboBest, moves, steps }
level_failed       { reason: move_limit | blocked | quit, score, moves }
hint_requested     { policyL, context }      // A14 : niveau d'indice demandé
hint_consumed      { policyL }
level_replayed     { id, from }              // A13 : replay → raison sous-jacente
```

Chaque événement porte `t` (temps de session), `sessionId`, et **aucune donnée de chemin personnel** : bien entendu l'action `move_made` porte la formule mathématique (nécessaire à l'étude) mais jamais d'informations d'appareil/position.

## 3. Granularité & volume

- Les événements par action, recomposables en **parties** (la trace refaites les transformations : `level_completed.traceRef`).
- Tampon borné (ex. 2000 événements) avec **priorité d'éviction** (les `move_made` multiples compressibles à l'agrégat par niveau si plein), journalisation de perte (`telemetry_overflow`).

## 4. Utilisation (tableau de contrôle BRIEF §17)

Ce qui devient **mesurable** :
- **Utilisation opérateurs** : fréquence par opérateur via `formula_created` (+/−/×/÷) → détection d'opérateur décoratif (A12 §3, BRIEF §17) ;
- **Rejection rate** : `formula_rejected` vs `formula_created` → compréhension des règles (péda) ;
- **Chaînes/combo** : `chain_*`, `combo_*` → intentionnalité des chaînes, fréquence des combos (A6) ;
- **Reliance Momo** : `hint_*` → déclin de recours (A14 §3) ;
- **Rejouabilité** : `level_replayed` (A13 §5) ;
- **Abandon/précoce** : `level_failed{reason=quit}` (A8 §3 blocked ≠ failed) ;
- **Stabilité/FPS** : hors scope événements (métrique plateforme, A20).

## 5. Exports & dashboards

- Export **JSONL local** (une ligne = un événement) — le data pipeline peut être branché plus tard (§21 extension) sans impact runtime.
- Dashboard d'analyse : agrégats par niveau/monde/opérateur, distributions, corrélations (usage opérateur × classe A12) — **outil hors-ligne de l'équipe** (dataset de certification), jamais un produit.

## 6. Anti-collecte (les limites)

- ❌ pas de données d'horloge absolue exploitable (t en temps relatif de session) ;
- ❌ pas de suivi multi-session réactivable (sessionRotatingId) ;
- ❌ pas de capture d'écran/sauvegarde de strings hors règles ;
- ❌ la télémétrie n'est **jamais** la source d'une décision de gameplay en cours de partie.

---

D-T1 — local-first + opt-in, identifiant de session rotatif (RGPD-friendly par défaut). D-T2 — les événements sont **rejouables** (traceRef) : un analyste peut rejouer une partie champ par champ à partir des logs (la traçabilité vraie). D-T3 — Cero impact on GameState (observateur pur). Opposables.