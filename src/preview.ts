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
}

// raw diff text shown in the preview pane — highlighted directly, bypassing
// marked (diff content would otherwise need fence-escaping)
export function renderDiff(el: HTMLElement, diff: string): void {
  const highlighted = hljs.highlight(diff, { language: "diff" }).value;
  el.innerHTML = DOMPurify.sanitize(
    `<pre><code class="hljs language-diff">${highlighted}</code></pre>`
  );
}
