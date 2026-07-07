import { prettifyMarkdown, diffRegion } from "../src/prettify";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(
    `${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` — got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`}`
  );
}

const messy = "#  Title\n\n*   one\n*  two\n\n|a|b|\n|-|-|\n|1|22|\n";
const formatted = await prettifyMarkdown(messy);

check("heading normalized", formatted.startsWith("# Title\n"), true);
check("list markers normalized", formatted.includes("- one\n- two"), true);
check("table aligned", formatted.includes("| a   | b   |"), true);

// formatting already-clean output is a no-op
check("idempotent", await prettifyMarkdown(formatted), formatted);

// diffRegion
check("diff identical", diffRegion("abc", "abc"), null);
check("diff middle", diffRegion("a XX c", "a YYY c"), { from: 2, to: 4, insert: "YYY" });
check("diff insert at end", diffRegion("ab", "abc"), { from: 2, to: 2, insert: "c" });
check("diff delete all", diffRegion("abc", ""), { from: 0, to: 3, insert: "" });
// overlap guard: repeated chars must not produce negative-length regions
const d = diffRegion("aaa", "aa")!;
check("diff overlap-safe", d.from <= d.to && d.to <= 3, true);
check("diff overlap round-trip", "aaa".slice(0, d.from) + d.insert + "aaa".slice(d.to), "aa");

// every diff round-trips
for (const [a, b] of [
  [messy, formatted],
  ["", "x"],
  ["x", ""],
  ["hello world", "hello brave world"],
] as const) {
  const r = diffRegion(a, b);
  const applied = r === null ? a : a.slice(0, r.from) + r.insert + a.slice(r.to);
  check(`round-trip ${JSON.stringify(a.slice(0, 12))}→${JSON.stringify(b.slice(0, 12))}`, applied, b);
}

if (failures) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log("\nprettify OK");
