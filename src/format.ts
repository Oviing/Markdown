import { EditorSelection, type ChangeSpec } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

export function toggleInline(view: EditorView, marker: string): void {
  const changes = view.state.changeByRange((range) => {
    const { state } = view;
    let { from, to } = range;
    if (from === to) {
      const word = state.wordAt(from);
      if (word) ({ from, to } = word);
    }
    const before = state.sliceDoc(Math.max(0, from - marker.length), from);
    const after = state.sliceDoc(to, Math.min(state.doc.length, to + marker.length));
    const inner = state.sliceDoc(from, to);

    if (before === marker && after === marker) {
      return {
        changes: [
          { from: from - marker.length, to: from },
          { from: to, to: to + marker.length },
        ],
        range: EditorSelection.range(from - marker.length, to - marker.length),
      };
    }
    if (inner.startsWith(marker) && inner.endsWith(marker) && inner.length >= marker.length * 2) {
      return {
        changes: [
          { from, to: from + marker.length },
          { from: to - marker.length, to },
        ],
        range: EditorSelection.range(from, to - marker.length * 2),
      };
    }
    return {
      changes: [
        { from, insert: marker },
        { from: to, insert: marker },
      ],
      range: EditorSelection.range(from + marker.length, to + marker.length),
    };
  });
  view.dispatch(changes);
  view.focus();
}

function selectedLines(view: EditorView): { from: number; to: number } {
  const range = view.state.selection.main;
  return {
    from: view.state.doc.lineAt(range.from).number,
    to: view.state.doc.lineAt(range.to).number,
  };
}

export function cycleHeading(view: EditorView): void {
  const { state } = view;
  const lines = selectedLines(view);
  const changes: ChangeSpec[] = [];
  for (let n = lines.from; n <= lines.to; n++) {
    const line = state.doc.line(n);
    const m = /^(#{1,6}) /.exec(line.text);
    if (!m) changes.push({ from: line.from, insert: "# " });
    else if (m[1].length < 3) changes.push({ from: line.from, insert: "#" });
    else changes.push({ from: line.from, to: line.from + m[1].length + 1 });
  }
  view.dispatch({ changes });
  view.focus();
}

export function toggleLinePrefix(view: EditorView, prefix: string): void {
  const { state } = view;
  const lines = selectedLines(view);
  const changes: ChangeSpec[] = [];
  let allPrefixed = true;
  for (let n = lines.from; n <= lines.to; n++) {
    if (!state.doc.line(n).text.startsWith(prefix)) allPrefixed = false;
  }
  for (let n = lines.from; n <= lines.to; n++) {
    const line = state.doc.line(n);
    if (allPrefixed) changes.push({ from: line.from, to: line.from + prefix.length });
    else if (!line.text.startsWith(prefix)) changes.push({ from: line.from, insert: prefix });
  }
  view.dispatch({ changes });
  view.focus();
}

export function toggleOrderedList(view: EditorView): void {
  const { state } = view;
  const lines = selectedLines(view);
  const changes: ChangeSpec[] = [];
  let allNumbered = true;
  for (let n = lines.from; n <= lines.to; n++) {
    if (!/^\d+\. /.test(state.doc.line(n).text)) allNumbered = false;
  }
  let index = 1;
  for (let n = lines.from; n <= lines.to; n++) {
    const line = state.doc.line(n);
    const m = /^\d+\. /.exec(line.text);
    if (allNumbered) changes.push({ from: line.from, to: line.from + m![0].length });
    else if (m) changes.push({ from: line.from, to: line.from + m[0].length, insert: `${index++}. ` });
    else changes.push({ from: line.from, insert: `${index++}. ` });
  }
  view.dispatch({ changes });
  view.focus();
}

export function toggleCode(view: EditorView): void {
  const { state } = view;
  const range = state.selection.main;
  const startLine = state.doc.lineAt(range.from);
  const endLine = state.doc.lineAt(range.to);
  if (startLine.number === endLine.number) {
    toggleInline(view, "`");
    return;
  }
  view.dispatch({
    changes: [
      { from: startLine.from, insert: "```\n" },
      { from: endLine.to, insert: "\n```" },
    ],
  });
  view.focus();
}

export function insertLink(view: EditorView): void {
  const { state } = view;
  const range = state.selection.main;
  const text = state.sliceDoc(range.from, range.to) || "link text";
  const placeholder = "url";
  const urlStart = range.from + 1 + text.length + 2;
  view.dispatch({
    changes: { from: range.from, to: range.to, insert: `[${text}](${placeholder})` },
    selection: EditorSelection.range(urlStart, urlStart + placeholder.length),
  });
  view.focus();
}
