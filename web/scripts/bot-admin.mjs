#!/usr/bin/env node

function parseArgs(argv) {
  const args = { _: [] }
  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i]
    if (!current.startsWith('--')) {
      args._.push(current)
      continue
    }
    const key = current.slice(2)
    const next = argv[i + 1]
    if (!next || next.startsWith('--')) {
      args[key] = true
      continue
    }
    args[key] = next
    i += 1
  }
  return args
}

async function requestJson(url, init = {}) {
  const response = await fetch(url, init)
  const text = await response.text().catch(() => '')
  let payload = null
  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    payload = text
  }
  if (!response.ok) {
    const detail =
      (payload && typeof payload === 'object' && payload.detail) ||
      (typeof payload === 'string' ? payload : '') ||
      `Request failed (${response.status})`
    throw new Error(String(detail))
  }
  return payload
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const command = String(args._[0] || 'list').trim().toLowerCase()
  const baseUrl = (String(args.base || process.env.ORGPORTAL_BASE_URL || 'https://dev.portal.arkavo.org')).replace(/\/+$/, '')
  const apiKey = String(args.key || process.env.ORG_SYSADMIN_API_KEY || process.env.ORG_PAT || process.env.PIDP_PAT || '').trim()
  if (!apiKey) {
    throw new Error('Missing SysAdmin API key. Set ORG_SYSADMIN_API_KEY (or pass --key).')
  }

  if (command === 'list') {
    const query = String(args.q || '').trim()
    const limit = Number(args.limit || '200')
    const activeOnly = String(args.activeOnly || 'true').trim().toLowerCase() !== 'false'
    const params = new URLSearchParams()
    if (query) params.set('q', query)
    params.set('limit', String(Number.isFinite(limit) ? limit : 200))
    params.set('active_only', activeOnly ? 'true' : 'false')
    const data = await requestJson(`${baseUrl}/api/org/api/network/bots?${params.toString()}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    console.log(JSON.stringify(data, null, 2))
    return
  }

  if (command === 'provision') {
    const email = String(args.email || '').trim().toLowerCase()
    const password = String(args.password || process.env.PORTAL_BOT_PASSWORD || '').trim()
    const fullName = String(args.name || process.env.PORTAL_BOT_NAME || 'Portal Bot').trim()
    const description = String(args.description || '').trim() || null
    const issueApiToken = String(args.issueToken || 'true').trim().toLowerCase() !== 'false'
    const apiTokenName = String(args.tokenName || process.env.PORTAL_BOT_TOKEN_NAME || 'orgportal-bot').trim()
    const apiTokenScope = String(args.tokenScope || process.env.PORTAL_BOT_TOKEN_SCOPE || 'org_admin').trim()
    const tags = String(args.tags || '')
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
    if (!email) throw new Error('Missing --email for provision')
    if (!password) throw new Error('Missing --password (or PORTAL_BOT_PASSWORD) for provision')

    const payload = await requestJson(`${baseUrl}/api/org/api/network/bots/provision`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password,
        full_name: fullName,
        description,
        tags,
        issue_api_token: issueApiToken,
        api_token_name: apiTokenName,
        api_token_scope: apiTokenScope,
      }),
    })
    console.log(JSON.stringify(payload, null, 2))
    return
  }

  if (command === 'issue-token') {
    const botId = String(args.botId || '').trim()
    const password = String(args.password || process.env.PORTAL_BOT_PASSWORD || '').trim()
    const apiTokenName = String(args.tokenName || process.env.PORTAL_BOT_TOKEN_NAME || 'orgportal-bot').trim()
    const apiTokenScope = String(args.tokenScope || process.env.PORTAL_BOT_TOKEN_SCOPE || 'org_admin').trim()
    if (!botId) throw new Error('Missing --botId for issue-token')
    if (!password) throw new Error('Missing --password (or PORTAL_BOT_PASSWORD) for issue-token')

    const payload = await requestJson(`${baseUrl}/api/org/api/network/bots/${encodeURIComponent(botId)}/issue-token`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        password,
        api_token_name: apiTokenName,
        api_token_scope: apiTokenScope,
      }),
    })
    console.log(JSON.stringify(payload, null, 2))
    return
  }

  throw new Error(`Unknown command: ${command}. Use 'list', 'provision', or 'issue-token'.`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
