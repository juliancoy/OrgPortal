import type { NetworkData } from './networkViewData'
export function loadPortalEvidence(base: NetworkData, fetcher?: (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>, prefix?: string): Promise<NetworkData>;
