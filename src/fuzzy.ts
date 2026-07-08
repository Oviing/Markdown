// Case-insensitive subsequence match. Higher scores are better matches;
// null means the query is not a subsequence of the label at all.
// Bonuses favor label-start, word-start, and consecutive-run hits, with a
// slight preference for shorter labels on ties.
export function fuzzyScore(query: string, label: string): number | null {
  if (!query) return 0;
  const q = query.toLowerCase();
  const l = label.toLowerCase();
  let qi = 0;
  let score = 0;
  let prev = -2;
  for (let i = 0; i < l.length && qi < q.length; i++) {
    if (l[i] !== q[qi]) continue;
    score += 1;
    if (i === prev + 1) score += 2;
    if (i === 0) score += 3;
    else if (!/[a-z0-9]/.test(l[i - 1])) score += 2;
    prev = i;
    qi++;
  }
  if (qi < q.length) return null;
  return score - l.length / 100;
}
