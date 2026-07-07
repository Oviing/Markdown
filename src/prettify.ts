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

export async function formatDocument(view: EditorView): Promise<void> {
  const oldText = view.state.doc.toString();
  let newText: string;
  try {
    newText = await prettifyMarkdown(oldText);
  } catch {
    return;
  }
  if (view.state.doc.toString() !== oldText) return; // doc changed while formatting
  const change = diffRegion(oldText, newText);
  if (!change) return;
  view.dispatch({ changes: change, scrollIntoView: true });
}
