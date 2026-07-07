import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile, writeFile } from "@tauri-apps/plugin-fs";

const MD_FILTERS = [{ name: "Markdown", extensions: ["md", "markdown", "txt"] }];
const ALL_FILTER = { name: "All Files", extensions: ["*"] };

export async function openMarkdownFile(): Promise<{ path: string; text: string } | null> {
  const path = await open({ multiple: false, filters: [...MD_FILTERS, ALL_FILTER] });
  if (!path) return null;
  const text = await readTextFile(path);
  return { path, text };
}

export async function readMarkdownFile(path: string): Promise<string | null> {
  return readTextFile(path).catch(() => null);
}

export async function saveTextAs(text: string, suggestedName: string): Promise<string | null> {
  const ext = suggestedName.slice(suggestedName.lastIndexOf(".") + 1).toLowerCase();
  const filters = /^(md|markdown|txt)$/.test(ext)
    ? MD_FILTERS
    : [{ name: ext.toUpperCase(), extensions: [ext] }, ALL_FILTER];
  const path = await save({ filters, defaultPath: suggestedName });
  if (!path) return null;
  await writeTextFile(path, text);
  return path;
}

export async function saveMarkdown(path: string, text: string): Promise<void> {
  await writeTextFile(path, text);
}

export async function saveDocxAs(bytes: Uint8Array, suggestedName: string): Promise<string | null> {
  const path = await save({
    filters: [{ name: "Word Document", extensions: ["docx"] }],
    defaultPath: suggestedName,
  });
  if (!path) return null;
  await writeFile(path, bytes);
  return path;
}
