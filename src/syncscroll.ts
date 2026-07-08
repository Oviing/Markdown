import type { EditorView } from "@codemirror/view";

// Proportional scroll sync between the editor and the preview pane. CodeMirror
// estimates off-screen line heights, so the mapping is approximate on docs with
// large rendered elements — accepted trade-off for zero bookkeeping.
//
// Echo suppression: the pane driving the scroll holds a lock until it has been
// quiet for a beat; the mirrored pane's scroll events are ignored while the
// lock is held by the other pane. A frame-based guard is not enough here — the
// echoed scroll event can arrive after the next animation frame (especially
// during trackpad momentum), and the lossy round-trip mapping then makes the
// panes ping-pong each other into a slow phantom scroll.

let lockedSource: HTMLElement | null = null;
let unlockTimer: ReturnType<typeof setTimeout> | undefined;

function follow(from: HTMLElement, to: HTMLElement): void {
  const fromMax = from.scrollHeight - from.clientHeight;
  const toMax = to.scrollHeight - to.clientHeight;
  if (fromMax <= 0 || toMax <= 0) return;
  lockedSource = from;
  clearTimeout(unlockTimer);
  unlockTimer = setTimeout(() => {
    lockedSource = null;
  }, 150);
  to.scrollTop = (from.scrollTop / fromMax) * toMax;
}

export function initSyncScroll(editor: EditorView, previewEl: HTMLElement): void {
  const scroller = editor.scrollDOM;
  scroller.addEventListener("scroll", () => {
    if (lockedSource !== previewEl && !previewEl.hidden) follow(scroller, previewEl);
  });
  previewEl.addEventListener("scroll", () => {
    if (lockedSource !== scroller && !previewEl.hidden) follow(previewEl, scroller);
  });
}

// re-align after the preview re-renders (its content height just changed)
export function pushEditorScroll(editor: EditorView, previewEl: HTMLElement): void {
  if (!previewEl.hidden) follow(editor.scrollDOM, previewEl);
}
