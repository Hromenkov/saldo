// Service worker Сальдо: застосунок відкривається без мережі, а свіжа версія сайту береться з мережі, щойно вона є.
// Розпізнавання (/api/*) і будь-які POST не кешуються.
// ignoreVary: сервер може відповідати з «Vary: Origin», а модульні скрипти йдуть з Origin — без цього кеш не збігається
const VERSION = 'saldo-v1';
const SHELL = 'shell-' + VERSION, ASSETS = 'assets-' + VERSION, FONTS = 'fonts-' + VERSION;
const KEEP = [SHELL, ASSETS, FONTS];

// при встановленні зберігаємо сторінку і всі файли збірки, на які вона посилається: без мережі застосунок відкриється з першого разу
async function precache() {
  const shell = await caches.open(SHELL);
  await shell.addAll(['/manifest.webmanifest', '/icons/icon-192.png']);
  const res = await fetch('/', { cache: 'no-cache' });
  if (!res.ok) return;
  const html = await res.clone().text();
  await shell.put('/', res);
  await warm(html);
}

/** Файли збірки (/assets/…), на які посилається сторінка, — у кеш, якщо їх там ще немає */
async function warm(html) {
  const c = await caches.open(ASSETS);
  const files = [...new Set(html.match(/\/assets\/[^"'\s)]+/g) || [])];
  await Promise.all(files.map(f => c.match(f, { ignoreVary: true }).then(hit => hit || c.add(f))));
}

self.addEventListener('install', e => { e.waitUntil(precache().then(() => self.skipWaiting())); });

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => !KEEP.includes(k)).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// шрифти Google приходять «непрозорими» (status 0): їх теж кладемо в кеш
const put = (name, req, res) => { if (res.ok || res.type === 'opaque') caches.open(name).then(c => c.put(req, res.clone())); return res; };

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // шрифти Google: кеш, потім мережа (іконки Material Symbols потрібні й без зв’язку)
  if (url.host === 'fonts.googleapis.com' || url.host === 'fonts.gstatic.com') {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => put(FONTS, req, res))));
    return;
  }
  if (url.origin !== location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/.netlify/')) return;

  // сторінка застосунку: спершу мережа (нова версія сайту), без мережі — збережена
  if (req.mode === 'navigate') {
    if (url.pathname.startsWith('/landing')) return;
    e.respondWith(fetch(req).then(res => {
      if (res.ok) {
        put(SHELL, '/', res);
        // нова збірка: підтягнути її файли, поки є мережа
        e.waitUntil(res.clone().text().then(warm).catch(() => undefined));
      }
      return res;
    }).catch(() => caches.match('/', { ignoreVary: true }).then(hit => hit || Response.error())));
    return;
  }

  // зібрані файли мають хеш у назві й не змінюються: кеш, потім мережа
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    e.respondWith(caches.match(req, { ignoreVary: true }).then(hit => hit || fetch(req).then(res => {
      put(ASSETS, req, res);
      // старі збірки не накопичуються: тримаємо останні 60 файлів
      caches.open(ASSETS).then(c => c.keys().then(ks => ks.slice(0, Math.max(0, ks.length - 60)).forEach(k => c.delete(k))));
      return res;
    })));
  }
});
