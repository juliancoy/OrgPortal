/** Operational report keys must never be resolved through media/download handlers. */
export function publicMediaObject(bucket: R2Bucket | undefined, key: string) {
  if (!bucket || key.startsWith('private/website-observatory/')) return Promise.resolve(null);
  return bucket.get(key);
}
