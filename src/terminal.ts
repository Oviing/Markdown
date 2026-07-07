import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export const terminalPanelEl = document.querySelector<HTMLElement>("#terminal-panel")!;

let term: Terminal | null = null;
let fitAddon: FitAddon | null = null;
let sessionAlive = false;

function themeFromCss(): Record<string, string> {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  return {
    background: v("--bg"),
    foreground: v("--fg"),
    cursor: v("--fg"),
    selectionBackground: v("--selection"),
    brightBlack: v("--muted"),
  };
}

export function refreshTerminalTheme(): void {
  if (term) term.options.theme = themeFromCss();
}

function fitAndResize(): void {
  if (!term || !fitAddon || terminalPanelEl.hidden) return;
  fitAddon.fit();
  if (sessionAlive) {
    void invoke("pty_resize", { cols: term.cols, rows: term.rows });
  }
}

async function createTerminal(): Promise<Terminal> {
  const css = getComputedStyle(document.documentElement);
  const created = new Terminal({
    fontFamily: css.getPropertyValue("--mono").trim() || "Menlo, monospace",
    fontSize: 13,
    cursorBlink: true,
    theme: themeFromCss(),
  });
  fitAddon = new FitAddon();
  created.loadAddon(fitAddon);
  created.open(document.querySelector<HTMLElement>("#terminal")!);

  // native ⌘C/⌘V copy/paste must bypass xterm's key handling
  created.attachCustomKeyEventHandler(
    (e) => !(e.metaKey && (e.key === "c" || e.key === "v"))
  );

  created.onData((data) => void invoke("pty_write", { data }));
  await listen<number[]>("pty:output", (e) => created.write(new Uint8Array(e.payload)));
  await listen("pty:exit", () => {
    sessionAlive = false;
    created.write("\r\n\x1b[2m[process exited — ⌘J twice for a new shell]\x1b[0m\r\n");
  });

  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    created.options.theme = themeFromCss();
  });
  new ResizeObserver(() => fitAndResize()).observe(terminalPanelEl);

  return created;
}

async function spawnShell(cwd: string | null): Promise<void> {
  if (!term) return;
  await invoke("pty_spawn", { cwd, cols: term.cols, rows: term.rows });
  sessionAlive = true;
}

export async function toggleTerminal(getCwd: () => string | null): Promise<boolean> {
  const opening = terminalPanelEl.hidden;
  terminalPanelEl.hidden = !opening;
  if (!opening) return false;

  if (!term) term = await createTerminal();
  // fit only after the panel is visible: fitting while hidden yields 0×0
  await new Promise(requestAnimationFrame);
  fitAddon!.fit();
  if (!sessionAlive) await spawnShell(getCwd());
  else void invoke("pty_resize", { cols: term.cols, rows: term.rows });
  term.focus();
  return true;
}
