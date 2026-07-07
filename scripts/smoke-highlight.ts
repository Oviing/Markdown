// Mirrors the marked pipeline in src/preview.ts (DOMPurify needs a browser
// window, so the sanitize step is exercised in the app, not here).
import { Marked } from "marked";
import { markedHighlight } from "marked-highlight";
import hljs from "highlight.js/lib/common";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` — ${detail}`}`);
}

const marked = new Marked(
  markedHighlight({
    langPrefix: "hljs language-",
    highlight(code, lang) {
      if (!hljs.getLanguage(lang)) return code;
      return hljs.highlight(code, { language: lang }).value;
    },
  })
);
marked.use({ gfm: true });

const ts = marked.parse('```ts\nconst n: number = 42; // answer\n```', { async: false }) as string;
check("ts fence gets language class", ts.includes('class="hljs language-ts"'), ts);
check("ts keyword span", ts.includes("hljs-keyword"), ts);
check("ts comment span", ts.includes("hljs-comment"), ts);
check("ts number span", ts.includes("hljs-number"), ts);

const py = marked.parse('```python\ndef f():\n    return "hi"\n```', { async: false }) as string;
check("python keyword span", py.includes("hljs-keyword"), py);
check("python string span", py.includes("hljs-string"), py);

// unknown language falls back to escaped plain text, no crash
const unk = marked.parse('```notalang\n<b>&raw</b>\n```', { async: false }) as string;
check("unknown lang escaped", unk.includes("&lt;b&gt;") && !unk.includes("<b>"), unk);

// no-lang fence untouched
const plain = marked.parse("```\nplain text\n```", { async: false }) as string;
check("bare fence renders", plain.includes("<pre><code>"), plain);

if (failures) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log("\nhighlight pipeline OK");
