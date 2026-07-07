# Spark

A minimal, distraction-free markdown editor for macOS. One quiet writing pane,
a slim toolbar that dims while you type, an optional side-by-side preview, and
export to Markdown or Word.

Built with Tauri 2, CodeMirror 6, marked, and docx.

## Toolbar

Formatting (bold, italic, strikethrough, heading, lists, quote, code, link),
file actions (new, open, save, export to Word), and the preview toggle. The
bar fades while you're typing and brightens on hover. The heading button
cycles H1 → H2 → H3 → none on the current line(s).

## Shortcuts

| Shortcut | Action                      |
| -------- | --------------------------- |
| ⌘N       | New document                |
| ⌘O       | Open a markdown file        |
| ⌘S       | Save                        |
| ⇧⌘S      | Save as…                    |
| ⌘E       | Export as Word (.docx)      |
| ⌘/       | Toggle the rendered preview |
| ⌘B       | Bold                        |
| ⌘I       | Italic                      |
| ⌘K       | Insert link                 |

The status bar at the bottom shows the current file, a `●` when there are
unsaved changes, and a word count. Closing the window with unsaved changes
asks for confirmation.

## Development

```sh
npm install
npm run tauri dev     # run the app in development
npm run tauri build   # build the release .app bundle
```

Requires Node and the Rust toolchain (https://rustup.rs).

The docx export logic can be smoke-tested without the app:

```sh
npx tsx scripts/smoke-docx.ts     # writes /tmp/smoke-test.docx
npx tsx scripts/smoke-format.ts   # tests the toolbar formatting commands
```
