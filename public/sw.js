// Service worker: shows booking messages the backend sends by Web Push and opens the right screen on tap.
// The backend's payload is {"type","title","body","url"}.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: 'Apni Dukan', body: event.data ? event.data.text() : '' }
  }
  const title = data.title || 'Apni Dukan'
  // Tell open app windows, so the bell and the booking screens refresh at once.
  const tellApp = self.clients
    .matchAll({ type: 'window', includeUncontrolled: true })
    .then((windows) => windows.forEach((w) => w.postMessage({ kind: 'push', type: data.type || null })))
  event.waitUntil(
    Promise.all([tellApp, self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/icon.svg',
      badge: '/icon.svg',
      tag: data.type || undefined,
      data: { url: data.url || '/bookings' },
    })]),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL(event.notification.data?.url || '/bookings', self.location.origin)
  // Only open pages of this app, never another site.
  const url = target.origin === self.location.origin ? target.href : self.location.origin + '/bookings'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const w of windows) {
        if ('focus' in w) {
          // navigate() refuses a window this worker doesn't control yet: then open a fresh one
          return w
            .focus()
            .then((f) => f.navigate(url))
            .catch(() => self.clients.openWindow(url))
        }
      }
      return self.clients.openWindow(url)
    }),
  )
})
