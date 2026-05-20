const SHARE_CACHE = 'share-target-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  const isShareTarget = event.request.method === 'POST' &&
    (url.searchParams.has('share-target') || url.pathname.endsWith('/'));

  if (isShareTarget && event.request.headers.get('content-type')?.includes('multipart/form-data')) {
    event.respondWith(handleShare(event.request));
    return;
  }
});

async function handleShare(request) {
  const formData = await request.formData();
  const file = formData.get('image');
  if (file && file.size > 0) {
    const cache = await caches.open(SHARE_CACHE);
    await cache.put('pending', new Response(file, {
      headers: { 'Content-Type': file.type || 'image/jpeg' }
    }));
  }
  return Response.redirect('./?shared', 303);
}
