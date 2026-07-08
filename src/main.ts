import { confirm } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { createEditor, getText, setText, setLanguageFor } from "./editor";
import { renderPreview } from "./preview";
import { openMarkdownFile, readMarkdownFile, readBinaryFile, saveMarkdown, saveTextAs, saveDocxAs, statMtime } from "./file";
import { isMarkdownFile } from "./filetype";
import { markdownToDocx } from "./export-docx";
import {
  cycleHeading,
  insertLink,
  toggleCode,
  toggleInline,
  toggleLinePrefix,
  toggleOrderedList,
} from "./format";
import { formatDocument } from "./prettify";
import { gitStatus, gitCommit, gitPush } from "./git";
import { toggleTerminal, terminalPanelEl, refreshTerminalTheme } from "./terminal";
import { initTheme, cycleTheme } from "./theme";
import {
  initExplorer,
  toggleExplorer,
  chooseRootFolder,
  markActive,
  refreshExplorer,
  sidebarEl,
} from "./explorer";

const appWindow = getCurrentWindow();
const previewEl = document.querySelector<HTMLElement>("#preview")!;
const statusFileEl = document.querySelector<HTMLElement>("#status-file")!;
const statusWordsEl = document.querySelector<HTMLElement>("#status-words")!;
const statusGitEl = document.querySelector<HTMLElement>("#status-git")!;

let currentPath: string | null = null;
let savedText = "";
let lastMtime: number | null = null;
let previewTimer: ReturnType<typeof setTimeout> | undefined;

const toolbarEl = document.querySelector<HTMLElement>("#toolbar")!;
const previewBtn = toolbarEl.querySelector<HTMLButtonElement>('[data-action="preview"]')!;
const terminalBtn = toolbarEl.querySelector<HTMLButtonElement>('[data-action="terminal"]')!;
const themeBtn = toolbarEl.querySelector<HTMLButtonElement>('[data-action="theme"]')!;
const explorerBtn = toolbarEl.querySelector<HTMLButtonElement>('[data-action="explorer"]')!;

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
  return fileName().replace(/\.[^./]+$/, "");
}

function isDirty(): boolean {
  return getText(editor) !== savedText;
}

function docIsMarkdown(): boolean {
  return isMarkdownFile(currentPath && fileName());
}

// buttons that insert markdown syntax or only make sense for markdown documents
const MD_ONLY_ACTIONS = ["bold", "italic", "strike", "heading", "ul", "ol", "quote", "code", "link", "export", "preview"];
const mdOnlyBtns = MD_ONLY_ACTIONS.map(
  (a) => toolbarEl.querySelector<HTMLButtonElement>(`[data-action="${a}"]`)!
);

function applyDocMode(): void {
  const md = docIsMarkdown();
  for (const b of mdOnlyBtns) b.disabled = !md;
  if (!md && !previewEl.hidden) togglePreview();
  void setLanguageFor(editor, currentPath ? fileName() : null);
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
  if (previewEl.hidden && !docIsMarkdown()) return; // can always close, never open for code
  previewEl.hidden = !previewEl.hidden;
  previewBtn.setAttribute("aria-pressed", String(!previewEl.hidden));
  if (!previewEl.hidden) renderPreview(previewEl, getText(editor));
  editor.focus();
}

function repoDir(): string | null {
  return currentPath ? currentPath.slice(0, currentPath.lastIndexOf("/")) : null;
}

let gitFlashTimer: ReturnType<typeof setTimeout> | undefined;

async function refreshGit(): Promise<void> {
  clearTimeout(gitFlashTimer);
  const dir = repoDir();
  if (!dir) {
    statusGitEl.hidden = true;
    return;
  }
  const s = await gitStatus(dir).catch(() => null);
  if (!s?.is_repo) {
    statusGitEl.hidden = true;
    return;
  }
  let text = `⎇ ${s.branch}`;
  if (s.dirty) text += ` · ${s.dirty}`;
  if (s.ahead) text += ` ↑${s.ahead}`;
  if (s.behind) text += ` ↓${s.behind}`;
  statusGitEl.textContent = text;
  statusGitEl.hidden = false;
}

