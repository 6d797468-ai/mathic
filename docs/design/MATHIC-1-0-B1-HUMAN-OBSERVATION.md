# MATHIC 1.0 — Protocole de validation humaine du slice B1

**Statut** : PRÊT À EXÉCUTER · **Slice figé** : commit `189f377` (aucune modification gameplay avant verdict).
**Objet** : mesurer, pas juger. Le slice est un instrument ; le code ne doit pas être modifié pour orienter l'observation. Aucune correction de balance ne peut être présentée comme une validation tant que l'humain n'a pas joué.

## À observer (par niveau, 12 points — B1-A à B1-F)

1. compréhension **spontanée** de l'objectif ;
2. temps avant le **premier coup** (`firstMoveMs`, automatique via `observe.mjs`) ;
3. compréhension de la **formule** (`a op b`, 3 cellules) ;
4. compréhension de la **transformation** (3→1, ancrage A) ;
5. compréhension de **l'état du board après le coup** (ce qui reste, ce qui disparaît) ;
6. choix **immédiat vs préparation** ;
7. perception des **conséquences futures** (ressources restantes, états post-coup) ;
8. perception du **score** (base + bonus objectif) ;
9. perception de la **chaîne** (réutilisation d'un résultat) ;
10. **erreurs et rejets** (`rejected`, `reason`) ;
11. **abandon éventuel** ;
12. **envie de rejouer** (restarts / replay spontané).

## Règles de session

- Ordre : **b1-1 → b1-6**, une session par niveau, reprise possible.
- **Aucune explication préalable** : l'interface doit se comprendre seule (B1-A). L'observateur reste silencieux.
- Le joueur peut « penser à voix haute » (précieux) — à noter, sans interruption.
- Enregistrer chaque niveau avec l'instrument, puis consigner les observations qualitatives côté observateur.

## Lancement de la session instrumentée

```
node src/b1/observe.mjs b1-1 --out /tmp/opencode/b1-session.jsonl
```

Journal brut horodaté (ms) : `input` (tous, y compris erreurs de format) · `action` (expr, résultat, ancrage, delta, chaîne) · `reject` (expr, raison) · `undo` · `restart` · `blocked` · `end` · `summary` (applied, rejected, undos, restarts, **firstMoveMs**, waitingMs = inactivité entre saisies, won, score final).

Le `summary` s'ajoute en fin de session (ligne JSONL + stdout `[obs]`).

## Expérience prioritaire — b1-6 « La Chaîne » (signal `2+4=6 → 0 point`)

Le coup préparatoire rapporte **0 point** (base `|6|/10`). NE PAS corriger le score. Observer si le joueur :
- **comprend** que le coup est préparatoire ;
- **accepte volontairement** le faible rendement immédiat (sacrifice perçu) ;
- **perçoit** la chaîne future (le `+6` du 2ᵉ coup) ;
- ou considère le coup **inutile / injuste / incompréhensible**.

Indicateurs mesurables : l'*hésitation* après le coup à 0 point (écart `action`→`input` suivant), un éventuel `undo`, un abandon, un commentaire « pourquoi faire ça ? ».

## Gabarit du rapport de sortie (à remplir après la session)

`docs/design/MATHIC-1-0-B1-HUMAN-OBSERVATION.md` :

1. **Méta-session** : qui a joué, quand, environnement (terminal), nombre de sessions.
2. **Observations brutes** : le journal `summary` de chaque niveau (tableau) + captures verbatim.
3. **Comportements observés** : démarche, essais, tactiques, relecture du board…
4. **Difficultés de compréhension** : objectif / formule / transformation / état post-coup / score / chaîne.
5. **Décisions immédiat vs préparation** : où, comment, pourquoi (retenir les verbatim et les hésitations mesurées).
6. **Perception du score** (y compris le cas `0 point` de b1-6).
7. **Perception des chaînes** (y compris b1-6).
8. **Problèmes UX éventuels** (Interface, messages, ids de cellules…) — distincts des problèmes de design.
9. **Anomalies techniques distinctes des problèmes de design** (tout écart solver≡engine≡replay, rejet inattendu, capture, commit concerné).
10. **Hypothèses** : confirmées / infirmées / encore expérimentales (H-B1 · H-3→1 · H-AN · Combo N — rappel : aucune donnée combo en B1).
11. **Verdict final** — un binaire seulement :
    - **GAMEPLAY FREEZE** (noyau compris, décisions réelles observées, 5/6 niveaux joués jusqu'au bout, envie de rejouer présente) ; ou
    - **TARGETED RETURN** (liste ciblée : quoi, où, pourquoi ; aucune correction de balance présentée comme validation).

## Culture MATHIC — checklist de session (repasser à chaque niveau)

- □ La matière grise et la décision stratégique restent le cœur (pas de solution unique évidente).
- □ Plusieurs solutions aux conséquences différentes (S8 : l'état d'après compte).
- □ Les mathématiques restent exactes (zéro divergence Engine/Solver/Replay).
- □ L'évaluation temps réel existante est réutilisée, jamais dupliquée.
- □ Momo n'est pas le moteur mathématique (absent de B1).
- □ Aucune nouvelle mécanique fondamentale avant verdict.
- □ Aucune conclusion gameplay tirée des seuls tests automatisés.

---

## Règles de décision

- **Verrouiller** : le slice reste `189f377` + protocole jusqu'au verdict.
- **Ne pas corriger** le score ni le contenu avant l'observation humaine.
- Si verdict = **TARGETED RETURN** → décrire le retour ciblé, puis l'exécuter et **re-valider humainement** ; un retour ciblé n'est pas une extension de périmètre.
- Si verdict = **GAMEPLAY FREEZE** → c'est le moment de geler les mécaniques, pas de les enrichir.