'use strict';

// Bump SHELL_VERSION for every HTML, JS, image, icon or manifest release.
// Bump AUDIO_VERSION when audio files change; UI-only releases retain downloaded music.
const SHELL_VERSION = '2026-10-24-2';
const AUDIO_VERSION = '1';
const BASE = new URL('./', self.location.href);
const PREFIX = 'qiushi-pwa:' + BASE.pathname + ':';
const SHELL_CACHE = PREFIX + 'shell-' + SHELL_VERSION;
const AUDIO_CACHE = PREFIX + 'audio-' + AUDIO_VERSION;
const urlFor = path => new URL(path, BASE).href;
const SHELL_FILES = [
  './', './index.html', './manifest.webmanifest', './pwa.js', './dev-tools.js',
  './assets/icons/icon.svg', './assets/icons/apple-touch-icon.png',
  './assets/icons/icon-192.png', './assets/icons/icon-512.png', './assets/icons/icon-maskable-512.png',
  // IMG-25 has no file: the engine maps that legacy ID to IMG-07.
  ...Array.from({ length: 45 }, (_, i) => i + 1)
    .filter(id => id !== 23 && id !== 25)
    .map(id => './assets/images/IMG-' + String(id).padStart(2, '0') + '.webp')
];
const AUDIO_FILES = [
  '背景音乐/atlasaudio-historical-519440.mp3',
  '背景音乐/mondamusic-historical-history-historical-597253.mp3',
  '背景音乐/alexgrohl-history-piano-535025.mp3',
  '背景音乐/nastelbom-epic-cinematic-473268.mp3',
  '背景音乐/solvikmusic-epic-inspiring-611151.mp3',
  '背景音乐/jonasblakewood-epic-epic-music-562863.mp3',
  '校歌/a2ebdf90-3d5c-4d6a-8aa5-e3d26c650bb8.mp3',
  '按钮/dragon-studio-button-press-382713.mp3',
  '翻书声/creatorshome-turn-a-page-336933.mp3',
  '相机转场/dragon-studio-camera-shutter-effect-390310.mp3',
  '炮声/universfield-cannon-shot-352459.mp3',
  '防空警报/lazychillzone-air-raid-siren-225303.mp3',
  '雨声/boons_freak-rain-sound-188158.mp3',
  '胜利庆祝/alex_jauk-firecrackers-178799.mp3',
  'pc_keyboard.mp3'
].map(path => './qiushi_bgm/' + path);
const shellURLs = new Set(SHELL_FILES.map(urlFor));
const audioURLs = new Set(AUDIO_FILES.map(urlFor));

self.addEventListener('install', event => {
  // addAll is atomic. A missing asset must not replace a working offline release.
  // Do not skipWaiting: an update must not replace assets during an active game.
  event.waitUntil(caches.open(SHELL_CACHE).then(cache => cache.addAll(
    SHELL_FILES.map(path => new Request(urlFor(path), { cache: 'reload' }))
  )));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(PREFIX)
      && name !== SHELL_CACHE && name !== AUDIO_CACHE).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

async function audioRange(response, range) {
  // Media elements request byte ranges, including when completely offline.
  const blob = await response.blob();
  const size = blob.size, match = /^bytes=(\d*)-(\d*)$/.exec(range);
  let start, end;
  if (match && (match[1] || match[2])) {
    start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
    end = match[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= size) {
    return new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */' + size } });
  }
  const headers = new Headers(response.headers);
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
  headers.set('Content-Length', String(end - start + 1));
  return new Response(blob.slice(start, end + 1), { status: 206, headers });
}

self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== BASE.origin || !url.pathname.startsWith(BASE.pathname)) return;
  url.search = ''; url.hash = '';
  const key = url.href;
  const navigation = request.mode === 'navigate' && (key === BASE.href || key === urlFor('./index.html'));
  if (navigation) {
    event.respondWith((async () => {
      // Debug sessions can read ongoing source edits; offline debug uses the installed shell.
      if (new URL(request.url).searchParams.get('debug') === '1') {
        try { const response = await fetch(request); if (response.ok) return response; } catch (_) {}
      }
      return await (await caches.open(SHELL_CACHE)).match(urlFor('./index.html')) || fetch(request);
    })());
  } else if (shellURLs.has(key) || audioURLs.has(key)) {
    event.respondWith((async () => {
      const cache = await caches.open(audioURLs.has(key) ? AUDIO_CACHE : SHELL_CACHE);
      const cached = await cache.match(key);
      if (!cached) return fetch(request);
      return audioURLs.has(key) && request.headers.has('Range')
        ? audioRange(cached, request.headers.get('Range')) : cached;
    })());
  }
});

const downloadPorts = new Set();
let audioDownload;
async function prepareAudio() {
  const cache = await caches.open(AUDIO_CACHE);
  let done = 0;
  const report = () => downloadPorts.forEach(port => port.postMessage({ type: 'PROGRESS', done, total: AUDIO_FILES.length }));
  report();
  for (const path of AUDIO_FILES) {
    const url = urlFor(path);
    if (!(await cache.match(url))) {
      // Fetch full files, never cache a partial 206 response from a media element.
      const response = await fetch(new Request(url, { cache: 'reload' }));
      if (response.status !== 200) throw new Error('配乐下载失败');
      await cache.put(url, response);
    }
    done++; report();
  }
}

self.addEventListener('message', event => {
  const port = event.ports[0];
  if (!port) return;
  event.waitUntil((async () => {
    try {
      if (event.data?.type === 'STATUS') {
        const cache = await caches.open(AUDIO_CACHE);
        const found = await Promise.all(AUDIO_FILES.map(path => cache.match(urlFor(path))));
        port.postMessage({ type: 'STATUS', audioCount: found.filter(Boolean).length, audioTotal: AUDIO_FILES.length });
      } else if (event.data?.type === 'DOWNLOAD_AUDIO') {
        downloadPorts.add(port);
        if (!audioDownload) audioDownload = prepareAudio().finally(() => { audioDownload = null; });
        await audioDownload;
        port.postMessage({ type: 'DONE' });
      }
    } catch (_) {
      port.postMessage({ type: 'ERROR', message: '离线资源下载未完成' });
    } finally {
      downloadPorts.delete(port); port.close();
    }
  })());
});
