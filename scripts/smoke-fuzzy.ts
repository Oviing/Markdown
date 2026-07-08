import { fuzzyScore } from "../src/fuzzy";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || !detail ? "" : ` — ${detail}`}`);
}

const s = fuzzyScore;

check("empty query matches everything", s("", "anything") === 0);
check("non-subsequence is null", s("xyz", "Save Document") === null);
check("exact substring matches", s("save", "Save Document") !== null);
check("case-insensitive", s("SAVE", "save document") !== null);
check("scattered subsequence matches", s("sd", "Save Document") !== null);

const prefix = s("save", "Save Document")!;
const scattered = s("save", "Set active view engine")!;
check("prefix beats scattered", prefix > scattered, `prefix=${prefix} scattered=${scattered}`);

const wordStart = s("doc", "Save Document")!;
const midWord = s("doc", "Idocrase")!;
check("word-start beats mid-word", wordStart > midWord, `wordStart=${wordStart} midWord=${midWord}`);

const short = s("new", "New")!;
const long = s("new", "New Document From Template")!;
check("shorter label wins on equal hits", short > long, `short=${short} long=${long}`);

check("query longer than label is null", s("documents", "doc") === null);

if (failures) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log("\nfuzzy OK");
