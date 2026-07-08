import { splitFrontmatter, frontmatterEntries } from "../src/frontmatter";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(
    `${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` — got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`}`
  );
}

check("no frontmatter", splitFrontmatter("# hi\n"), { fm: null, body: "# hi\n" });

check(
  "plain frontmatter",
  splitFrontmatter("---\ntitle: Test\nauthor: Ada\n---\nbody\n"),
  { fm: "title: Test\nauthor: Ada", body: "body\n" }
);

check(
  "CRLF frontmatter",
  splitFrontmatter("---\r\ntitle: Test\r\n---\r\nbody"),
  { fm: "title: Test", body: "body" }
);

check(
  "unterminated fence stays body",
  splitFrontmatter("---\ntitle: Test\nbody continues"),
  { fm: null, body: "---\ntitle: Test\nbody continues" }
);

check(
  "mid-doc --- not frontmatter",
  splitFrontmatter("intro\n---\nkey: v\n---\n"),
  { fm: null, body: "intro\n---\nkey: v\n---\n" }
);

check(
  "frontmatter at EOF without trailing newline",
  splitFrontmatter("---\ntitle: T\n---"),
  { fm: "title: T", body: "" }
);

check(
  "entries split on first colon",
  frontmatterEntries("title: a: b\ntags:\n  - one\nplain line"),
  [
    ["title", "a: b"],
    ["tags", ""],
    [null, "  - one"],
    [null, "plain line"],
  ]
);

if (failures) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log("\nfrontmatter OK");
