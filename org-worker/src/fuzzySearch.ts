function normalizeSearchText(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function fuzzyDistanceLimit(token: string) {
  if (token.length <= 2) return 0;
  if (token.length <= 4) return 1;
  return 2;
}

function boundedDamerauLevenshtein(a: string, b: string, maxDistance: number) {
  if (Math.abs(a.length - b.length) > maxDistance) return maxDistance + 1;
  if (a === b) return 0;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  let previousPrevious: number[] | undefined;
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    let rowMin = current[0];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + cost,
      );
      if (previousPrevious && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, previousPrevious[j - 2] + 1);
      }
      current[j] = value;
      rowMin = Math.min(rowMin, value);
    }
    if (rowMin > maxDistance) return maxDistance + 1;
    previousPrevious = previous;
    previous = current;
  }
  return previous[b.length];
}

function scoreSearchToken(queryToken: string, fieldToken: string) {
  if (!queryToken || !fieldToken) return 0;
  if (fieldToken === queryToken) return 70;
  if (fieldToken.startsWith(queryToken)) return 58;
  if (fieldToken.includes(queryToken)) return 45;
  const maxDistance = fuzzyDistanceLimit(queryToken);
  if (!maxDistance) return 0;
  const distance = boundedDamerauLevenshtein(queryToken, fieldToken, maxDistance);
  if (distance <= maxDistance) return 35 - distance * 8 + Math.min(queryToken.length, 8);
  // Match misspelled prefixes while the visitor is still typing a word.
  if (fieldToken.length > queryToken.length) {
    let prefixScore = 0;
    for (const length of [queryToken.length - 1, queryToken.length, queryToken.length + 1]) {
      if (length >= fieldToken.length) continue;
      const distance = boundedDamerauLevenshtein(queryToken, fieldToken.slice(0, length), maxDistance);
      if (distance <= maxDistance) prefixScore = Math.max(prefixScore, 28 - distance * 6 + (length === queryToken.length ? 4 : 0));
    }
    if (prefixScore) return prefixScore;
  }
  return 0;
}

// Compile once per search. Token scores are query-local, so repeated words in
// descriptions share typo comparisons without retaining data between requests.
export function createSearchScorer(query: string) {
  const normalizedQuery = normalizeSearchText(query);
  const queryTokens = normalizedQuery ? normalizedQuery.split(" ") : [];
  const tokenScores = queryTokens.map(() => new Map<string, number>());
  function tokenScore(index: number, fieldToken: string) {
    const cache = tokenScores[index];
    const cached = cache.get(fieldToken);
    if (cached !== undefined) return cached;
    const score = scoreSearchToken(queryTokens[index], fieldToken);
    // Bound memory even for unusually large directories or long descriptions.
    if (cache.size < 8192) cache.set(fieldToken, score);
    return score;
  }
  return (fields: Array<unknown>) => {
    if (!normalizedQuery) return 0;
    const normalizedFields = fields.map(normalizeSearchText);
    const fieldTokens = new Set(normalizedFields.filter(Boolean).flatMap(field => field.split(" ")));
    let score = 0;
    for (const field of normalizedFields) {
      if (field === normalizedQuery) score = Math.max(score, 140);
      else if (field.startsWith(normalizedQuery)) score = Math.max(score, 115);
      else if (field.includes(normalizedQuery)) score = Math.max(score, 95);
    }
    for (let index = 0; index < queryTokens.length; index += 1) {
      let best = 0;
      for (const fieldToken of fieldTokens) {
        best = Math.max(best, tokenScore(index, fieldToken));
        if (best === 70) break; // Exact token match is the maximum possible.
      }
      if (!best) return 0;
      score += best;
    }
    // Preserve distinct primary-name tokens for repeated query terms.
    const primaryTokens = (normalizedFields[0] || '').split(" ");
    const primaryMatches = queryTokens.every((_, index) => {
      let best = 0, bestIndex = -1;
      for (let position = 0; position < primaryTokens.length; position += 1) {
        const value = tokenScore(index, primaryTokens[position]);
        if (value > best) { best = value; bestIndex = position; }
        if (best === 70) break;
      }
      if (!best) return false;
      primaryTokens.splice(bestIndex, 1);
      return true;
    });
    return score + (primaryMatches ? 60 : 0);
  };
}

export function scoreSearchCandidate(query: string, fields: Array<unknown>) {
  return createSearchScorer(query)(fields);
}

export function rankSearchResults<T>(rows: T[], query: string, fieldsForRow: (row: T) => Array<unknown>, limit: number, tieBreaker?: (a: T, b: T) => number) {
  const q = query.trim();
  if (!q) return rows.slice(0, limit);
  const score = createSearchScorer(q);
  return rows
    .map((row, index) => ({ row, index, score: score(fieldsForRow(row)) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || tieBreaker?.(a.row,b.row) || a.index - b.index)
    .slice(0, limit)
    .map((item) => item.row);
}
