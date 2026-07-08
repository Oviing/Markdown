# Spark

A minimal, distraction-free markdown editor for macOS. One quiet writing pane,
a slim toolbar that dims while you type, an optional side-by-side preview, and
export to Markdown or Word.

Built with Tauri 2, CodeMirror 6, marked, and docx.

## Installing

Download `Spark-x.y.z.zip` from the [Releases](../../releases) page, unzip it,
and drag **Spark.app** into `/Applications`.

Spark isn't notarized by Apple (that needs a paid Developer account), so the
first launch shows *"Spark is damaged and can't be opened."* This is expected
for un-notarized apps downloaded from the internet. To clear it, run once in
Terminal:

    xattr -dr com.apple.quarantine /Applications/Spark.app

Then open Spark normally.

## Toolbar

Formatting (bold, italic, strikethrough, heading, lists, quote, code, link),
file actions (new, open, save, export to Word), and the preview toggle. The
bar fades while you're typing and brightens on hover. The heading button
cycles H1 → H2 → H3 → none on the current line(s).

## Shortcuts

| Shortcut | Action                      |
| -------- | --------------------------- |
| ⌘K       | Command palette             |
| ⌘N       | New document                |
| ⌘O       | Open a markdown file        |
| ⌘S       | Save                        |
| ⇧⌘S      | Save as…                    |
| ⌘E       | Export as Word (.docx)      |
| ⌘/       | Toggle the rendered preview |
| ⌘F       | Find / replace              |
| ⌘B       | Bold                        |
| ⌘I       | Italic                      |
| ⇧⌘K      | Insert link                 |
| ⇧⌘M      | Focus/typewriter mode       |

The ⌘K palette fuzzy-searches every command — including jump-to-heading,
recent files, theme switching, and git actions (commit, push, branch
switch, diff) — so features stay reachable without extra buttons.

The status bar at the bottom shows the current file, a `●` when there are
unsaved changes, and a word count. Closing the window with unsaved changes
asks for confirmation. Dirty buffers are snapshotted every 30 seconds for
crash recovery, files edited outside Spark reload automatically (or warn
before overwriting), and the preview scroll-syncs with the editor,
renders YAML frontmatter as a metadata block, and understands
` ```math ` (KaTeX) and ` ```mermaid ` fences. Word export embeds local
images.

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
