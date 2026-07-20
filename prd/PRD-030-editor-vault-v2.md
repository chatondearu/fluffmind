# PRD-030 — Éditeur v2, frontmatter, navigation contextuelle & nouveaux blocs

- **Status**: shipped
- **Date**: 2026-07-12
- **Shipped**: 2026-07-12 — PR [#118](https://github.com/chatondearu/fluffmind/pull/118) (P0–P3; DnD #106 closed earlier)
- **Tags**: #product #ux #editor #vault
- **Depends on**: PRD-024 (block editor), PRD-029 (sidebar v1 — shipped)
- **GitHub**: [Epic #117](https://github.com/chatondearu/fluffmind/issues/117) · [Milestone PRD-030](https://github.com/chatondearu/fluffmind/milestone/9) · Plan [[../plans/PLAN-030-editor-vault-v2|PLAN-030]]

## Problem

L’éditeur Notion-like et la sidebar v1 couvrent l’édition bloc-à-bloc et la navigation de base, mais plusieurs workflows PKM restent incomplets ou fragiles :

1. **Pas de vue source** — impossible d’éditer le markdown brut ou le frontmatter depuis l’UI.
2. **Frontmatter perdu à la sauvegarde** — `useNoteAutosave` n’envoie que le body ; `writeToWorkspace` écrase le fichier sans réinjecter le YAML.
3. **Raccourcis clavier limités** — pas de suppression rapide de bloc (`Del` / `Suppr`).
4. **Drag & drop instable** — réordonnancement HTML5 natif peu fiable selon les navigateurs et le focus.
5. **Sidebar bruyante** — boutons `+` partout ; pas de menu contextuel riche (rename, move, delete).
6. **Blocs manquants ou incomplets** — pas de bloc « lien vers note », listes mono-item, tables peu ergonomiques.

## Goals

- [x] Basculer entre **mode blocs** et **mode markdown source** sur une note
- [x] Éditer **frontmatter** (tags, description, champs custom) sans quitter la note
- [x] Raccourcis clavier cohérents pour **supprimer / fusionner** des blocs
- [x] **Stabiliser** le drag & drop des blocs
- [x] Refondre la **sidebar** : menu `⋯` au hover (dossier / note) à la place des boutons `+`
- [x] Nouveau bloc **lien vers note** (`[[wikilink]]`)
- [x] **Listes** : Enter crée un item suivant (puces par défaut)
- [x] Nouveau bloc **tableau** éditable (HTML → markdown table)

## Non-goals (v1 de ce PRD)

- Éditeur WYSIWYG inline (gras/italique sans markdown)
- CRDT / édition collaborative temps réel
- Drag & drop de notes/dossiers dans la sidebar (API move — prévu mais phase séparée)
- Schéma frontmatter imposé par le workspace (reste un bag YAML libre)
- Listes imbriquées (Tab / Shift+Tab) — follow-up v1.1
- Tableaux avec formules, fusion de cellules, import CSV

## Users & scenarios

| Persona | Scenario |
| ------- | -------- |
| Utilisateur Obsidian / Foam | Ouvre une note, bascule en markdown pour corriger du YAML ou du tableau brut |
| Rédacteur | Ajoute tags + description en frontmatter sans éditeur externe |
| Utilisateur clavier-first | Supprime un bloc avec `Del`, fusionne un bloc vide avec `Suppr` |
| Organisateur vault | Renomme / déplace / supprime un dossier via menu `⋯` |
| PKM | Insère un lien `[[projet/roadmap]]` comme bloc dédié |
| Prise de notes rapide | Dans une liste, Enter enchaîne les puces |

---

## Epic A — Vue markdown source éditable

### Contexte technique

- Sérialisation : `serializeDocument()` (`packages/editor-blocks`)
- Parse : `parseMarkdownToDocument()` + `gray-matter` côté vault (`apps/web/server/vault/parser.ts`)
- Page note : `apps/web/app/pages/notes/[...slug].vue`

### Requirements

- [x] **Toggle** « Markdown » dans la barre de la note (à côté du statut autosave)
- [x] Mode **source** : textarea ou éditeur monospace pleine largeur avec le **fichier complet** :
  - Frontmatter YAML (si présent)
  - Body markdown (sans ré-injection du H1 titre si on choisit de garder le titre UI séparé — voir Open questions)
- [x] Bascule **blocs → source** : sérialiser l’état courant (titre + blocs) en markdown
- [x] Bascule **source → blocs** : parser le contenu ; erreurs de parse affichées inline (ne pas perdre le texte)
- [x] Autosave en mode source : debounce identique à `useNoteAutosave`
- [x] Conserver le **même chemin d’écriture** (`PUT /api/notes/:id` → `writeToWorkspace`)

### Acceptance criteria

- Éditer un heading en markdown source se reflète en mode blocs après bascule
- Round-trip d’un échantillon fixture `round-trip.test.ts` inchangé

---

## Epic B — Édition frontmatter (tags, description, champs custom)

### Contexte technique

- Frontmatter lu via `GET /api/notes/:id` → `note.frontmatter`
- **Gap critique** : sauvegarde actuelle n’inclut pas le frontmatter → régression sur tags/kanban

### Requirements

#### B1 — Persistance frontmatter (prérequis)

- [x] Étendre le contrat de sauvegarde :
  - Option A : `PUT { content, frontmatter }` (recommandé)
  - Option B : `content` = fichier complet avec YAML (plus simple, unifie avec Epic A)
- [x] `writeToWorkspace` / sérialisation : **réinjecter** le frontmatter avec `gray-matter` avant écriture
- [x] Ne jamais écraser des clés inconnues (merge shallow ou remplacement explicite du bag édité)

#### B2 — UI « Propriétés »

- [x] Bouton **Propriétés** (ou panneau latéral / dialog MD3) sur la page note
- [x] Champs v1 :
  - **Tags** : liste éditable (chips + input), sérialisées en `tags: [string]`
  - **Description** : textarea → clé `description` (string)
  - **Champs custom** : paires clé/valeur (string) ; types avancés en v1.1
- [x] Preview YAML read-only optionnelle pour power users
- [x] Kanban : si `kanban-plugin` présent, afficher badge read-only + lien board

### Acceptance criteria

- Note avec `tags: [foo]` ouverte → tag visible → sauvegarde → rechargement → tag intact
- Board kanban conserve son frontmatter après édition du body

---

## Epic C — Raccourcis clavier blocs

### Contexte technique

- Clavier centralisé dans `EditableSurface.vue` + `BlockEditor.vue`
- Suppression existante : toolbar + `handleBackspaceEmpty` (fusion avec bloc précédent)

### Requirements

| Raccourci | Contexte | Comportement |
| --------- | -------- | ------------ |
| `Delete` (`Del`) | Bloc focus, **non vide** | Supprimer le bloc courant ; focus sur bloc précédent (fin du texte) ou suivant si premier bloc |
| `Backspace` (`Suppr`) | Bloc focus, **vide** | Supprimer le bloc ; focus sur bloc précédent au **dernier caractère** (comportement Notion) |
| _(existant)_ | `Backspace` vide, bloc non seul | Fusion avec précédent (conserver ou aligner sur spec ci-dessus) |

- [x] Ne pas intercepter si sélection de texte non collapsed (comportement natif)
- [x] Ne pas déclencher en mode slash menu ouvert
- [x] Documenter raccourcis dans un tooltip « ? » discret

### Acceptance criteria

- `Del` sur un paragraphe avec texte supprime le bloc entier
- `Suppr` sur bloc vide place le curseur à la fin du bloc du dessus

---

## Epic D — Stabilisation drag & drop blocs

### Contexte technique

- Implémentation actuelle : HTML5 DnD natif sur poignée `⋮⋮` (`BlockEditor.vue`)
- Preview via `visibleBlocks` computed

### Problèmes observés (hypothèses)

- Indices instables pendant le drag (`blockIndexForRender` recalculé)
- Conflit focus / blur / re-render pendant le drag
- Hitbox petite ; gap entre poignée et zone de drop
- Pas de feedback ghost under cursor (preview in-list seulement)

### Requirements

- [x] Audit repro : Firefox / Chromium / Zen — documenter cas de échec
- [x] **Option 1 (v1)** : corriger l’implémentation actuelle
  - Pointer stable par `block.id` (pas index) pour source et cible
  - Désactiver promotion markdown + autosave churn pendant `isDragging`
  - Zone de drop = ligne entière du bloc
- [x] **Option 2 (v1.1 si insuffisant)** : `@vueuse/integrations/useSortable` ou `@dnd-kit` (accessibilité clavier)
- [x] Tests manuels checklist + test unitaire pur sur fonction `reorderBlocks(ids, from, to)`

### Acceptance criteria

- 10 réordonnancements consécutifs sans saut de focus ni duplication de blocs
- Drag d’un bloc de longueur variable (code, titre) reste prévisible

---

## Epic E — Sidebar : menu `⋯` contextuel (remplace les `+`)

### Contexte technique

- Composants : `VaultSidebar.vue`, `VaultTreeItem.vue`, `VaultAddMenu.vue`
- APIs : `POST /api/folders`, `POST/PUT /api/notes` — **pas** de DELETE / PATCH move / rename

### Requirements

#### E1 — UI

- [x] **Retirer** les boutons `+` / `VaultAddMenu` inline
- [x] Au **hover** d’une ligne dossier ou note : icône `⋯` (MD3 `FluffmindIconButton`)
- [x] Menu dropdown MD3 ancré à la ligne

#### E2 — Actions dossier

| Action | v1 | API / impl |
| ------ | -- | ---------- |
| Nouvelle note | ✅ | `navigateTo /notes/new?folder=` |
| Nouveau sous-dossier | ✅ | `POST /api/folders` (existant) |
| Renommer dossier | ✅ | **Nouveau** `PATCH /api/folders/:path` (rename Git) |
| Déplacer dossier | ⏳ v1.1 | Move bulk notes + marker |
| Supprimer dossier + notes | ✅ | **Nouveau** `DELETE /api/folders/:path?recursive=1` avec confirmation dialog |

#### E3 — Actions note

| Action | v1 | API / impl |
| ------ | -- | ---------- |
| Ouvrir | ✅ | navigation existante |
| Renommer | ✅ | **Nouveau** `PATCH /api/notes/:id` `{ newId }` |
| Déplacer | ✅ | **Nouveau** `PATCH /api/notes/:id` `{ folder }` ou rename id |
| Supprimer | ✅ | **Nouveau** `DELETE /api/notes/:id` |

- [x] Dialogs de confirmation pour suppressions (mentionner nombre de notes si dossier)
- [x] Refresh arbre via `refreshVaultNotes()` après chaque mutation

### Non-goals sidebar v2

- Menu clic droit (contextmenu natif) — hover `⋯` suffit en v1
- Multi-sélection

---

## Epic F — Nouveau bloc : lien vers note / page

### Contexte technique

- Modèle inline : `wikilink` dans `packages/editor-blocks` (parse/serialize)
- Pas de block type dédié aujourd’hui

### Requirements

- [x] Block type `noteLink` (ou réutiliser paragraphe spécialisé) :
  - Affichage : titre de la note cible + icône lien
  - Édition : autocomplete sur les ids/titres du vault (`GET /api/notes`)
  - Sérialisation : `[[note-id]]` ou `[[note-id|label]]`
- [x] Slash command : `/ lien`, `/ link`, `/ note`
- [x] Toolbar type : entrée « Lien note »
- [x] Clic : navigation vers `/notes/:id` (mode lecture dans l’éditeur — ouvrir sans quitter, v1.1)

### Acceptance criteria

- Round-trip markdown wikilink via bloc dédié
- Lien cassé (note inexistante) : affichage grisé + option corriger

---

## Epic G — Listes : Enter = item suivant (puces par défaut)

### Contexte technique

- `ListBlock.vue` : **un seul** item éditable ; Enter → nouveau paragraphe (comportement global)
- mdast : listes multi-items supportées en import/export

### Requirements

- [x] Dans un bloc `bulletList` focus :
  - `Enter` → nouveau bloc `bulletList` **en dessous** (pas paragraphe)
  - Conserver la continuité visuelle (même puce `•`)
- [x] `Backspace` sur item vide : revenir au paragraphe ou fusionner avec item précédent (aligné Epic C)
- [x] Nouvelle liste via slash / toolbar : **puces par défaut** (`bulletList`, pas ordered)
- [x] v1 : liste plate (pas d’indentation Tab)

### Modèle de données

- Option A : un bloc = un item de liste (plus simple, aligné DnD actuel)
- Option B : un bloc = liste entière multi-items (plus fidèle mdast, plus complexe)

**Recommandation v1** : Option A — un bloc `bulletList` = un item ; Enter crée un autre bloc `bulletList`.

### Acceptance criteria

- Saisie « item 1 » Enter « item 2 » → 2 blocs liste sérialisés en `- item 1\n- item 2`

---

## Epic H — Nouveau bloc : tableaux HTML éditables

### Contexte technique

- `TableBlock.vue` existe (textarea markdown brut)
- Round-trip table GFM dans `round-trip.test.ts`

### Requirements

- [x] Block type `table` v2 :
  - Rendu : **table HTML** `contenteditable` ou grille `<table>` avec cellules éditables
  - Toolbar ligne/colonne : ajouter / supprimer
  - Navigation Tab entre cellules
- [x] Sérialisation : GFM pipe table via `blocks-to-markdown`
- [x] Parse : mdast `table` → structure interne (rows × cells)
- [x] Slash `/ table` + toolbar
- [x] Taille par défaut : 2×2 vide

### Acceptance criteria

- Table éditée en UI → rouvre identique en Obsidian
- Import d’un markdown table existant → rendu HTML éditable

---

## Cross-cutting — Non-functional

- [x] **Performance** : pas de re-render complet des blocs à chaque frappe (sentinel + focus déjà adressés — PR #105)
- [x] **Accessibilité** : menus `⋯` et toggles keyboard-reachable ; DnD v1.1 clavier
- [x] **i18n** : libellés FR (UI actuelle)
- [x] **Tests** :
  - Unit : serialize/parse nouveaux blocs, reorder, list Enter logic
  - E2E smoke : toggle markdown, edit frontmatter, sidebar rename

---

## Phasing (livré)

| Phase | Epics | Statut |
| ----- | ----- | ------ |
| **P0 — Correctifs & base** | D (DnD), C (raccourcis), B1 (persistance frontmatter) | shipped (#106 + commits P0) |
| **P1 — UX note** | B2 (UI frontmatter), A (vue markdown) | shipped (PR #118) |
| **P2 — Sidebar v2** | E (menu ⋯ + APIs rename/delete/move) | shipped (PR #118) |
| **P3 — Blocs** | G (listes), F (lien note), H (tables HTML) | shipped (PR #118) |

---

## Open questions

1. **Titre note vs H1 body** : en mode markdown source, affiche-t-on le titre UI comme H1 séparé ou fichier brut complet ?
2. **Clé description** : `description` vs `summary` — convention à documenter dans README vault
3. **Suppression dossier** : soft-delete (git) vs suppression définitive — confirmation + undo ?
4. **Bloc lien** : wikilink inline vs block dédié — les deux coexistent-ils ?
5. **DnD library** : patch natif vs migration `@dnd-kit` dès v1 ?
6. **`Del` vs `Suppr`** : mapping AZERTY — tester `Delete` et `Backspace` explicitement sur FR layout

---

## Success metrics

- 0 régression frontmatter sur notes taguées / kanban après Epic B1
- Temps médian pour renommer une note < 10 s (sidebar menu)
- 0 bug critique DnD sur checklist QA (3 navigateurs)
- ≥ 90 % des fixtures round-trip passent avec nouveaux blocs

---

## Implementation pointer

Plan consolidé (les sous-plans a–e n’ont pas été créés séparément) :

| Plan | Fichier | Scope |
| ---- | ------- | ----- |
| PLAN-030 | `plans/PLAN-030-editor-vault-v2.md` | Epics A–H (P0–P3) — shipped |

### Fichiers code probablement touchés

```
apps/web/app/pages/notes/[...slug].vue
apps/web/app/composables/useNoteAutosave.ts
apps/web/app/components/VaultTreeItem.vue
apps/web/app/components/VaultSidebar.vue
apps/web/server/api/notes/
apps/web/server/api/folders/
apps/web/server/vault/write.ts
packages/editor-blocks/src/components/BlockEditor.vue
packages/editor-blocks/src/components/blocks/ListBlock.vue
packages/editor-blocks/src/components/blocks/TableBlock.vue
packages/editor-blocks/src/register-defaults.ts
packages/editor-blocks/src/slash-commands.ts
```

---

## GitHub issues (all closed — reconciled 2026-07-20)

| # | Issue | Phase | Status |
| - | ----- | ----- | ------ |
| [#106](https://github.com/chatondearu/fluffmind/issues/106) | `fix(editor): stabilize block drag-and-drop by block id` | P0 | closed |
| [#107](https://github.com/chatondearu/fluffmind/issues/107) | `feat(editor): keyboard delete empty/non-empty blocks` | P0 | closed |
| [#108](https://github.com/chatondearu/fluffmind/issues/108) | `fix(vault): preserve frontmatter on note save` | P0 | closed |
| [#109](https://github.com/chatondearu/fluffmind/issues/109) | `feat(notes): frontmatter properties panel (tags, description, custom)` | P1 | closed |
| [#110](https://github.com/chatondearu/fluffmind/issues/110) | `feat(notes): markdown source view toggle` | P1 | closed |
| [#111](https://github.com/chatondearu/fluffmind/issues/111) | `feat(sidebar): hover ⋯ context menu for folders and notes` | P2 | closed |
| [#112](https://github.com/chatondearu/fluffmind/issues/112) | `feat(api): note rename, move, delete` | P2 | closed |
| [#113](https://github.com/chatondearu/fluffmind/issues/113) | `feat(api): folder rename, recursive delete` | P2 | closed |
| [#114](https://github.com/chatondearu/fluffmind/issues/114) | `feat(blocks): note link block with vault autocomplete` | P3 | closed |
| [#115](https://github.com/chatondearu/fluffmind/issues/115) | `feat(blocks): list Enter creates next bullet block` | P3 | closed |
| [#116](https://github.com/chatondearu/fluffmind/issues/116) | `feat(blocks): HTML editable table block` | P3 | closed |
| [#117](https://github.com/chatondearu/fluffmind/issues/117) | epic PRD-030 | — | closed |
