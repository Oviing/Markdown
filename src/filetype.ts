const MD_EXT = /\.(md|markdown|txt)$/i;

const TEXT_EXTENSIONS = new Set([
  // docs
  "md", "markdown", "txt", "tex", "csv", "log",
  // web
  "js", "mjs", "cjs", "jsx", "ts", "tsx", "json", "jsonc", "html", "htm",
  "css", "scss", "less", "svg", "xml", "vue", "svelte", "astro",
  // code
  "py", "rb", "rs", "go", "java", "c", "h", "cpp", "hpp", "cc", "cs",
  "swift", "kt", "php", "lua", "pl", "r", "sql", "graphql", "gql",
  "sh", "bash", "zsh", "fish",
  // config
  "toml", "yml", "yaml", "ini", "cfg", "conf", "env", "properties", "lock",
]);

const TEXT_FILENAMES = new Set([
  "makefile", "dockerfile", "license", "readme", "gemfile", "rakefile",
  "procfile", "justfile", "cmakelists.txt",
]);

export function isTextFile(name: string): boolean {
  const lower = name.toLowerCase();
  if (TEXT_FILENAMES.has(lower)) return true;
  const dot = lower.lastIndexOf(".");
  return dot > 0 && TEXT_EXTENSIONS.has(lower.slice(dot + 1));
}

// null = untitled document → treated as markdown; .txt stays markdown to keep current UX
export function isMarkdownFile(name: string | null): boolean {
  return name === null || MD_EXT.test(name);
}
