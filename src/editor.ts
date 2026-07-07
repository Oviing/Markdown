import { EditorView, keymap, placeholder, drawSelection, highlightSpecialChars } from "@codemirror/view";
import { EditorState, Compartment } from "@codemirror/state";
import { history, defaultKeymap, historyKeymap } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { syntaxHighlighting, HighlightStyle, LanguageDescription } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import { isMarkdownFile } from "./filetype";

const mdHighlight = HighlightStyle.define([
  { tag: t.heading1, fontSize: "1.5em", fontWeight: "700" },
  { tag: t.heading2, fontSize: "1.3em", fontWeight: "700" },
  { tag: t.heading3, fontSize: "1.15em", fontWeight: "600" },
  { tag: t.heading4, fontWeight: "600" },
  { tag: t.heading5, fontWeight: "600" },
  { tag: t.heading6, fontWeight: "600" },
  { tag: t.strong, fontWeight: "700" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  { tag: t.monospace, fontFamily: "var(--mono)", fontSize: "0.88em", color: "var(--code)" },
  { tag: t.link, color: "var(--accent)" },
  { tag: t.url, color: "var(--muted)" },
  { tag: t.quote, color: "var(--muted)", fontStyle: "italic" },
  { tag: t.processingInstruction, color: "var(--muted)" },
  { tag: t.meta, color: "var(--muted)" },
  { tag: t.contentSeparator, color: "var(--muted)" },
  { tag: t.keyword, color: "var(--syn-keyword)" },
  { tag: [t.string, t.special(t.string), t.regexp], color: "var(--syn-string)" },
  { tag: t.comment, color: "var(--syn-comment)", fontStyle: "italic" },
  { tag: [t.number, t.bool, t.atom, t.null], color: "var(--syn-number)" },
  { tag: [t.function(t.variableName), t.definition(t.variableName)], color: "var(--syn-func)" },
  { tag: [t.typeName, t.className, t.tagName], color: "var(--syn-type)" },
  { tag: [t.propertyName, t.attributeName], color: "var(--syn-prop)" },
  { tag: [t.operator, t.punctuation], color: "var(--muted)" },
]);

const theme = EditorView.theme({
  "&": {
    height: "100%",
    fontSize: "17px",
    backgroundColor: "transparent",
    color: "var(--fg)",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily: "var(--sans)",
    lineHeight: "1.7",
  },
  ".cm-content": {
    maxWidth: "46rem",
    margin: "0 auto",
    padding: "3.5rem 2.5rem 40vh",
    caretColor: "var(--fg)",
  },
  ".cm-line": { padding: "0" },
  ".cm-cursor": { borderLeftColor: "var(--fg)", borderLeftWidth: "2px" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
    backgroundColor: "var(--selection) !important",
  },
  ".cm-placeholder": { color: "var(--muted)" },
});

const langCompartment = new Compartment();

function markdownExt() {
  return markdown({ base: markdownLanguage, codeLanguages: languages });
}

let langToken = 0;

// swap the editor language to match the file; last-requested wins if loads overlap
export async function setLanguageFor(view: EditorView, fileName: string | null): Promise<void> {
  const token = ++langToken;
  let lang;
  if (isMarkdownFile(fileName)) {
    lang = markdownExt();
  } else {
    const desc = LanguageDescription.matchFilename(languages, fileName!);
    lang = desc ? await desc.load() : [];
  }
  if (token !== langToken) return;
  view.dispatch({ effects: langCompartment.reconfigure(lang) });
}

export function createEditor(
  parent: HTMLElement,
  onChange: (text: string) => void
): EditorView {
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: "",
      extensions: [
        history(),
        drawSelection(),
        highlightSpecialChars(),
        EditorView.lineWrapping,
        langCompartment.of(markdownExt()),
        syntaxHighlighting(mdHighlight),
        theme,
        placeholder("Start writing…"),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChange(update.state.doc.toString());
        }),
      ],
    }),
  });
  return view;
}

export function getText(view: EditorView): string {
  return view.state.doc.toString();
}

export function setText(view: EditorView, text: string): void {
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: text },
  });
}