function flashGit(msg: string): void {
  clearTimeout(gitFlashTimer);
  statusGitEl.textContent = msg;
  statusGitEl.hidden = false;
  gitFlashTimer = setTimeout(() => void refreshGit(), 4000);
}

function beginCommit(): void {
  if (!repoDir() || statusGitEl.hidden || statusGitEl.querySelector("input")) return;
  const input = document.createElement("input");
  input.id = "commit-input";
  input.placeholder = "commit message · ↩ commit · esc cancel";
  statusGitEl.textContent = "";
  statusGitEl.appendChild(input);
  input.focus();
  let done = false;
  const finish = (refocusEditor: boolean) => {
    if (done) return;
    done = true;
    void refreshGit();
    if (refocusEditor) editor.focus();
  };
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const message = input.value.trim();
      if (!message) return;
      done = true;
      void (async () => {
        if (isDirty()) await saveDocument();
        try {
          const sha = await gitCommit(repoDir()!, currentPath, message);
          flashGit(`✓ ${sha} — ⌘⇧P to push`);
        } catch (err) {
          flashGit(String(err));
        }
        editor.focus();
      })();
    } else if (e.key === "Escape") {
      finish(true);
    }
  });
  input.addEventListener("blur", () => finish(false));
}

async function pushRepo(): Promise<void> {
  const dir = repoDir();
  if (!dir || statusGitEl.hidden) return;
  statusGitEl.textContent = "pushing…";
  try {
    await gitPush(dir);
    flashGit("✓ pushed");
  } catch (err) {
    flashGit(String(err).split("\n")[0]);
  }
}

async function toggleTerminalPanel(): Promise<void> {
  const opened = await toggleTerminal(repoDir);
  terminalBtn.setAttribute("aria-pressed", String(opened));
  if (!opened) editor.focus();
}

let statusFlashTimer: ReturnType<typeof setTimeout> | undefined;

// transient message in the word-count slot, restored after a beat
function flashStatus(msg: string): void {
  clearTimeout(statusFlashTimer);
  statusWordsEl.textContent = msg;
  statusFlashTimer = setTimeout(() => updateStatus(getText(editor)), 1500);
}

function cycleAppTheme(): void {
  const t = cycleTheme();
  refreshTerminalTheme();
  themeBtn.title = `Theme: ${t} ⌘⇧T`;
  flashStatus(`theme: ${t}`);
}

async function runFormat(): Promise<void> {
  if (await formatDocument(editor, currentPath ? fileName() : null)) return;
  const n = fileName();
  const dot = n.lastIndexOf(".");
  flashStatus(`no formatter for ${dot > 0 ? n.slice(dot) : n}`);
}

function toggleExplorerPanel(): void {
  explorerBtn.setAttribute("aria-pressed", String(toggleExplorer()));
}

async function openFolder(): Promise<void> {
  if ((await chooseRootFolder()) && sidebarEl.hidden) toggleExplorerPanel();
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
  lastMtime = null;
  setText(editor, "");
  updateStatus("");
  void refreshGit();
  markActive(null);
  applyDocMode();
  editor.focus();
}

function loadDocument(path: string, text: string): void {
  currentPath = path;
  savedText = text;
  lastMtime = null;
  void statMtime(path).then((m) => {
    if (currentPath === path) lastMtime = m;
  });
  setText(editor, text);
  updateStatus(text);
  void refreshGit();
  markActive(path);
  applyDocMode();
  if (!previewEl.hidden) renderPreview(previewEl, text);
  editor.focus();
}

