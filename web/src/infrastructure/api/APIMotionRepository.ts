import type { CreateMotionInput, MotionListQuery, MotionRepository } from '../../application/ports/MotionRepository'
import type { Motion } from '../../domain/motion/Motion'
import { getRuntimeAccessToken } from '../auth/runtimeAuth'

const API_BASE = '/api/org/api/governance'

function getAuthHeaders(): HeadersInit {
  const token = getRuntimeAccessToken()
  if (!token) {
    throw new Error('Authentication required')
  }
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
}

type MotionApiRow = {
  id: string
  type: string
  parent_motion_id?: string | null
  title: string
  body: string
  proposed_body_diff?: string | null
  status: string
  proposer_type?: string | null
  proposer_id: string
  proposer_name: string
  proposer_user_name?: string | null
  proposer_org_id?: string | null
  proposer_org_name?: string | null
  seconder_id?: string | null
  seconder_name?: string | null
  discussion_deadline?: string | null
  voting_deadline?: string | null
  quorum_required: number
  created_at: string
  updated_at: string
}

function mapMotion(row: MotionApiRow): Motion {
  return {
    id: String(row.id),
    type: (row.type as Motion['type']) || 'main',
    parentMotionId: row.parent_motion_id || undefined,
    title: row.title,
    body: row.body,
    proposedBodyDiff: row.proposed_body_diff || undefined,
    status: (row.status as Motion['status']) || 'proposed',
    proposerType: (row.proposer_type as Motion['proposerType']) || 'user',
    proposerId: row.proposer_id,
    proposerName: row.proposer_name,
    proposerUserName: row.proposer_user_name || undefined,
    proposerOrgId: row.proposer_org_id || undefined,
    proposerOrgName: row.proposer_org_name || undefined,
    seconderId: row.seconder_id || undefined,
    seconderName: row.seconder_name || undefined,
    discussionDeadlineISO: row.discussion_deadline || undefined,
    votingDeadlineISO: row.voting_deadline || undefined,
    quorumRequired: Number(row.quorum_required || 0),
    votes: [],
    createdAtISO: row.created_at,
    updatedAtISO: row.updated_at,
    score: 0,
  }
}

async function parseResponse<T>(resp: Response): Promise<T> {
  if (!resp.ok) {
    const body = await resp.text().catch(() => '')
    throw new Error(body || `Request failed (${resp.status})`)
  }
  return (await resp.json()) as T
}

export class APIMotionRepository implements MotionRepository {
  private readonly baseUrl: string

  constructor(baseUrl: string = API_BASE) {
    this.baseUrl = baseUrl.replace(/\/$/, '')
  }

  async list(query?: MotionListQuery): Promise<Motion[]> {
    const params = new URLSearchParams()
    if (query?.search?.trim()) params.set('search', query.search.trim())
    if (query?.status?.length) {
      for (const status of query.status) params.append('status', status)
    }
    if (query?.type) params.set('type', query.type)
    if (query?.parentMotionId) params.set('parent_motion_id', query.parentMotionId)
    const suffix = params.toString() ? `?${params.toString()}` : ''
    const resp = await fetch(`${this.baseUrl}/motions${suffix}`)
    const rows = await parseResponse<MotionApiRow[]>(resp)
    return (Array.isArray(rows) ? rows : []).map(mapMotion)
  }

  async getById(id: string): Promise<Motion | null> {
    const resp = await fetch(`${this.baseUrl}/motions/${encodeURIComponent(id)}`)
    if (resp.status === 404) return null
    const row = await parseResponse<MotionApiRow>(resp)
    return mapMotion(row)
  }

  async create(input: CreateMotionInput): Promise<Motion> {
    const payload: Record<string, unknown> = {
      type: input.type,
      parent_motion_id: input.parentMotionId || null,
      title: input.title,
      body: input.body,
      proposed_body_diff: input.proposedBodyDiff || null,
      proposer_type: input.proposerType || 'user',
      proposer_org_id: input.proposerOrgId || null,
      quorum_required: input.quorumRequired,
    }
    const resp = await fetch(`${this.baseUrl}/motions`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    })
    const row = await parseResponse<MotionApiRow>(resp)
    return mapMotion(row)
  }

  async second(motionId: string, _userId: string, _userName: string): Promise<Motion> {
    const resp = await fetch(`${this.baseUrl}/motions/${encodeURIComponent(motionId)}/second`, {
      method: 'POST',
      headers: getAuthHeaders(),
    })
    const row = await parseResponse<MotionApiRow>(resp)
    return mapMotion(row)
  }

  async openVoting(motionId: string): Promise<Motion> {
    const resp = await fetch(`${this.baseUrl}/motions/${encodeURIComponent(motionId)}/open-voting`, {
      method: 'POST',
      headers: getAuthHeaders(),
    })
    const row = await parseResponse<MotionApiRow>(resp)
    return mapMotion(row)
  }

  async table(motionId: string): Promise<Motion> {
    const resp = await fetch(`${this.baseUrl}/motions/${encodeURIComponent(motionId)}/table`, {
      method: 'POST',
      headers: getAuthHeaders(),
    })
    const row = await parseResponse<MotionApiRow>(resp)
    return mapMotion(row)
  }

  async withdraw(motionId: string, _userId: string): Promise<Motion> {
    const resp = await fetch(`${this.baseUrl}/motions/${encodeURIComponent(motionId)}/withdraw`, {
      method: 'POST',
      headers: getAuthHeaders(),
    })
    const row = await parseResponse<MotionApiRow>(resp)
    return mapMotion(row)
  }

  async resolveVoting(motionId: string): Promise<Motion> {
    const resp = await fetch(`${this.baseUrl}/motions/${encodeURIComponent(motionId)}/resolve`, {
      method: 'POST',
      headers: getAuthHeaders(),
    })
    const row = await parseResponse<MotionApiRow>(resp)
    return mapMotion(row)
  }
}
