'use strict';
const CACHE = 'crm-shell-v6';
const SHELL = ['/', '/app.js', '/styles.css', '/favicon.svg', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/icon-maskable-512.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('crm-shell-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/r/')) return;
  if (!SHELL.includes(url.pathname)) return;
  // Always prefer the current deployed shell. Fall back to cache only when offline.
  // Cache-first scripts kept stale CRM code active after deployments.
  event.respondWith(fetch(new Request(request, { cache: 'no-store' })).then(response => {
    if (response.ok) caches.open(CACHE).then(cache => cache.put(request, response.clone()));
    return response;
  }).catch(() => caches.match(request)));
});
