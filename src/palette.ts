import { fuzzyScore } from "./fuzzy";

// Transient command palette (⌘K): a top-center overlay that exists only while
// open — the same disappearing-UI idea as the inline commit input. Second-stage
// lists (branches, themes, headings…) are just another openPalette call from an
// item's run().

export interface PaletteItem {
  label: string;
  hint?: string;
  run: () => void;
}

interface PaletteOpts {
  placeholder?: string;
}

interface PaletteInit {
  restoreFocus: () => void;
}

let init: PaletteInit = { restoreFocus: () => {} };
let overlay: HTMLElement | null = null;
let input: HTMLInputElement;
let list: HTMLElement;
let items: PaletteItem[] = [];
let matches: PaletteItem[] = [];
let selected = 0;

export function initPalette(options: PaletteInit): void {
  init = options;
}

export function isPaletteOpen(): boolean {
  return overlay !== null && !overlay.hidden;
}

export function openPalette(newItems: PaletteItem[], opts: PaletteOpts = {}): void {
  ensureDom();
  items = newItems;
  selected = 0;
  input.value = "";
  input.placeholder = opts.placeholder ?? "Type a command…";
  overlay!.hidden = false;
  render();
  input.focus();
}

export function closePalette(refocus = true): void {
  if (!isPaletteOpen()) return;
  overlay!.hidden = true;
  if (refocus) init.restoreFocus();
}

function pick(item: PaletteItem | undefined): void {
  if (!item) return;
  // refocus first so editor commands act on the live selection; a second-stage
  // run() that reopens the palette simply takes focus straight back
  closePalette(true);
  item.run();
}

function move(delta: number): void {
  if (matches.length === 0) return;
  selected = (selected + delta + matches.length) % matches.length;
  render();
  list.querySelector(".selected")?.scrollIntoView({ block: "nearest" });
}

function render(): void {
  const q = input.value.trim();
  const scored: { item: PaletteItem; score: number }[] = [];
  for (const item of items) {
    const score = fuzzyScore(q, item.label);
    if (score !== null) scored.push({ item, score });
  }
  scored.sort((a, b) => b.score - a.score); // stable: given order preserved on ties
  matches = scored.map((s) => s.item);
  if (selected >= matches.length) selected = Math.max(0, matches.length - 1);
  list.textContent = "";
  matches.forEach((item, i) => {
    const row = document.createElement("div");
    row.className = "palette-item" + (i === selected ? " selected" : "");
    row.dataset.index = String(i);
    const label = document.createElement("span");
    label.className = "label";
    label.textContent = item.label;
    row.appendChild(label);
    if (item.hint) {
      const hint = document.createElement("span");
      hint.className = "hint";
      hint.textContent = item.hint;
      row.appendChild(hint);
    }
    list.appendChild(row);
  });
}

function ensureDom(): void {
  if (overlay) return;
  overlay = document.createElement("div");
  overlay.id = "palette";
  overlay.hidden = true;
  input = document.createElement("input");
  input.spellcheck = false;
  list = document.createElement("div");
  list.id = "palette-list";
  overlay.append(input, list);
  document.body.appendChild(overlay);

  input.addEventListener("input", () => {
    selected = 0;
    render();
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || (e.ctrlKey && e.key === "n")) move(1);
    else if (e.key === "ArrowUp" || (e.ctrlKey && e.key === "p")) move(-1);
    else if (e.key === "Enter") pick(matches[selected]);
    else if (e.key === "Escape" || (e.metaKey && e.key.toLowerCase() === "k")) closePalette(true);
    else return;
    e.preventDefault();
    e.stopPropagation();
  });
  input.addEventListener("blur", () => closePalette(false));
  // mousedown, not click: the input's blur-close would otherwise eat the click
  list.addEventListener("mousedown", (e) => {
    e.preventDefault();
    const row = (e.target as HTMLElement).closest<HTMLElement>(".palette-item");
    if (row) pick(matches[Number(row.dataset.index)]);
  });
}
