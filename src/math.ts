import type { MarkedExtension, Tokens } from "marked";

// GitHub-style LaTeX math: inline $...$ (and the unambiguous $`...`$ form),
// display $$...$$ — both as a standalone block and mid-paragraph. Tokenizers
// emit inert <code> placeholders; preview.ts's KaTeX post-pass renders them
// after DOMPurify. This module must stay DOM-free so node scripts can test it.

const BLOCK = /^\$\$([\s\S]+?)\$\$[ \t]*(?:\n+|$)/;
const INLINE_BACKTICK = /^\$`([^`\n]+?)`\$/;
const INLINE_DISPLAY = /^\$\$([^\n$]+?)\$\$/;
// GitHub-like guards: content can't start/end with whitespace and the closing
// $ can't be followed by a digit, so currency ("$5 and $10") stays literal
const INLINE = /^\$(?!\s)((?:\\.|[^\\\n$])+?)(?<!\s)\$(?!\d)/;

export interface MathToken extends Tokens.Generic {
  type: "blockMath" | "inlineMath";
  raw: string;
  text: string;
  displayMode?: boolean;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export const mathExtension: MarkedExtension = {
  extensions: [
    {
      name: "blockMath",
      level: "block",
      start: (src: string) => src.match(/^\$\$/m)?.index,
      tokenizer(src: string): MathToken | undefined {
        const m = BLOCK.exec(src);
        if (!m || m[1].trim() === "") return undefined;
        return { type: "blockMath", raw: m[0], text: m[1].trim() };
      },
      renderer(token) {
        // same shape as a ```math fence, so the preview post-pass needs no special case
        return `<pre><code class="language-math">${escapeHtml((token as MathToken).text)}</code></pre>\n`;
      },
    },
    {
      name: "inlineMath",
      level: "inline",
      start: (src: string) => src.match(/\$/)?.index,
      tokenizer(src: string): MathToken | undefined {
        let m = INLINE_BACKTICK.exec(src);
        if (m) return { type: "inlineMath", raw: m[0], text: m[1].trim() };
        m = INLINE_DISPLAY.exec(src);
        if (m && m[1].trim() !== "")
          return { type: "inlineMath", raw: m[0], text: m[1].trim(), displayMode: true };
        m = INLINE.exec(src);
        if (m) return { type: "inlineMath", raw: m[0], text: m[1] };
        return undefined;
      },
      renderer(token) {
        const t = token as MathToken;
        const cls = t.displayMode ? "language-math-display" : "language-math-inline";
        return `<code class="${cls}">${escapeHtml(t.text)}</code>`;
      },
    },
  ],
};
