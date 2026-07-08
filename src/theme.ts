export const THEMES = ["auto", "light", "dark", "grey", "ocean"] as const;
export type Theme = (typeof THEMES)[number];

const STORAGE_KEY = "theme";

function storedTheme(): Theme {
  const t = localStorage.getItem(STORAGE_KEY);
  return (THEMES as readonly string[]).includes(t ?? "") ? (t as Theme) : "auto";
}

function apply(theme: Theme): void {
  if (theme === "auto") {
    delete document.documentElement.dataset.theme;
    localStorage.removeItem(STORAGE_KEY);
  } else {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(STORAGE_KEY, theme);
  }
}

export function initTheme(): Theme {
  const theme = storedTheme();
  apply(theme);
  return theme;
}

export function cycleTheme(): Theme {
  const next = THEMES[(THEMES.indexOf(storedTheme()) + 1) % THEMES.length];
  apply(next);
  return next;
}

export function currentTheme(): Theme {
  return storedTheme();
}

export function setTheme(theme: Theme): Theme {
  apply(theme);
  return theme;
}
