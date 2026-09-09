export class TimebankBucket {
  readonly objects = new Map<string, { bytes: Uint8Array; type: string }>();
  async put(key: string, bytes: Uint8Array, options: { httpMetadata: { contentType: string } }) {
    this.objects.set(key, { bytes: bytes.slice(), type: options.httpMetadata.contentType });
  }
  async delete(key: string) { this.objects.delete(key); }
  async get(key: string) {
    const object = this.objects.get(key);
    if (!object) return null;
    return { body: object.bytes, httpEtag: '"fixture-photo"', writeHttpMetadata(headers: Headers) { headers.set('Content-Type', object.type); } };
  }
  asR2() { return this as unknown as R2Bucket; }
}
