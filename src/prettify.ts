import type { EditorView } from "@codemirror/view";

export async function prettifyMarkdown(text: string): Promise<string> {
  // loaded on demand: prettier is ~1 MB and only needed for ⌘⇧F
  const [prettier, markdownPlugin] = await Promise.all([
    import("prettier/standalone"),
    import("prettier/plugins/markdown"),
  ]);
  return prettier.format(text, {
    parser: "markdown",
    plugins: [markdownPlugin],
    proseWrap: "preserve",
  });
}

// The minimal single change turning `oldText` into `newText`: everything
// outside the common prefix/suffix. Dispatching only this region lets
// CodeMirror map the cursor and scroll position through the change.
export function diffRegion(
  oldText: string,
  newText: string
): { from: number; to: number; insert: string } | null {
  if (oldText === newText) return null;
  let prefix = 0;
  const maxPrefix = Math.min(oldText.length, newText.length);
  while (prefix < maxPrefix && oldText[prefix] === newText[prefix]) prefix++;
  let suffix = 0;
  const maxSuffix = Math.min(oldText.length, newText.length) - prefix;
  while (
    suffix < maxSuffix &&
    oldText[oldText.length - 1 - suffix] === newText[newText.length - 1 - suffix]
  ) {
    suffix++;
  }
  return {
    from: prefix,
    to: oldText.length - suffix,
    insert: newText.slice(prefix, newText.length - suffix),
  };
}

interface ParserSpec {
  parser: string;
  load: () => Promise<import("prettier").Plugin[]>;
}

const md: ParserSpec = { parser: "markdown", load: () => Promise.all([import("prettier/plugins/markdown")]) };
const json: ParserSpec = {
  parser: "json",
  load: () => Promise.all([import("prettier/plugins/babel"), import("prettier/plugins/estree")]),
};
const babel: ParserSpec = { ...json, parser: "babel" };
const ts: ParserSpec = {
  parser: "typescript",
  load: () => Promise.all([import("prettier/plugins/typescript"), import("prettier/plugins/estree")]),
};
const postcss = (parser: string): ParserSpec => ({ parser, load: () => Promise.all([import("prettier/plugins/postcss")]) });
const html: ParserSpec = { parser: "html", load: () => Promise.all([import("prettier/plugins/html")]) };
const yaml: ParserSpec = { parser: "yaml", load: () => Promise.all([import("prettier/plugins/yaml")]) };

const PARSERS: Record<string, ParserSpec> = {
  md, markdown: md, txt: md,
  json, jsonc: json,
  js: babel, mjs: babel, cjs: babel, jsx: babel,
  ts, tsx: ts,
  css: postcss("css"), scss: postcss("scss"), less: postcss("less"),
  html, htm: html,
  yml: yaml, yaml,
};

// Returns false when no formatter exists for the file type (caller reports it);
// true otherwise, including silent no-ops on parse errors (same as before).
export async function formatDocument(view: EditorView, fileName: string | null): Promise<boolean> {
  const ext = fileName ? fileName.slice(fileName.lastIndexOf(".") + 1).toLowerCase() : "md";
  const spec = PARSERS[ext];
  if (!spec) return false;
  const oldText = view.state.doc.toString();
  let newText: string;
  try {
    const [prettier, plugins] = await Promise.all([import("prettier/standalone"), spec.load()]);
    newText = await prettier.format(oldText, {
      parser: spec.parser,
      plugins,
      ...(spec.parser === "markdown" ? { proseWrap: "preserve" as const } : {}),
    });
  } catch {
    return true;
  }
  if (view.state.doc.toString() !== oldText) return true; // doc changed while formatting
  const change = diffRegion(oldText, newText);
  if (change) view.dispatch({ changes: change, scrollIntoView: true });
  return true;
}
