import { marked } from "marked";
import { mathExtension } from "../src/math";

marked.use({ gfm: true });
marked.use(mathExtension);

let failures = 0;
function check(name: string, ok: boolean, got?: string) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || got === undefined ? "" : ` — got ${JSON.stringify(got)}`}`);
}

function render(md: string): string {
  return marked.parse(md, { async: false }) as string;
}

// --- inline $...$ ------------------------------------------------------------

let html = render("Euler: $e^{i\\pi}+1=0$ wow");
check(
  "inline $...$ becomes placeholder",
  html.includes('<code class="language-math-inline">e^{i\\pi}+1=0</code>'),
  html
);

html = render("mid $a_1 + b_2$ text");
check("inline math with underscores survives emphasis", html.includes("a_1 + b_2"), html);

html = render("gh form $`a $ b`$ here");
check(
  "$`...`$ form allows dollars inside",
  html.includes('<code class="language-math-inline">a $ b</code>'),
  html
);

// --- display math ------------------------------------------------------------

html = render("$$\n\\int_0^1 x\\,dx\n$$\n");
check(
  "multiline $$ block becomes math fence placeholder",
  html.includes('<pre><code class="language-math">\\int_0^1 x\\,dx</code></pre>'),
  html
);

html = render("$$x^2$$\n");
check(
  "single-line $$ on its own line is a block",
  html.includes('<pre><code class="language-math">x^2</code></pre>'),
  html
);

html = render("before $$x^2$$ after");
check(
  "mid-paragraph $$ becomes display placeholder",
  html.includes('<code class="language-math-display">x^2</code>'),
  html
);

// --- non-math dollars stay literal --------------------------------------------

html = render("It costs $5 and $10 today");
check("currency is not math", !html.includes("language-math"), html);
check("currency text intact", html.includes("$5 and $10"), html);

html = render("escaped \\$x\\$ dollars");
check("escaped \\$ is not math", !html.includes("language-math"), html);

html = render("code `$x$` span");
check("codespan wins over math", html.includes("<code>$x$</code>") && !html.includes("language-math"), html);

html = render("$ x $ spaced");
check("space-padded $ pair is not math", !html.includes("language-math"), html);

html = render("plain paragraph, no dollars");
check("plain doc has no placeholders", !html.includes("language-math"), html);

// --- placeholder content is escaped -------------------------------------------

html = render("$a<b$ and $$c>\"d\"$$");
check(
  "inline content HTML-escaped",
  html.includes('<code class="language-math-inline">a&lt;b</code>'),
  html
);
check(
  "display content HTML-escaped",
  html.includes('<code class="language-math-display">c&gt;&quot;d&quot;</code>'),
  html
);

if (failures) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log("\nmath OK");
