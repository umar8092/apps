// Retired: the Meeting Time Planner is now the Time Zone Meeting Planner at ../time-zone-meeting-planner/. Clear old caches, unregister, and reload open tabs.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k.startsWith('meeting-time-planner-')) await caches.delete(k);
  await self.registration.unregister();
  for (const c of await self.clients.matchAll({ type: 'window' })) c.navigate(c.url);
})()));
