import { marked } from "marked";
import DOMPurify from "dompurify";

marked.use({ gfm: true });

export function renderPreview(el: HTMLElement, text: string): void {
  const html = marked.parse(text, { async: false }) as string;
  el.innerHTML = DOMPurify.sanitize(html);
}
