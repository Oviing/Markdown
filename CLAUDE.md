# CLAUDE.md

## Project

"Spark" — a minimal, distraction-free markdown editor for macOS, built as a
Tauri 2 desktop app (Vite + vanilla TypeScript, no UI framework). One CodeMirror
editing pane, a preview toggled with ⌘/, save to .md, export to Word (.docx).
The design intent is deliberate minimalism: the only chrome is one slim toolbar
(formatting, file actions, preview toggle) that dims while typing, plus a faded
status bar. New features must not add further chrome.

## Commands

```sh
npm run tauri dev              # run the app (compiles Rust on first run)
npm run tauri build            # release Spark.app → src-tauri/target/release/bundle/macos/
npx tsc --noEmit               # typecheck the frontend
npx tsx scripts/smoke-docx.ts    # docx exporter smoke test → /tmp/smoke-test.docx
npx tsx scripts/smoke-format.ts  # toolbar formatting-command tests
```

Requires the Rust toolchain: ensure `~/.cargo/bin` is on PATH. The bundle
target is `["app"]` only — DMG packaging is intentionally disabled (its script
needs Finder-automation permission).

## Architecture

- `src/main.ts` — app state (current path, last-saved text, dirty = text mismatch),
  all keyboard shortcuts (⌘N/O/S/⇧S/E, ⌘/) in a window-level **capture-phase**
  keydown listener, close-confirm via `onCloseRequested`, status bar + window title.
- `src/editor.ts` — CodeMirror 6 setup, markdown highlight style, editor theme;
  exports `createEditor`, `getText`, `setText`.
- `src/format.ts` — toolbar formatting commands (toggle inline markers, heading
  cycle, list/quote prefixes, code, link) as CodeMirror transactions.
- `src/preview.ts` — marked → DOMPurify → `#preview` innerHTML (debounced in main.ts).
- `src/file.ts` — open/save/save-as/export via `@tauri-apps/plugin-dialog` + `plugin-fs`.
- `src/export-docx.ts` — walks `marked.lexer()` tokens recursively into `docx`
  objects (headings, inline styles, nested lists, blockquotes, code, tables, hr);
  `Packer.toBlob` → `Uint8Array`.
- `src-tauri/` — minimal Rust shell; plugins registered in `src/lib.rs`.

## Gotchas

- Tauri permissions live in `src-tauri/capabilities/default.json`. fs access is
  scoped to `$HOME/**`, `/Volumes/**`, `/tmp/**`; any new window API call
  (like the existing `core:window:allow-set-title`) needs a permission entry there.
- Styling: theme variables and preview typography in `src/styles.css`; the
  editor's own look lives in the `EditorView.theme` block in `src/editor.ts`.
- marked's lexer HTML-escapes some inline token text (e.g. codespans) —
  `export-docx.ts` decodes entities in `decodeEntities` before emitting runs.
