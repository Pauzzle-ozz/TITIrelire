# CLAUDE.md — Guide de travail de l'agent

Ce fichier définit **comment travailler** sur le projet **TI'TIrelire**. Il est lu au
démarrage de chaque session. Il fait autorité : en cas de doute, ces règles priment sur
l'habitude.

> **Projet open source** — Apache License 2.0. Tout code, commentaire, message de commit et
> document produit doit être publiable publiquement, propre, et pensé pour des contributeurs
> extérieurs.

---

## ⚙️ Les 6 règles de travail (non négociables)

### Règle 1 — Ne jamais présumer, toujours auditer d'abord
À l'ouverture de **toute** nouvelle conversation, avant d'écrire la moindre ligne :
1. Charger le **contexte du projet** depuis la mémoire (`memory/MEMORY.md` et fichiers liés).
2. Auditer le code de la **zone de travail** concernée par la demande.
3. Auditer les **zones annexes** : ce qui appelle ce code, ce qu'il appelle, les tests
   associés, la config, les dépendances impactées.
4. Ne rien supposer sur l'état du code, les conventions ou l'intention : **vérifier dans les
   fichiers**. Si une information manque et bloque une décision, la demander.

### Règle 2 — Planifier avant de coder
Avant d'implémenter, produire un **plan structuré** découpé en étapes :
- Objectif clair de chaque étape et critère de « terminé ».
- Ordre logique et dépendances entre étapes.
- Fichiers/zones touchés et risques identifiés.

Le plan est partagé et validé **avant** l'implémentation. Utiliser une todo-list pour le
suivre visiblement.

### Règle 3 — Segmenter le travail, finir à 100 %
Chaque étape du plan est traitée **isolément** et menée jusqu'à **complétion à 100 %** :
pas de code bâclé, pas de « TODO » laissé traîner, pas d'étape à moitié faite. On ne passe
à l'étape suivante que lorsque la précédente est réellement terminée et vérifiée.

### Règle 4 — Prouver par des tests unitaires
Tout code livré est **appuyé et vérifié par des tests unitaires**. Le but n'est pas de
cocher une case mais de **prouver que le code/l'outil fonctionne dans tous les cas de
figure** :
- cas nominal, cas limites, cas d'erreur, entrées invalides.
- les tests doivent passer (`vert`) avant de considérer une étape terminée.
- pas de test → pas « terminé ».

### Règle 5 — Pousser à chaque segment complété, puis vérifier le statut
Dès qu'une étape / un segment du plan est complété **et testé** :
1. `git add` + `git commit` avec un message clair et conventionnel.
2. `git push` vers le dépôt du projet.
3. **Vérifier le statut** (`git status`, retour du push, CI si présente) **avant** de passer
   à la suite.

### Règle 6 — Résumé de fin de session
Une fois le travail terminé dans son intégralité, clore la session par un **résumé** :
- outils / modules créés,
- modifications apportées,
- tests ajoutés et leur résultat,
- ce qui reste ouvert / prochaines étapes suggérées,
- mémoire mise à jour si nécessaire.

---

## 🔁 Boucle de travail type (résumé opérationnel)

```
1. AUDIT      → charger la mémoire + lire le code (règle 1)
2. PLAN       → découper en étapes vérifiables (règle 2)
   └─ pour chaque étape :
3. CODE       → implémenter proprement, 100 % (règle 3)
4. TEST       → écrire/lancer les tests unitaires jusqu'au vert (règle 4)
5. PUSH       → commit + push + vérifier le statut (règle 5)
6. RÉSUMÉ     → bilan de fin de session (règle 6)
```

---

## 🧭 Conventions du projet

> La stack technique n'est pas encore figée. Cette section sera complétée dès que l'idée du
> projet et le langage seront choisis. Les principes ci-dessous s'appliquent quoi qu'il
> arrive.

### Qualité de code
- Code lisible, cohérent avec l'existant (nommage, style, densité de commentaires).
- Pas de code mort, pas de secrets en dur, pas de `console.log`/prints de debug oubliés.
- Petites unités testables plutôt que gros blocs monolithiques.

### Langue
- **Code, noms de symboles, messages de commit, docs publiques (README, etc.) : en anglais**
  (convention open source, portée internationale).
- **Échanges dans la conversation et CLAUDE.md : en français** (langue de travail).

### Commits (Conventional Commits)
Format : `type(scope): description courte à l'impératif`
Types : `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `ci`, `perf`, `build`.
Exemple : `feat(wallet): add balance calculation with edge-case handling`

### Branches & PR
- `main` = branche stable, toujours fonctionnelle (tests au vert).
- Travail sur branches dédiées quand pertinent ; PR décrivant le quoi/pourquoi.
- Rien n'est mergé si les tests ne passent pas.

### Tests
- Chaque fonctionnalité ou correctif s'accompagne de ses tests.
- Viser une couverture utile (chemins critiques, cas limites), pas un chiffre cosmétique.
- La commande de test sera documentée ici dès la stack choisie.

### Sécurité
- Aucune donnée sensible (clés, tokens, données perso) commitée. Voir `.gitignore` et
  `SECURITY.md`.
- Valider/nettoyer toute entrée externe.

---

## 📂 Repères du dépôt

| Fichier / dossier      | Rôle                                                        |
|------------------------|-------------------------------------------------------------|
| `README.md`            | Présentation publique du projet                             |
| `CLAUDE.md`            | Ce guide — règles de travail de l'agent                     |
| `CONTRIBUTING.md`      | Comment contribuer                                          |
| `CODE_OF_CONDUCT.md`   | Règles de comportement de la communauté                     |
| `SECURITY.md`          | Politique de signalement des vulnérabilités                 |
| `CHANGELOG.md`         | Historique des versions                                     |
| `LICENSE` / `NOTICE`   | Licence Apache 2.0 et mentions                              |
| `.github/`             | Templates d'issues et de pull requests                      |
| `memory/`              | Mémoire persistante de l'agent (contexte projet)            |

---

## 📝 Notes vivantes

_Section à enrichir au fil du projet : décisions d'architecture, pièges connus, commandes
utiles. Tenir à jour — un CLAUDE.md à jour évite de re-présumer (règle 1)._

- **Idée du projet :** outil open source de comptabilité / déclaration fiscale / optimisation,
  « simple et transparent de la saisie au résultat ». **V1** = simulateur micro-entrepreneur
  (indépendants), local-first.
- **Stack :** TypeScript (ESM) + [publicodes](https://publi.codes) pour les règles fiscales
  (transparence native, règles séparées du code) + Vite (UI locale) + Vitest (tests).
- **Commande de test :** `npm test` (typecheck : `npm run typecheck`).
- **Commande de build/run :** `npm run dev` (app locale) · `npm run build` (statique → `dist/`).
- **Repères code :** moteur `src/engine/` (règles `rules.ts`, `simulate.ts`, `compare.ts`),
  UI `src/ui/`, paramètres sourcés `docs/parameters-2026.md`.
- **Piège fiscal :** les paramètres (taux, plafonds, barème) sont datés **2026** et changent à
  chaque loi de finances — les mettre à jour dans `rules.ts` + `docs/parameters-2026.md`.
