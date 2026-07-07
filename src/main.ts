import { confirm } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { createEditor, getText, setText } from "./editor";
import { renderPreview } from "./preview";
import { openMarkdownFile, saveMarkdown, saveMarkdownAs, saveDocxAs } from "./file";
import { markdownToDocx } from "./export-docx";
import {
  cycleHeading,
  insertLink,
  toggleCode,
  toggleInline,
  toggleLinePrefix,
  toggleOrderedList,
} from "./format";

const appWindow = getCurrentWindow();
const previewEl = document.querySelector<HTMLElement>("#preview")!;
const statusFileEl = document.querySelector<HTMLElement>("#status-file")!;
const statusWordsEl = document.querySelector<HTMLElement>("#status-words")!;

let currentPath: string | null = null;
let savedText = "";
let previewTimer: ReturnType<typeof setTimeout> | undefined;

const toolbarEl = document.querySelector<HTMLElement>("#toolbar")!;
const previewBtn = toolbarEl.querySelector<HTMLButtonElement>('[data-action="preview"]')!;

const editor = createEditor(document.querySelector<HTMLElement>("#editor")!, (text) => {
  document.body.classList.add("typing");
  updateStatus(text);
  schedulePreview(text);
});

function fileName(): string {
  if (!currentPath) return "Untitled";
  return currentPath.split("/").pop() ?? "Untitled";
}

function baseName(): string {
  return fileName().replace(/\.(md|markdown|txt)$/i, "");
}

function isDirty(): boolean {
  return getText(editor) !== savedText;
}

function updateStatus(text: string): void {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const dirty = getText(editor) !== savedText;
  statusFileEl.textContent = fileName() + (dirty ? " ●" : "");
  statusWordsEl.textContent = `${words} ${words === 1 ? "word" : "words"}`;
  void appWindow.setTitle(fileName() + (dirty ? " — Edited" : ""));
}

function schedulePreview(text: string): void {
  if (previewEl.hidden) return;
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => renderPreview(previewEl, text), 150);
}

function togglePreview(): void {
  previewEl.hidden = !previewEl.hidden;
  previewBtn.setAttribute("aria-pressed", String(!previewEl.hidden));
  if (!previewEl.hidden) renderPreview(previewEl, getText(editor));
  editor.focus();
}

async function confirmDiscard(): Promise<boolean> {
  if (!isDirty()) return true;
  return confirm("You have unsaved changes. Discard them?", {
    title: "Unsaved Changes",
    kind: "warning",
    okLabel: "Discard",
    cancelLabel: "Cancel",
  });
}

async function newDocument(): Promise<void> {
  if (!(await confirmDiscard())) return;
  currentPath = null;
  savedText = "";
  setText(editor, "");
  updateStatus("");
  editor.focus();
}

async function openDocument(): Promise<void> {
  if (!(await confirmDiscard())) return;
  const result = await openMarkdownFile();
  if (!result) return;
  currentPath = result.path;
  savedText = result.text;
  setText(editor, result.text);
  updateStatus(result.text);
  if (!previewEl.hidden) renderPreview(previewEl, result.text);
  editor.focus();
}

async function saveDocument(forceDialog = false): Promise<void> {
  const text = getText(editor);
  if (currentPath && !forceDialog) {
    await saveMarkdown(currentPath, text);
  } else {
    const path = await saveMarkdownAs(text, `${baseName()}.md`);
    if (!path) return;
    currentPath = path;
  }
  savedText = text;
  updateStatus(text);
}

async function exportDocx(): Promise<void> {
  const bytes = await markdownToDocx(getText(editor));
  await saveDocxAs(bytes, `${baseName()}.docx`);
}

const toolbarActions: Record<string, () => void> = {
  bold: () => toggleInline(editor, "**"),
  italic: () => toggleInline(editor, "*"),
  strike: () => toggleInline(editor, "~~"),
  heading: () => cycleHeading(editor),
  ul: () => toggleLinePrefix(editor, "- "),
  ol: () => toggleOrderedList(editor),
  quote: () => toggleLinePrefix(editor, "> "),
  code: () => toggleCode(editor),
  link: () => insertLink(editor),
  new: () => void newDocument(),
  open: () => void openDocument(),
  save: () => void saveDocument(),
  export: () => void exportDocx(),
  preview: () => togglePreview(),
};

toolbarEl.addEventListener("mousedown", (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-action]");
  if (!btn) return;
  e.preventDefault();
  toolbarActions[btn.dataset.action!]?.();
});

toolbarEl.addEventListener("mouseenter", () => {
  document.body.classList.remove("typing");
});

window.addEventListener(
  "keydown",
  (e) => {
    if (!e.metaKey || e.ctrlKey || e.altKey) return;
    const key = e.key.toLowerCase();
    let handled = true;
    if (key === "n" && !e.shiftKey) void newDocument();
    else if (key === "o" && !e.shiftKey) void openDocument();
    else if (key === "s") void saveDocument(e.shiftKey);
    else if (key === "e" && !e.shiftKey) void exportDocx();
    else if (key === "/") togglePreview();
    else if (key === "b" && !e.shiftKey) toggleInline(editor, "**");
    else if (key === "i" && !e.shiftKey) toggleInline(editor, "*");
    else if (key === "k" && !e.shiftKey) insertLink(editor);
    else handled = false;
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  },
  { capture: true }
);

void appWindow.onCloseRequested(async (event) => {
  if (!(await confirmDiscard())) event.preventDefault();
});

updateStatus("");
editor.focus();
