self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = { body: event.data ? event.data.text() : 'You have a new notification.' }
  }
  const title = payload.title || 'Code Collective'
  const target = new URL(String(payload.url || '').replace(/^\//, ''), self.registration.scope).toString()
  event.waitUntil(self.registration.showNotification(title, {
    body: payload.body || 'You have a new notification.',
    icon: new URL('codecollective_logo.png', self.registration.scope).toString(),
    badge: new URL('codecollective_logo.png', self.registration.scope).toString(),
    data: { url: target },
    tag: payload.eventId || undefined,
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = event.notification.data?.url || self.registration.scope
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of windows) {
      if ('navigate' in client) await client.navigate(target)
      if ('focus' in client) return client.focus()
    }
    return self.clients.openWindow(target)
  })())
})
