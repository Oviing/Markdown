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

---

The end.
`;

const bytes = await markdownToDocx(sample);
writeFileSync("/tmp/smoke-test.docx", bytes);
console.log(`wrote /tmp/smoke-test.docx (${bytes.length} bytes)`);
