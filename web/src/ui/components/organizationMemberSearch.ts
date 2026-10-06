export function uniqueAccounts<T extends { user_id: string }>(rows: T[]): T[] {
  return [...new Map(rows.map(row => [row.user_id, row])).values()]
}