async function openDocument(): Promise<void> {
  if (!(await confirmDiscard())) return;
  const result = await openMarkdownFile();
  if (result) loadDocument(result.path, result.text);
}

async function openDocumentAtPath(path: string): Promise<void> {
  if (path === currentPath) return;
  if (!(await confirmDiscard())) return;
  const text = await readMarkdownFile(path);
  if (text !== null) loadDocument(path, text);
}

async function saveDocument(forceDialog = false): Promise<void> {
  const text = getText(editor);
  if (currentPath && !forceDialog) {
    // don't silently clobber an external edit
    const diskMtime = await statMtime(currentPath);
    if (diskMtime !== null && lastMtime !== null && diskMtime > lastMtime) {
      const overwrite = await confirm("This file changed on disk since you opened it. Overwrite?", {
        title: "File Changed on Disk",
        kind: "warning",
        okLabel: "Overwrite",
        cancelLabel: "Cancel",
      });
      if (!overwrite) return;
    }
    await saveMarkdown(currentPath, text);
  } else {
    const path = await saveTextAs(text, docIsMarkdown() ? `${baseName()}.md` : fileName());
    if (!path) return;
    currentPath = path;
    markActive(path);
  }
  savedText = text;
  lastMtime = await statMtime(currentPath);
  localStorage.removeItem(RECOVERY_KEY);
  updateStatus(text);
  void refreshGit();
}

// crash recovery: a dirty buffer is snapshotted so an unclean exit loses nothing
const RECOVERY_KEY = "recovery";

interface RecoverySlot {
  path: string | null;
  text: string;
  ts: number;
}

function writeRecovery(): void {
  try {
    if (isDirty()) {
      const slot: RecoverySlot = { path: currentPath, text: getText(editor), ts: Date.now() };
      localStorage.setItem(RECOVERY_KEY, JSON.stringify(slot));
    } else {
      localStorage.removeItem(RECOVERY_KEY);
    }
  } catch {
    // quota exceeded on a huge doc — recovery is best-effort
  }
}

async function offerRecovery(): Promise<void> {
  const raw = localStorage.getItem(RECOVERY_KEY);
  if (!raw) return;
  localStorage.removeItem(RECOVERY_KEY);
  let slot: RecoverySlot;
  try {
    slot = JSON.parse(raw) as RecoverySlot;
  } catch {
    return;
  }
  if (typeof slot?.text !== "string") return;
  const name = slot.path ? (slot.path.split("/").pop() ?? "Untitled") : "Untitled";
  const restore = await confirm(`Restore unsaved changes to “${name}” from your last session?`, {
    title: "Restore Unsaved Changes",
    kind: "info",
    okLabel: "Restore",
    cancelLabel: "Discard",
  });
  if (!restore) return;
  if (slot.path) {
    const disk = await readMarkdownFile(slot.path);
    if (disk !== null) {
      loadDocument(slot.path, disk); // savedText = disk state, so the dirty dot is truthful
      if (disk !== slot.text) setText(editor, slot.text);
      return;
    }
  }
  setText(editor, slot.text);
}

async function reloadFromDisk(): Promise<boolean> {
  if (!currentPath) return false;
  const text = await readMarkdownFile(currentPath);
  if (text === null) return false;
  loadDocument(currentPath, text);
  return true;
}

// focus-time check: someone may have edited the file outside Spark
async function checkExternalChange(): Promise<void> {
  if (!currentPath || lastMtime === null) return;
  const diskMtime = await statMtime(currentPath);
  if (diskMtime === null || diskMtime <= lastMtime) return;
  if (isDirty()) {
    flashStatus("file changed on disk — save will ask to overwrite");
  } else if (await reloadFromDisk()) {
    flashStatus("reloaded from disk");
  }
}

