export function packedFiscalMetricReader(
  read: (key: string) => Promise<unknown>,
): (key: string) => Promise<unknown>
