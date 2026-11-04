export function createArtifactBuffer(
  readText: (key: string) => string | Promise<string>,
  options?: { maxBytes?: number; maxEntries?: number },
): (key: string) => Promise<unknown>
