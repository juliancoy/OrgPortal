import type { VoteRepository } from '../../application/ports/VoteRepository'
import type { Vote, VoteChoice, VoteResult } from '../../domain/motion/Motion'

const API_BASE = '/api/org/api/governance'

function getAuthHeaders(): HeadersInit {
  const token = sessionStorage.getItem('pidp.token')
  if (!token) throw new Error('Authentication required')
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
}

async function parseResponse<T>(resp: Response): Promise<T> {
  if (!resp.ok) {
    const body = await resp.text().catch(() => '')
    throw new Error(body || `Request failed (${resp.status})`)
  }
  return (await resp.json()) as T
}

type VoteResultApiResponse = {
  yea: number
  nay: number
  abstain: number
  total_eligible: number
  quorum_met: boolean
  passed: boolean
}

export class APIVoteRepository implements VoteRepository {
  private readonly baseUrl: string

  constructor(baseUrl: string = API_BASE) {
    this.baseUrl = baseUrl.replace(/\/$/, '')
  }

  async castVote(motionId: string, voterId: string, voterName: string, choice: VoteChoice): Promise<Vote> {
    await parseResponse(
      await fetch(`${this.baseUrl}/motions/${encodeURIComponent(motionId)}/votes`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ choice }),
      }),
    )
    return {
      id: `vote_${Math.random().toString(16).slice(2)}`,
      motionId,
      voterId,
      voterName,
      choice,
      castAtISO: new Date().toISOString(),
    }
  }

  async getResults(motionId: string): Promise<VoteResult> {
    const row = await parseResponse<VoteResultApiResponse>(
      await fetch(`${this.baseUrl}/motions/${encodeURIComponent(motionId)}/results`),
    )
    return {
      yea: Number(row.yea || 0),
      nay: Number(row.nay || 0),
      abstain: Number(row.abstain || 0),
      totalEligible: Number(row.total_eligible || 0),
      quorumMet: Boolean(row.quorum_met),
      passed: Boolean(row.passed),
    }
  }
}
