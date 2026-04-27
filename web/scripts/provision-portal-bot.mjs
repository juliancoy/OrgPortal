#!/usr/bin/env node

const pidpBase = (process.env.PIDP_BASE_URL || 'https://dev.pidp.arkavo.org').replace(/\/+$/, '')
const email = (process.env.PORTAL_BOT_EMAIL || 'portal-bot@arkavo.org').trim().toLowerCase()
const password = (process.env.PORTAL_BOT_PASSWORD || '').trim()
const fullName = (process.env.PORTAL_BOT_NAME || 'Portal Bot').trim()

if (!password) {
  console.error('PORTAL_BOT_PASSWORD is required')
  process.exit(1)
}

async function registerBot() {
  const response = await fetch(`${pidpBase}/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      full_name: fullName,
    }),
  })

  if (response.status === 409) {
    return { created: false, reason: 'already-exists' }
  }
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`register failed (${response.status}): ${body}`)
  }
  return { created: true, reason: 'created' }
}

async function loginBot() {
  const body = new URLSearchParams()
  body.set('username', email)
  body.set('password', password)
  const response = await fetch(`${pidpBase}/auth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`login failed (${response.status}): ${text}`)
  }
  const payload = await response.json()
  const accessToken = String(payload?.access_token || '').trim()
  if (!accessToken) {
    throw new Error('login succeeded but access_token was empty')
  }
  return accessToken
}

async function resolveIdentity(accessToken) {
  const response = await fetch(`${pidpBase}/auth/me`, {
    headers: { authorization: `Bearer ${accessToken}` },
  })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`identity check failed (${response.status}): ${text}`)
  }
  return response.json()
}

async function main() {
  const registration = await registerBot()
  const accessToken = await loginBot()
  const identity = await resolveIdentity(accessToken)
  const tokenPreview = `${accessToken.slice(0, 14)}...${accessToken.slice(-8)}`

  console.log(
    JSON.stringify(
      {
        pidp_base_url: pidpBase,
        email,
        registration,
        identity: {
          id: identity?.id || null,
          email: identity?.email || null,
          full_name: identity?.full_name || null,
        },
        access_token_preview: tokenPreview,
      },
      null,
      2,
    ),
  )
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})

