# Feature recommendations

This is a review of the current Spark codebase (`src/`, `src-tauri/`,
`scripts/`) with a prioritized list of features worth adding next. Every
recommendation was filtered through the constraint in `CLAUDE.md`: *"the
only chrome is one slim toolbar ... plus a faded status bar. New features
must not add further chrome."* Nothing below proposes a new persistent
button, panel, or bar. Each item is one of:

- pure logic/behavior with no UI at all,
- a **transient overlay** that appears on demand and disappears — the app
  already has this pattern (the inline commit-message input in
  `src/main.ts` that replaces the git status text when you click it),
- content added inside an **existing** panel (status bar, sidebar), or
- a **shortcut-only** feature with no visible control — the app already has
  one of these too (⇧⌘O "open folder" has no toolbar button today).

Recommendations are grouped by how cheap they are given what's already
installed in `package.json` / `Cargo.toml`.

## Tier 1 — zero new chrome, cheap wins

These use libraries already present in the project.

- **Real image embedding in DOCX export.** `docx` (already a dependency) has
  an `ImageRun` type, but `src/export-docx.ts` doesn't use it — images
  currently degrade to italic alt-text only. Since this is a "distraction-free
  markdown → Word" pipeline, a document with images exporting without them
  is a real gap. Fetch/decode the image (local path via `plugin-fs`, or a
  data URL already in the doc) and emit an `ImageRun` instead of the
  alt-text fallback.

- **Native OS spellcheck.** Entirely absent today — the editor sets no
  `spellcheck` behavior. CodeMirror 6's DOM content is editable text; wiring
  the browser's native spellcheck (as used by `src/editor.ts`'s
  `EditorView`) is a small config change with squiggly-underline feedback
  the OS already renders — no new UI.

- **Reload-on-external-change.** `src/file.ts` has no watcher, and
  `src-tauri/Cargo.toml` has no `notify` crate — if a file is edited outside
  Spark, a save silently clobbers it. Detect external edits (via the
  `notify` crate + a Tauri event, or a focus-time mtime check next to the
  existing `refreshGit()` focus-debounce in `main.ts`) and reuse the
  existing status-bar flash mechanic (`flashGit`-style transient message in
  `statusGitEl`/`statusWordsEl`) to prompt reload — no new UI element, just
  reusing the transient-message pattern that already exists.

- **Autosave / crash recovery.** There's no autosave — only explicit ⌘S,
  with a close-confirm dialog if dirty. Periodically write the buffer to a
  recovery slot (a sidecar temp file, or `localStorage` for small docs) and
  offer to restore it on next launch if the app didn't exit cleanly. The
  existing dirty-dot in the status bar (`updateStatus` in `main.ts`) needs
  no changes.

- **Sync-scroll between editor and preview.** `#editor` and `#preview` are
  already flex-siblings rendered side-by-side when preview is open (see
  `index.html` / `styles.css`) — this isn't an overlay toggle, it's a real
  split view. But scroll position isn't mirrored between them today. Adding
  proportional scroll sync in `src/preview.ts`/`main.ts` is pure behavior,
  zero chrome.

- **Frontmatter (YAML) handling.** `marked` (used in `src/preview.ts`) has
  no built-in frontmatter support, so a leading `---\n...\n---` block
  currently renders as a raw thematic break plus body text in both the
  preview and the DOCX export. Detect and strip/style it in
  `renderPreview()`, and skip or render it as a small metadata block in
  `markdownToDocx()`.

## Tier 2 — reuse the existing overlay/panel pattern

### Command palette (⌘K) — the flagship recommendation

A single new keyboard shortcut opens a transient overlay styled like the
existing inline commit-message input, listing fuzzy-searchable actions.
This is the mechanism that lets Spark keep growing capability *without*
growing permanent chrome: every feature below that would otherwise need its
own toolbar button or panel can instead be a palette entry, and any future
feature request can go through the same door instead of asking "where does
the button go."

Actions the palette makes possible without new UI:

- **Find/replace** — wire up CodeMirror's official `@codemirror/search`
  package (not yet a dependency, but the same family as the already-used
  `@codemirror/lang-markdown`/`@codemirror/language-data`). Its search panel
  is itself a transient overlay, invocable from the palette or bound
  directly to ⌘F. This is a notable gap today — there is no find/replace
  anywhere in the app.

- **Jump to heading (outline/TOC).** Parse the current document's headings
  on demand and list them in the palette; selecting one scrolls/jumps the
  editor. No outline UI exists today.

- **Recent files.** Persist a short MRU list under a new `localStorage` key
  (following the existing pattern of `"theme"` in `src/theme.ts` and
  `"explorer-root"` in `src/explorer.ts`). Surface it via the palette, and
  also show it in the sidebar's current empty state — `src/explorer.ts`'s
  `renderTree()` shows a bare "Open Folder…" placeholder when no root is
  set; a recent-files list there reuses the existing sidebar panel instead
  of adding a new one. There is currently no persistence of recently opened
  files at all.

- **Git branch switch / basic diff view.** `src-tauri/src/git.rs` today only
  exposes `git_status`, `git_commit`, and `git_push` — no branch listing,
  checkout, or diff. Add `git_branches`/`git_checkout` and a `git_diff`
  command (following the existing `git()` helper and porcelain-parsing
  pattern already tested in `git.rs`), exposed as palette actions. A diff
  can render in the existing preview pane (as a code block) rather than a
  new viewer.

- **Theme picker (list, not just cycle).** `src/theme.ts` already defines 5
  themes (`auto`/`light`/`dark`/`grey`/`ocean`) cycled one-at-a-time via
  ⇧⌘T. A palette entry listing all five and jumping straight to one is a
  small addition on top of `cycleTheme()`/`apply()`, no new button.

## Tier 3 — larger lift, or explicitly scoped against the chrome constraint

- **Math (KaTeX) and Mermaid rendering in the preview.** Opt in via a fenced
  code block's language tag (` ```math`, ` ```mermaid`), the same mechanism
  `src/preview.ts` already uses for `highlight.js` syntax highlighting via
  `marked-highlight`. No chrome — it's a rendering-pipeline addition, gated
  by `DOMPurify.sanitize()` as it is today.

- **Focus/typewriter mode.** A shortcut-only toggle (no visible button,
  following the ⇧⌘O precedent) that centers the active line in
  `src/editor.ts`'s `EditorView` and dims non-active paragraphs via a CM6
  decoration — no new UI surface.

- **Multi-document / tabs — explicitly *not* recommended as a tab bar.** A
  tab strip is exactly the kind of persistent chrome `CLAUDE.md` rules out.
  The underlying need — switching between files quickly — is already
  covered by the Tier 2 command palette plus recent-files list, which gets
  the same outcome without adding a permanent UI element.

## Secondary note (not a feature, surfaced during review)

The smoke-test scripts (`scripts/smoke-*.ts`) give solid coverage of the
pure-logic modules (`format.ts`, `prettify.ts`'s `diffRegion`, the
highlight pipeline, `export-docx.ts`'s happy path) and `src-tauri/src/git.rs`
has unit tests for its porcelain-v2 parser — but there's no CI config and no
coverage of `main.ts`, `file.ts`, `explorer.ts`, `theme.ts`, `terminal.ts`,
or the `pty.rs`/`git_commit`/`git_push` command bodies. Worth a mention
since it surfaced during this review, though it's a testing gap rather than
a feature.
