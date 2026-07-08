import type { EditorView } from "@codemirror/view";

// Proportional scroll sync between the editor and the preview pane. CodeMirror
// estimates off-screen line heights, so the mapping is approximate on docs with
// large rendered elements — accepted trade-off for zero bookkeeping.

let syncing = false;

function follow(from: HTMLElement, to: HTMLElement): void {
  const fromMax = from.scrollHeight - from.clientHeight;
  const toMax = to.scrollHeight - to.clientHeight;
  if (fromMax <= 0 || toMax <= 0) return;
  syncing = true;
  to.scrollTop = (from.scrollTop / fromMax) * toMax;
  // the mirrored scroll event fires async — release the guard next frame
  requestAnimationFrame(() => {
    syncing = false;
  });
}

export function initSyncScroll(editor: EditorView, previewEl: HTMLElement): void {
  const scroller = editor.scrollDOM;
  scroller.addEventListener("scroll", () => {
    if (!syncing && !previewEl.hidden) follow(scroller, previewEl);
  });
  previewEl.addEventListener("scroll", () => {
    if (!syncing && !previewEl.hidden) follow(previewEl, scroller);
  });
}

// re-align after the preview re-renders (its content height just changed)
export function pushEditorScroll(editor: EditorView, previewEl: HTMLElement): void {
  if (!previewEl.hidden) follow(editor.scrollDOM, previewEl);
}
