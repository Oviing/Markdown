# CLAUDE.md

## Project

"Spark" — a minimal, distraction-free markdown editor for macOS, built as a
Tauri 2 desktop app (Vite + vanilla TypeScript, no UI framework). One CodeMirror
editing pane, a preview toggled with ⌘/, save to .md, export to Word (.docx).
The design intent is deliberate minimalism: the only chrome is one slim toolbar
(formatting, file actions, preview toggle) that dims while typing, plus a faded
status bar. New features must not add further chrome — use the ⌘K command
palette, a transient overlay, or a shortcut-only toggle instead.

## Commands

```sh
npm run tauri dev              # run the app (compiles Rust on first run)
npm run tauri build            # release Spark.app → src-tauri/target/release/bundle/macos/
npx tsc --noEmit               # typecheck the frontend
npx tsx scripts/smoke-docx.ts    # docx exporter smoke test (incl. image embed) → /tmp/smoke-test.docx
npx tsx scripts/smoke-format.ts  # toolbar formatting-command tests
npx tsx scripts/smoke-prettier.ts   # ⌘⇧F format-document + diff-region tests
npx tsx scripts/smoke-highlight.ts  # preview code-fence highlighting pipeline
npx tsx scripts/smoke-frontmatter.ts # YAML frontmatter split/entries tests
npx tsx scripts/smoke-image-meta.ts  # PNG/GIF/BMP/JPEG dimension-sniffing tests
npx tsx scripts/smoke-fuzzy.ts       # palette fuzzy-matcher tests
npx tsx scripts/smoke-math.ts        # GitHub-style $/$$ math tokenizer tests
cd src-tauri && cargo test       # Rust tests (git porcelain-v2 + branch-list parsers)
```

Requires the Rust toolchain: ensure `~/.cargo/bin` is on PATH. The bundle
target is `["app"]` only — DMG packaging is intentionally disabled (its script
needs Finder-automation permission).

## Architecture

- `src/main.ts` — app state (current path, last-saved text, dirty = text mismatch,
  last-known mtime), all keyboard shortcuts (⌘N/O/S/⇧S/E, ⌘/, ⌘K palette,
  ⌘⇧K link, ⌘J terminal, ⌘⇧F format, ⌘⇧M focus mode, ⌘⇧C commit, ⌘⇧P push)
  in a window-level **capture-phase** keydown listener — it early-returns while
  focus is inside the terminal panel (xterm owns all keys except ⌘J), the inline
  commit input, or the palette; close-confirm via `onCloseRequested`; status bar
  (`flashStatus` 1.5s transient in the word-count slot, `flashGit` 4s in the git
  segment) + window title; git status segment + inline commit input; crash
  recovery (localStorage `"recovery"` slot, 30s + blur autosave, startup
  restore); external-change detection (focus-time mtime check → clean buffer
  auto-reloads, dirty buffer warns; save asks before overwriting); recent-files
  MRU (localStorage `"recent-files"`); command-palette providers (commands,
  headings, recent files, themes, git branches/diff).
- `src/editor.ts` — CodeMirror 6 setup, markdown highlight style (code fences
  highlighted via `codeLanguages: languages`), editor theme, find/replace
  (`@codemirror/search`, panel styled in styles.css), native spellcheck
  (markdown files only, via a compartment in `setLanguageFor`), focus/typewriter
  mode (`toggleFocusMode`: active-paragraph line decorations + centering);
  exports `createEditor`, `getText`, `setText`, `setLanguageFor`, `toggleFocusMode`.
- `src/palette.ts` — ⌘K transient overlay (lazily created `#palette`), fuzzy
  filtering via `src/fuzzy.ts`; items select on **mousedown + preventDefault**
  (the input's blur-close would eat a click); second-stage lists are just
  another `openPalette` call.
- `src/format.ts` — toolbar formatting commands (toggle inline markers, heading
  cycle, list/quote prefixes, code, link) as CodeMirror transactions.
- `src/prettify.ts` — ⌘⇧F: prettier/standalone (lazy-imported) reformats the doc;
  dispatches only the common-prefix/suffix diff region so cursor/scroll survive.
- `src/preview.ts` — marked (+ marked-highlight/hljs) → DOMPurify → `#preview`
  innerHTML (debounced in main.ts); hljs token colors map to `--syn-*` CSS vars.
  Strips YAML frontmatter (`src/frontmatter.ts`) into a dimmed metadata table;
  a generation-counted async post-pass renders math (KaTeX) and
  ` ```mermaid ` fences (both lazy chunks; mermaid runs `htmlLabels: false` so
  the strict SVG sanitize profile is lossless — keep it that way); `renderDiff`
  shows raw git diffs via hljs, bypassing marked. Math comes from ` ```math `
  fences plus GitHub-style `$…$` / `` $`…`$ `` / `$$…$$` via `src/math.ts`, a
  marked extension emitting inert `<code class="language-math…">` placeholders
  (`export-docx.ts` emits their LaTeX source as code runs so exports keep them).
- `src/syncscroll.ts` — proportional editor↔preview scroll mirroring with a
  rAF-released re-entrancy guard.
- `src/file.ts` — open/save/save-as/export plus binary read (`readBinaryFile`)
  and `statMtime` via `@tauri-apps/plugin-dialog` + `plugin-fs`.
- `src/git.ts` — typed `invoke` wrappers for the
  `git_status/commit/push/branches/checkout/diff` commands.
- `src/terminal.ts` — xterm.js bottom panel (⌘J, lazy-created); fits after unhide
  in rAF, streams raw PTY bytes via `pty:output`/`pty:exit` events.
- `src/export-docx.ts` — walks `marked.lexer()` tokens recursively into `docx`
  objects (headings, inline styles, nested lists, blockquotes, code, tables, hr);
  frontmatter is skipped; images are pre-resolved async (data: URLs inline,
  other hrefs through an injected resolver) then emitted as `ImageRun`s sized by
  `src/image-meta.ts`'s header sniffing, falling back to italic alt text;
  `Packer.toBlob` → `Uint8Array`.
- `src-tauri/` — Rust shell; plugins + `invoke_handler` in `src/lib.rs`.
  `src/git.rs` shells out to the git binary (`--porcelain=v2` and branch-list
  parsers, unit-tested); `src/pty.rs` spawns a login shell (`$SHELL -l`, so
  Homebrew/claude are on PATH) via portable-pty, killed on `WindowEvent::Destroyed`.

## Gotchas

- Tauri permissions live in `src-tauri/capabilities/default.json`. fs access is
  scoped to `$HOME/**`, `/Volumes/**`, `/tmp/**`; any new window API call
  (like the existing `core:window:allow-set-title`) needs a permission entry there.
  App-defined commands (`git_*`, `pty_*`) need **no** capability entries — the
  ACL gates plugin/core commands only; event `listen` is covered by `core:default`.
- Styling: theme variables and preview typography in `src/styles.css`; the
  editor's own look lives in the `EditorView.theme` block in `src/editor.ts`
  (but the search panel, palette, and focus-mode dimming are plain CSS).
- marked's lexer HTML-escapes some inline token text (e.g. codespans) —
  `export-docx.ts` decodes entities in `decodeEntities` before emitting runs.
- Overlays (palette, commit input) must handle selection on `mousedown` with
  `preventDefault`, matching the toolbar/sidebar pattern, or blur-close wins.
