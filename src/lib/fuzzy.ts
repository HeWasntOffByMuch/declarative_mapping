// Lightweight fuzzy match: case-insensitive subsequence test. Returns true when
// every character of the query appears in `text` in order (not necessarily
// contiguous), e.g. "wl" matches "wall", "drt" matches "dry_dirt". Empty query
// matches everything.
export function fuzzyMatch(query: string, text: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const t = text.toLowerCase();
  let i = 0;
  for (let j = 0; j < t.length && i < q.length; j++) {
    if (t[j] === q[i]) i++;
  }
  return i === q.length;
}