// local images only: relative paths resolve against the document's directory;
// remote URLs keep the alt-text fallback (data: URLs are handled by the exporter)
function resolveDocImage(href: string): Promise<Uint8Array | null> {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return Promise.resolve(null);
  if (href.startsWith("/")) return readBinaryFile(href);
  const dir = repoDir();
  return dir ? readBinaryFile(`${dir}/${href}`) : Promise.resolve(null);
}

async function exportDocx(): Promise<void> {
  if (!docIsMarkdown()) return;
  const bytes = await markdownToDocx(getText(editor), { resolveImage: resolveDocImage });
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
  format: () => void runFormat(),
  new: () => void newDocument(),
  open: () => void openDocument(),
  save: () => void saveDocument(),
  export: () => void exportDocx(),
  preview: () => togglePreview(),
  terminal: () => void toggleTerminalPanel(),
  theme: () => cycleAppTheme(),
  explorer: () => toggleExplorerPanel(),
};

toolbarEl.addEventListener("mousedown", (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-action]");
  if (!btn || btn.disabled) return;
  e.preventDefault();
  toolbarActions[btn.dataset.action!]?.();
});

toolbarEl.addEventListener("mouseenter", () => {
  document.body.classList.remove("typing");
});

window.addEventListener(
  "keydown",
  (e) => {
    // terminal owns its keys (⌘B/⌘S/… must not fire app actions); only ⌘J escapes
    if (terminalPanelEl.contains(e.target as Node)) {
      if (e.metaKey && !e.ctrlKey && !e.altKey && e.key.toLowerCase() === "j") {
        e.preventDefault();
        e.stopPropagation();
        void toggleTerminalPanel();
      }
      return;
    }
    // the commit input handles Enter/Escape itself
    if ((e.target as HTMLElement).id === "commit-input") return;
    if (!e.metaKey || e.ctrlKey || e.altKey) return;
    const key = e.key.toLowerCase();
    let handled = true;
    if (key === "n" && !e.shiftKey) void newDocument();
    else if (key === "o" && !e.shiftKey) void openDocument();
    else if (key === "s") void saveDocument(e.shiftKey);
    else if (key === "e" && !e.shiftKey) void exportDocx();
    else if (key === "/") togglePreview();
    else if (key === "b" && !e.shiftKey) { if (docIsMarkdown()) toggleInline(editor, "**"); }
    else if (key === "i" && !e.shiftKey) { if (docIsMarkdown()) toggleInline(editor, "*"); }
    else if (key === "k" && !e.shiftKey) { if (docIsMarkdown()) insertLink(editor); }
    else if (key === "f" && e.shiftKey) void runFormat();
    else if (key === "j" && !e.shiftKey) void toggleTerminalPanel();
    else if (key === "c" && e.shiftKey) beginCommit();
    else if (key === "p" && e.shiftKey) void pushRepo();
    else if (key === "t" && e.shiftKey) cycleAppTheme();
    else if (key === "e" && e.shiftKey) toggleExplorerPanel();
    else if (key === "o" && e.shiftKey) void openFolder();
    else handled = false;
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  },
  { capture: true }
);

statusGitEl.addEventListener("click", () => beginCommit());

let gitFocusTimer: ReturnType<typeof setTimeout> | undefined;
window.addEventListener("focus", () => {
  clearTimeout(gitFocusTimer);
  gitFocusTimer = setTimeout(() => {
    void refreshGit();
    refreshExplorer();
    void checkExternalChange();
  }, 300);
});

void appWindow.onCloseRequested(async (event) => {
  if (!(await confirmDiscard())) {
    event.preventDefault();
    return;
  }
  localStorage.removeItem(RECOVERY_KEY); // deliberate discard — nothing to recover
});

setInterval(writeRecovery, 30_000);
window.addEventListener("blur", writeRecovery);

initExplorer({ onOpenFile: (p) => void openDocumentAtPath(p), getFallbackRoot: repoDir });
themeBtn.title = `Theme: ${initTheme()} ⌘⇧T`;
updateStatus("");
editor.focus();
void offerRecovery();
