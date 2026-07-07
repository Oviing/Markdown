import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile, writeFile } from "@tauri-apps/plugin-fs";

const MD_FILTERS = [{ name: "Markdown", extensions: ["md", "markdown", "txt"] }];

export async function openMarkdownFile(): Promise<{ path: string; text: string } | null> {
  const path = await open({ multiple: false, filters: MD_FILTERS });
  if (!path) return null;
  const text = await readTextFile(path);
  return { path, text };
}

export async function saveMarkdownAs(text: string, suggestedName: string): Promise<string | null> {
  const path = await save({ filters: MD_FILTERS, defaultPath: suggestedName });
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
