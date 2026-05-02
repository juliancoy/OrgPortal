import type { VoteRepository } from '../../application/ports/VoteRepository'
import type { Vote, VoteChoice, VoteResult } from '../../domain/motion/Motion'
import { getRuntimeAccessToken } from '../auth/runtimeAuth'

const API_BASE = '/api/org/api/governance'

function getAuthHeaders(): HeadersInit {
  const token = getRuntimeAccessToken()
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

async function parseResponseOrNull<T>(resp: Response): Promise<T | null> {
  if (!resp.ok) return null
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
    let response = await fetch(`${this.baseUrl}/motions/${encodeURIComponent(motionId)}/votes`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ choice }),
    })
    if (response.status === 404 || response.status === 405) {
      response = await fetch(`${this.baseUrl}/motions/${encodeURIComponent(motionId)}/vote`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ choice }),
      })
    }
    await parseResponse(response)
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
    let response = await fetch(`${this.baseUrl}/motions/${encodeURIComponent(motionId)}/results`)
    if (response.status === 404 || response.status === 405) {
      response = await fetch(`${this.baseUrl}/motions/${encodeURIComponent(motionId)}`)
      const motion = await parseResponseOrNull<{ result?: { yea?: number; nay?: number; abstain?: number; total_votes?: number } }>(response)
      const fallback = motion?.result || {}
      const yea = Number(fallback.yea || 0)
      const nay = Number(fallback.nay || 0)
      const abstain = Number(fallback.abstain || 0)
      const totalVotes = Number(fallback.total_votes || yea + nay + abstain)
      return {
        yea,
        nay,
        abstain,
        totalEligible: totalVotes,
        quorumMet: totalVotes > 0,
        passed: yea > nay,
      }
    }
    const row = await parseResponse<VoteResultApiResponse>(response)
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
