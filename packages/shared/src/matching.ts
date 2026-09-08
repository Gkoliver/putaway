const SIMILARITY_THRESHOLD = 0.85;
const AMBIGUITY_DELTA = 0.02;

export function normalizeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/^the\s+/, "")
    .replace(/\s+/g, " ");
}

function stripPlural(name: string): string {
  if (name.endsWith("shelves")) return `${name.slice(0, -7)}shelf`;
  if (name.endsWith("ies") && name.length > 4) return `${name.slice(0, -3)}y`;
  if (name.endsWith("ses") || name.endsWith("xes") || name.endsWith("zes") || name.endsWith("ches") || name.endsWith("shes")) {
    return name.slice(0, -2);
  }
  if (name.endsWith("s") && !name.endsWith("ss")) return name.slice(0, -1);
  return name;
}

function bigrams(s: string): string[] {
  const compact = s.replace(/\s+/g, "");
  const grams: string[] = [];
  for (let i = 0; i < compact.length - 1; i++) grams.push(compact.slice(i, i + 2));
  return grams;
}

function dice(a: string, b: string): number {
  const A = bigrams(a);
  const B = bigrams(b);
  if (A.length === 0 || B.length === 0) return a === b ? 1 : 0;
  let hits = 0;
  const used = new Array(B.length).fill(false);
  for (const g of A) {
    const j = B.findIndex((x, i) => x === g && !used[i]);
    if (j >= 0) {
      used[j] = true;
      hits++;
    }
  }
  return (2 * hits) / (A.length + B.length);
}

function bestDiceScore(query: string, name: string): number {
  const full = dice(query, name);
  const tokens = name.split(" ");
  if (tokens.length <= 1) return full;
  return Math.max(full, ...tokens.map((token) => dice(query, token)));
}

export function namesMatch(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (na === nb) return true;
  if (stripPlural(na) === stripPlural(nb)) return true;
  return dice(na, nb) >= SIMILARITY_THRESHOLD;
}

export function bestMatches<T>(
  query: string,
  items: T[],
  getName: (item: T) => string,
): T[] {
  const nq = normalizeName(query);
  const exact = items.filter((item) => normalizeName(getName(item)) === nq);
  if (exact.length === 1) return exact;
  if (exact.length > 1) return exact;

  const plural = items.filter((item) => stripPlural(normalizeName(getName(item))) === stripPlural(nq));
  if (plural.length === 1) return plural;
  if (plural.length > 1) return plural;

  const scored = items
    .map((item) => ({ item, score: bestDiceScore(nq, normalizeName(getName(item))) }))
    .filter((x) => x.score >= SIMILARITY_THRESHOLD)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return [];
  const top = scored[0].score;
  return scored.filter((x) => top - x.score <= AMBIGUITY_DELTA).map((x) => x.item);
}
