export type WalletChallenge = {
  challengeId: string; portalOrigin: string; userId: string; chainId: string;
  address: string; challengeExpiresAt: number; linkExpiresAt: number;
  expectedRevision: string; publish: true
}
export function walletProofMessage(c: WalletChallenge): string {
  return JSON.stringify(['QCash/profile-wallet-link/v1', c.portalOrigin, c.userId,
    c.chainId, c.address, c.challengeId, c.challengeExpiresAt, c.linkExpiresAt,
    c.expectedRevision, c.publish])
}
