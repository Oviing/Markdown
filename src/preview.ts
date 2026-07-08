import { marked } from "marked";
import { markedHighlight } from "marked-highlight";
import hljs from "highlight.js/lib/common";
import DOMPurify from "dompurify";
import { splitFrontmatter, frontmatterEntries } from "./frontmatter";

marked.use({ gfm: true });
marked.use(
  markedHighlight({
    langPrefix: "hljs language-",
    highlight(code, lang) {
      if (!hljs.getLanguage(lang)) return code;
      return hljs.highlight(code, { language: lang }).value;
    },
  })
);

// Built with createElement/textContent, so raw YAML never touches innerHTML.
function frontmatterTable(fm: string): HTMLTableElement {
  const table = document.createElement("table");
  table.className = "fm-table";
  for (const [key, value] of frontmatterEntries(fm)) {
    const tr = table.insertRow();
    if (key === null) {
      const td = tr.insertCell();
      td.colSpan = 2;
      td.textContent = value;
    } else {
      tr.insertCell().textContent = key;
      tr.insertCell().textContent = value;
    }
  }
  return table;
}

export function renderPreview(el: HTMLElement, text: string): void {
  const { fm, body } = splitFrontmatter(text);
  const html = marked.parse(body, { async: false }) as string;
  el.innerHTML = DOMPurify.sanitize(html);
  if (fm !== null && fm.trim() !== "") el.prepend(frontmatterTable(fm));
  void enhancePreview(el, ++renderGen);
}

// --- ```math (KaTeX) and ```mermaid fences ----------------------------------
// Enhancement is a fire-and-forget post-pass over the already-sanitized DOM.
// Input is textContent (inert) and every generated fragment is re-sanitized
// before insertion, so ordering stays XSS-safe. Both libraries are lazy
// chunks that never load for documents without such fences.

let renderGen = 0;
let mermaidDark: boolean | null = null; // theme mermaid was initialized with

function isDarkTheme(): boolean {
  const t = document.documentElement.dataset.theme;
  if (t) return t !== "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

// theme changed: re-render math/mermaid docs with matching diagram colors
export function refreshPreviewTheme(el: HTMLElement, text: string): void {
  if (mermaidDark === null || mermaidDark === isDarkTheme()) return;
  if (!el.hidden) renderPreview(el, text);
}

async function enhancePreview(el: HTMLElement, gen: number): Promise<void> {
  const blocks = el.querySelectorAll<HTMLElement>("code.language-math, code.language-mermaid");
  if (blocks.length === 0) return;

  const wantMermaid = [...blocks].some((b) => b.classList.contains("language-mermaid"));
  const katex = (await import("katex")).default;
  await import("katex/dist/katex.min.css");
  let mermaid: typeof import("mermaid").default | null = null;
  if (wantMermaid) {
    mermaid = (await import("mermaid")).default;
    const dark = isDarkTheme();
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: dark ? "dark" : "neutral",
      // htmlLabels would emit foreignObject content that the SVG sanitize
      // profile strips — pure <text> labels survive sanitizing losslessly
      flowchart: { htmlLabels: false },
    });
    mermaidDark = dark;
  }
  if (gen !== renderGen) return; // a newer render replaced this DOM while loading

  let mermaidSeq = 0;
  for (const code of blocks) {
    const src = code.textContent ?? "";
    const pre = code.parentElement;
    if (!pre || gen !== renderGen) return;
    if (code.classList.contains("language-math")) {
      const html = katex.renderToString(src, { throwOnError: false, displayMode: true });
      const div = document.createElement("div");
      div.className = "math-block";
      div.innerHTML = DOMPurify.sanitize(html);
      pre.replaceWith(div);
    } else if (mermaid) {
      try {
        const { svg } = await mermaid.render(`mermaid-${gen}-${mermaidSeq++}`, src);
        if (gen !== renderGen) return;
        const div = document.createElement("div");
        div.className = "mermaid-block";
        div.innerHTML = DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true } });
        pre.replaceWith(div);
      } catch {
        // syntax error — leave the source code block visible
      }
    }
  }
}

// raw diff text shown in the preview pane — highlighted directly, bypassing
// marked (diff content would otherwise need fence-escaping)
export function renderDiff(el: HTMLElement, diff: string): void {
  const highlighted = hljs.highlight(diff, { language: "diff" }).value;
  el.innerHTML = DOMPurify.sanitize(
    `<pre><code class="hljs language-diff">${highlighted}</code></pre>`
  );
}
