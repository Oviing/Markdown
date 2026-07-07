import { marked } from "marked";
import { markedHighlight } from "marked-highlight";
import hljs from "highlight.js/lib/common";
import DOMPurify from "dompurify";

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

export function renderPreview(el: HTMLElement, text: string): void {
  const html = marked.parse(text, { async: false }) as string;
  el.innerHTML = DOMPurify.sanitize(html);
}
