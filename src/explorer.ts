import { readDir } from "@tauri-apps/plugin-fs";
import { open } from "@tauri-apps/plugin-dialog";
import { isTextFile } from "./filetype";

export const sidebarEl = document.querySelector<HTMLElement>("#sidebar")!;
const headerEl = sidebarEl.querySelector<HTMLElement>("#sidebar-header")!;
const treeEl = sidebarEl.querySelector<HTMLElement>("#file-tree")!;

const STORAGE_KEY = "explorer-root";
const CHEVRON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';

interface Entry {
  name: string;
  path: string;
  isDir: boolean;
}

interface ExplorerOpts {
  onOpenFile: (path: string) => void;
  getFallbackRoot: () => string | null;
  getRecentFiles?: () => string[];
}

let opts: ExplorerOpts;
let root: string | null = localStorage.getItem(STORAGE_KEY);
let activePath: string | null = null;
const expanded = new Set<string>();
const listings = new Map<string, Entry[]>();

function effectiveRoot(): string | null {
  return root ?? opts.getFallbackRoot();
}

async function listDir(dir: string): Promise<Entry[]> {
  let entries = listings.get(dir);
  if (!entries) {
    const raw = await readDir(dir).catch(() => []);
    entries = raw
      .filter((e) => !e.name.startsWith("."))
      .map((e) => ({ name: e.name, path: `${dir}/${e.name}`, isDir: e.isDirectory }))
      .sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name));
    listings.set(dir, entries);
  }
  return entries;
}

async function renderChildren(dir: string, depth: number): Promise<DocumentFragment> {
  const frag = document.createDocumentFragment();
  for (const entry of await listDir(dir)) {
    const row = document.createElement("div");
    row.className = "tree-row" + (entry.isDir ? " dir" : isTextFile(entry.name) ? "" : " dim");
    row.dataset.path = entry.path;
    // files get extra padding so names align with folder names past the chevron
    row.style.paddingLeft = `${8 + depth * 14 + (entry.isDir ? 0 : 16)}px`;
    if (entry.isDir) {
      if (expanded.has(entry.path)) row.classList.add("open");
      row.innerHTML = CHEVRON;
    }
    if (entry.path === activePath) row.classList.add("active");
    row.appendChild(document.createTextNode(entry.name));
    frag.appendChild(row);
    if (entry.isDir && expanded.has(entry.path)) {
      frag.appendChild(await renderChildren(entry.path, depth + 1));
    }
  }
  return frag;
}

async function renderTree(): Promise<void> {
  const r = effectiveRoot();
  headerEl.textContent = r ? (r.split("/").pop() ?? r) : "Open Folder…";
  headerEl.title = r ?? "";
  treeEl.textContent = "";
  if (!r) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Open Folder… ⌘⇧O";
    treeEl.appendChild(empty);
    // fill the otherwise-bare panel with the recent-files list
    const recents = opts.getRecentFiles?.() ?? [];
    if (recents.length) {
      const header = document.createElement("div");
      header.className = "tree-note";
      header.textContent = "Recent";
      treeEl.appendChild(header);
      for (const path of recents) {
        const row = document.createElement("div");
        row.className = "tree-row" + (isTextFile(path) ? "" : " dim");
        row.dataset.path = path;
        row.style.paddingLeft = "8px";
        row.title = path;
        if (path === activePath) row.classList.add("active");
        row.appendChild(document.createTextNode(path.split("/").pop() ?? path));
        treeEl.appendChild(row);
      }
    }
    return;
  }
  treeEl.appendChild(await renderChildren(r, 0));
}

export function initExplorer(options: ExplorerOpts): void {
  opts = options;
  sidebarEl.addEventListener("mousedown", (e) => {
    e.preventDefault(); // keep editor focus, like the toolbar
    const target = e.target as HTMLElement;
    if (target.closest("#sidebar-header") || target.closest(".empty")) {
      void chooseRootFolder();
      return;
    }
    const row = target.closest<HTMLElement>(".tree-row");
    if (!row) return;
    const path = row.dataset.path!;
    if (row.classList.contains("dir")) {
      if (expanded.has(path)) expanded.delete(path);
      else expanded.add(path);
      void renderTree();
    } else if (!row.classList.contains("dim")) {
      opts.onOpenFile(path);
    }
  });
}

export function toggleExplorer(): boolean {
  sidebarEl.hidden = !sidebarEl.hidden;
  if (!sidebarEl.hidden) void renderTree();
  return !sidebarEl.hidden;
}

export async function chooseRootFolder(): Promise<boolean> {
  const dir = await open({ directory: true });
  if (!dir) return false;
  root = dir;
  localStorage.setItem(STORAGE_KEY, dir);
  expanded.clear();
  listings.clear();
  if (!sidebarEl.hidden) void renderTree();
  return true;
}

export function markActive(path: string | null): void {
  activePath = path;
  if (sidebarEl.hidden) return;
  // no explicit root: the fallback root may have just appeared or changed
  if (!root) {
    void renderTree();
    return;
  }
  sidebarEl.querySelector(".tree-row.active")?.classList.remove("active");
  if (path) {
    sidebarEl.querySelector(`[data-path="${CSS.escape(path)}"]`)?.classList.add("active");
  }
}

export function refreshExplorer(): void {
  if (sidebarEl.hidden) return;
  listings.clear();
  void renderTree();
}
