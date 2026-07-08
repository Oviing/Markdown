// A leading `---\n…\n---` block. marked has no frontmatter support, so without
// this it renders as a thematic break plus body text.
const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

export interface Frontmatter {
  fm: string | null;
  body: string;
}

export function splitFrontmatter(text: string): Frontmatter {
  const m = FM_RE.exec(text);
  if (!m) return { fm: null, body: text };
  return { fm: m[1], body: text.slice(m[0].length) };
}

// Naive line-wise `key: value` split for display purposes only — nested YAML
// stays raw. Lines without a colon get a null key.
export function frontmatterEntries(fm: string): [string | null, string][] {
  return fm
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "")
    .map((line) => {
      const colon = line.indexOf(":");
      if (colon <= 0) return [null, line];
      return [line.slice(0, colon).trim(), line.slice(colon + 1).trim()];
    });
}
