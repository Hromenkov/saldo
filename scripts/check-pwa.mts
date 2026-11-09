// Застосунок на телефоні (PWA): маніфест, іконки, service worker, ярлик камери. Запуск: npm test
import { existsSync, readFileSync } from 'node:fs';

let fails = 0;
const ok = (cond: boolean, msg: string) => { if (!cond) { fails++; console.log('✗ ' + msg); } else console.log('✓ ' + msg); };
const pub = (p: string) => new URL('../public' + p, import.meta.url);

const m = JSON.parse(readFileSync(pub('/manifest.webmanifest'), 'utf8'));
ok(m.display === 'standalone' && !!m.start_url && m.scope === '/', 'Маніфест: окреме вікно без адресного рядка, start_url і scope задано');
ok(m.name && m.short_name && m.short_name.length <= 12, `Назва під іконкою коротка: «${m.short_name}»`);

/** Розмір PNG із заголовка IHDR */
const png = (p: string) => { const b = readFileSync(pub(p)); return b.toString('ascii', 1, 4) === 'PNG' ? `${b.readUInt32BE(16)}x${b.readUInt32BE(20)}` : 'не PNG'; };
for (const ic of m.icons) ok(existsSync(pub(ic.src)) && png(ic.src) === ic.sizes, `Іконка ${ic.src}: ${ic.sizes} (${existsSync(pub(ic.src)) ? png(ic.src) : 'немає файлу'})`);
ok(m.icons.some((i: { purpose?: string; sizes: string }) => i.purpose === 'maskable' && i.sizes === '512x512'), 'Є maskable-іконка 512 для Android');
ok(m.icons.some((i: { sizes: string }) => i.sizes === '192x192') && m.icons.some((i: { sizes: string }) => i.sizes === '512x512'), 'Є іконки 192 і 512: без них Chrome не пропонує встановлення');

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
ok(html.includes('rel="manifest" href="/manifest.webmanifest"'), 'index.html посилається на маніфест');
const apple = html.match(/rel="apple-touch-icon" href="([^"]+)"/)?.[1];
ok(!!apple && existsSync(pub(apple)) && png(apple) === '180x180', 'Іконка для iPhone 180×180');
ok(html.includes('viewport-fit=cover'), 'viewport-fit=cover: безпечні зони iPhone враховано');

const cam = m.shortcuts?.find((s: { url: string }) => /camera/.test(s.url));
ok(!!cam && cam.url === '/app/camera', 'Ярлик «Сфотографувати накладну» веде на /app/camera');
const store = readFileSync(new URL('../src/store.tsx', import.meta.url), 'utf8');
const re = store.match(/const cameraLink = \(\) => \{ try \{ return (\/.+\/)\.test/)?.[1];
ok(!!re && new RegExp(re.slice(1, -1)).test(cam?.url ?? ''), 'Адреса ярлика відкриває камеру в застосунку');
const toml = readFileSync(new URL('../netlify.toml', import.meta.url), 'utf8');
ok(/from = "\/app\/\*"\s+to = "\/index.html"/.test(toml), 'Netlify віддає застосунок за /app/camera');
ok(/for = "\/sw.js"[\s\S]*?no-cache/.test(toml), 'sw.js не кешується браузером: оновлення сайту доходять до телефонів');

const sw = readFileSync(pub('/sw.js'), 'utf8');
ok(/req\.method !== 'GET'\) return/.test(sw), 'Service worker не чіпає POST (розпізнавання)');
ok(/startsWith\('\/api\/'\)\) return|startsWith\('\/api\/'\)[^\n]*return;/.test(sw), 'Service worker не кешує /api/*');
ok(/mode === 'navigate'/.test(sw) && /catch\(\(\) => caches\.match\('\/'/.test(sw), 'Без мережі відкривається збережена сторінка застосунку');

if (fails) { console.log(`\n${fails} перевірок не пройдено`); process.exit(1); }
console.log('\nУсі перевірки PWA пройдено');
