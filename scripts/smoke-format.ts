import { EditorSelection, EditorState, type TransactionSpec } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import {
  cycleHeading,
  insertLink,
  toggleCode,
  toggleInline,
  toggleLinePrefix,
  toggleOrderedList,
} from "../src/format";

function fakeView(doc: string, anchor: number, head: number) {
  let state = EditorState.create({ doc, selection: EditorSelection.single(anchor, head) });
  return {
    get state() {
      return state;
    },
    dispatch(spec: TransactionSpec) {
      state = state.update(spec).state;
    },
    focus() {},
  } as unknown as EditorView & { state: EditorState };
}

let failures = 0;
function check(name: string, actual: string, expected: string) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` — got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`}`);
}

// bold wrap and unwrap
let v = fakeView("hello world", 0, 5);
toggleInline(v, "**");
check("bold wrap", v.state.doc.toString(), "**hello** world");
toggleInline(v, "**");
check("bold unwrap", v.state.doc.toString(), "hello world");

// bold with empty selection expands to word
v = fakeView("hello world", 8, 8);
toggleInline(v, "**");
check("bold word-at-cursor", v.state.doc.toString(), "hello **world**");

// heading cycle
v = fakeView("title", 0, 0);
cycleHeading(v);
check("heading h1", v.state.doc.toString(), "# title");
cycleHeading(v);
check("heading h2", v.state.doc.toString(), "## title");
cycleHeading(v);
check("heading h3", v.state.doc.toString(), "### title");
cycleHeading(v);
check("heading none", v.state.doc.toString(), "title");

// bullet list add/remove across two lines
v = fakeView("one\ntwo", 0, 7);
toggleLinePrefix(v, "- ");
check("bullets add", v.state.doc.toString(), "- one\n- two");
toggleLinePrefix(v, "- ");
check("bullets remove", v.state.doc.toString(), "one\ntwo");

// ordered list
v = fakeView("one\ntwo\nthree", 0, 13);
toggleOrderedList(v);
check("ordered add", v.state.doc.toString(), "1. one\n2. two\n3. three");
toggleOrderedList(v);
check("ordered remove", v.state.doc.toString(), "one\ntwo\nthree");

// quote
v = fakeView("wise words", 0, 0);
toggleLinePrefix(v, "> ");
check("quote add", v.state.doc.toString(), "> wise words");

// inline code single line
v = fakeView("use foo here", 4, 7);
toggleCode(v);
check("inline code", v.state.doc.toString(), "use `foo` here");

// fenced block multiline
v = fakeView("line1\nline2", 0, 11);
toggleCode(v);
check("fenced block", v.state.doc.toString(), "```\nline1\nline2\n```");

// link with selection
v = fakeView("click here now", 6, 10);
insertLink(v);
check("link insert", v.state.doc.toString(), "click [here](url) now");
check(
  "link url selected",
  v.state.sliceDoc(v.state.selection.main.from, v.state.selection.main.to),
  "url"
);

if (failures) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log("\nall format commands OK");
