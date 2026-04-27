let runtimeAccessToken: string | null = null

export function setRuntimeAccessToken(token: string | null): void {
  runtimeAccessToken = token
}

export function getRuntimeAccessToken(): string | null {
  return runtimeAccessToken
}
