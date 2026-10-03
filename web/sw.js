// Service worker: makes the game work offline once installed.
// Network first (always fresh when online), cache as fallback.

const CACHE = 'mario-luigi-v2';

const FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'icons/favicon-32.png',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'src/main.js',
  'src/ui.js',
  'src/extras.js',
  'src/easter.js',
  'src/mario.js',
  'src/play.js',
  'src/players.js',
  'src/enemies.js',
  'src/figures.js',
  'src/backgr.js',
  'src/blocks.js',
  'src/tmpobj.js',
  'src/glitter.js',
  'src/stars.js',
  'src/status.js',
  'src/txt.js',
  'src/music.js',
  'src/sound.js',
  'src/palettes.js',
  'src/buffers.js',
  'src/keyboard.js',
  'src/joystick.js',
  'src/pascal.js',
  'src/vga256.js',
  'src/data.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true })
        .then((r) => r || caches.match('index.html'))),
  );
});
