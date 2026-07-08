import { writeFileSync } from "node:fs";
import { markdownToDocx } from "../src/export-docx";

const sample = `# Sample Document

Some **bold**, *italic*, ~~struck~~, and \`inline code\` text, plus a [link](https://example.com).

## A List

1. First ordered item
2. Second with **bold**
   - nested bullet
   - another nested

> A quiet blockquote with *emphasis*.

\`\`\`js
function hello() {
  return "world";
}
\`\`\`

| Name | Value |
| ---- | ----- |
| One  | 1     |
| Two  | 2     |

An embedded image: ![tiny dot](dot.png)

A missing image falls back to alt text: ![gone](missing.png)

---

The end.
`;

// real 1×1 PNG served by the injected resolver for dot.png only
const PNG_1x1 = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="),
  (c) => c.charCodeAt(0)
);

const bytes = await markdownToDocx(sample, {
  resolveImage: async (href) => (href === "dot.png" ? PNG_1x1 : null),
});
writeFileSync("/tmp/smoke-test.docx", bytes);
const plain = await markdownToDocx(sample); // no resolver: every image falls back
if (plain.length === 0 || bytes.length <= plain.length) {
  console.error(`FAIL embedded export should be larger: with=${bytes.length}, without=${plain.length}`);
  process.exit(1);
}
console.log(`wrote /tmp/smoke-test.docx (${bytes.length} bytes; ${plain.length} without images)`);
