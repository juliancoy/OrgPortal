function normalizeSearchText(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function searchTokens(value: unknown) {
  const normalized = normalizeSearchText(value);
  return normalized ? normalized.split(" ") : [];
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

export function scoreSearchCandidate(query: string, fields: Array<unknown>) {
  const normalizedQuery = normalizeSearchText(query);
  const queryTokens = searchTokens(normalizedQuery);
  if (!normalizedQuery || !queryTokens.length) return 0;

  const normalizedFields = fields.map(normalizeSearchText).filter(Boolean);
  const fieldTokens = normalizedFields.flatMap((field) => field.split(" "));
  let score = 0;

  for (const field of normalizedFields) {
    if (field === normalizedQuery) score = Math.max(score, 140);
    else if (field.startsWith(normalizedQuery)) score = Math.max(score, 115);
    else if (field.includes(normalizedQuery)) score = Math.max(score, 95);
  }

  for (const token of queryTokens) {
    const best = fieldTokens.reduce((bestScore, fieldToken) => Math.max(bestScore, scoreSearchToken(token, fieldToken)), 0);
    if (!best) return 0;
    score += best;
  }

  // A name or title matching every query term is more useful than incidental
  // matches scattered through a long description.
  const primaryTokens = normalizeSearchText(fields[0]).split(" ");
  const primaryMatches = queryTokens.every(token => {
    const matches = primaryTokens.map((fieldToken,index) => ({index,score:scoreSearchToken(token,fieldToken)}));
    matches.sort((a,b) => b.score-a.score);
    if (!matches[0]?.score) return false;
    primaryTokens.splice(matches[0].index,1);
    return true;
  });
  if (primaryMatches) score += 60;
  return score;
}

export function rankSearchResults<T>(rows: T[], query: string, fieldsForRow: (row: T) => Array<unknown>, limit: number, tieBreaker?: (a: T, b: T) => number) {
  const q = query.trim();
  if (!q) return rows.slice(0, limit);
  return rows
    .map((row, index) => ({ row, index, score: scoreSearchCandidate(q, fieldsForRow(row)) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || tieBreaker?.(a.row,b.row) || a.index - b.index)
    .slice(0, limit)
    .map((item) => item.row);
}

