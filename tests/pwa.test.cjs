'use strict';
// No dependencies: node --test tests/pwa.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

function worker({ scope = '/qiushixixing/', fail = () => false } = {}) {
  const events = new Map(), stores = new Map(), requests = [];
  const base = 'https://example.test' + scope;
  const key = input => typeof input === 'string' ? input : input.url;
  const fetch = async input => {
    const url = key(input); requests.push(url);
    if (fail(url)) throw Error('network unavailable');
    return new Response(url.endsWith('.mp3') ? '0123456789' : url);
  };
  const caches = {
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); },
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const entries = stores.get(name);
      return {
        async match(input) { return entries.get(key(input))?.clone(); },
        async put(input, response) { entries.set(key(input), response.clone()); },
        async addAll(inputs) {
          const responses = await Promise.all(inputs.map(fetch));
          inputs.forEach((input, i) => entries.set(key(input), responses[i]));
        }
      };
    }
  };
  const context = vm.createContext({
    self: { location: { href: base + 'sw.js' }, clients: { async claim() {} }, addEventListener: (name, fn) => events.set(name, fn) },
    URL, Request, Response, Headers, caches, fetch
  });
  vm.runInContext(source, context);
  const get = expr => vm.runInContext(expr, context);
  return {
    get, base, caches, stores, requests,
    async dispatch(type, properties = {}) {
      let result;
      events.get(type)({ ...properties, waitUntil: value => { result = value; }, respondWith: value => { result = value; } });
      return result;
    },
    async message(type) {
      const messages = [];
      await this.dispatch('message', { data: { type }, ports: [{ postMessage: m => messages.push(m), close() {} }] });
      return messages;
    }
  };
}

test('precache paths exist and cover current engine images/audio, with no backup files', () => {
  const w = worker();
  for (const file of [...w.get('SHELL_FILES'), ...w.get('AUDIO_FILES')]) {
    assert.ok(fs.existsSync(path.join(root, file)), file);
    assert.ok(!file.includes('/_'), file);
  }
  const images = fs.readdirSync(path.join(root, 'assets/images')).filter(f => /^IMG-.*\.webp$/.test(f)).sort();
  assert.deepEqual(Array.from(w.get('SHELL_FILES')).filter(f => f.includes('/images/')).map(f => path.basename(f)).sort(), images);
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const fileMap = html.match(/const files=\{([\s\S]*?)\n\};/)[1];
  const audio = [...fileMap.matchAll(/:'([^']+)'/g)].map(m => './qiushi_bgm/' + m[1]).sort();
  assert.deepEqual(Array.from(w.get('AUDIO_FILES')).sort(), audio);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest')));
  for (const field of ['id', 'start_url', 'scope']) assert.equal(manifest[field], './');
});

test('failed install never replaces the previous cached release', async () => {
  const w = worker({ fail: url => url.endsWith('IMG-45.webp') });
  const old = await w.caches.open(w.get('PREFIX') + 'shell-old');
  await old.put(w.base + 'index.html', new Response('old game'));
  await assert.rejects(w.dispatch('install'));
  assert.equal(await (await old.match(w.base + 'index.html')).text(), 'old game');
  assert.equal((await (await w.caches.open(w.get('SHELL_CACHE'))).match(w.base + 'index.html')), undefined);
});

test('activation only removes old caches within this application scope', async () => {
  const w = worker();
  const prefix = w.get('PREFIX');
  for (const name of [prefix + 'shell-old', prefix + 'audio-old', 'qiushi-pwa:/other/:shell-old', w.get('AUDIO_CACHE'), w.get('SHELL_CACHE')]) await w.caches.open(name);
  await w.dispatch('activate');
  assert.deepEqual((await w.caches.keys()).sort(), ['qiushi-pwa:/other/:shell-old', w.get('AUDIO_CACHE'), w.get('SHELL_CACHE')].sort());
});

test('offline navigation works at a repository subpath, preserves queries, and excludes other pages', async () => {
  const w = worker({ fail: () => true });
  const shell = await w.caches.open(w.get('SHELL_CACHE'));
  await shell.put(w.base + 'index.html', new Response('cached game'));
  const navigation = url => ({ url, method: 'GET', mode: 'navigate' });
  for (const suffix of ['', 'index.html', '?source=installed', '?debug=1']) {
    const result = await w.dispatch('fetch', { request: navigation(w.base + suffix) });
    assert.equal(await result.text(), 'cached game');
  }
  for (const url of [w.base + 'test.html', w.base + 'missing', 'https://example.test/another/', 'https://elsewhere.test/']) {
    assert.equal(await w.dispatch('fetch', { request: navigation(url) }), undefined);
  }
});

test('cached audio handles full, bounded, open-ended, suffix, clamped and invalid byte ranges', async () => {
  const w = worker({ fail: () => true });
  const url = w.get('urlFor(AUDIO_FILES[0])');
  await (await w.caches.open(w.get('AUDIO_CACHE'))).put(url, new Response('0123456789', { headers: { 'Content-Type': 'audio/mpeg' } }));
  const full = await w.dispatch('fetch', { request: new Request(url) });
  assert.equal(full.status, 200); assert.equal(await full.text(), '0123456789');
  for (const [range, text, contentRange] of [
    ['bytes=2-5', '2345', 'bytes 2-5/10'], ['bytes=8-', '89', 'bytes 8-9/10'],
    ['bytes=-3', '789', 'bytes 7-9/10'], ['bytes=8-99', '89', 'bytes 8-9/10']
  ]) {
    const result = await w.dispatch('fetch', { request: new Request(url, { headers: { Range: range } }) });
    assert.equal(result.status, 206); assert.equal(result.headers.get('Content-Range'), contentRange);
    assert.equal(result.headers.get('Content-Length'), String(text.length));
    assert.equal(result.headers.get('Content-Type'), 'audio/mpeg'); assert.equal(await result.text(), text);
  }
  for (const range of ['bytes=10-', 'bytes=7-2', 'bytes=-0', 'bytes=-', 'bytes=0-1,3-4']) {
    const result = await w.dispatch('fetch', { request: new Request(url, { headers: { Range: range } }) });
    assert.equal(result.status, 416); assert.equal(result.headers.get('Content-Range'), 'bytes */10');
  }
});

test('failed audio downloads retain completed files and retry only missing files', async () => {
  let offline = true;
  const w = worker({ fail: url => offline && url.includes('mondamusic') });
  assert.equal((await w.message('DOWNLOAD_AUDIO')).at(-1).type, 'ERROR');
  assert.equal((await w.message('STATUS')).at(-1).audioCount, 1);
  offline = false;
  assert.equal((await w.message('DOWNLOAD_AUDIO')).at(-1).type, 'DONE');
  const status = (await w.message('STATUS')).at(-1);
  assert.equal(status.audioCount, 15); assert.equal(status.audioTotal, 15);
  assert.equal(w.requests.filter(u => u.includes('atlasaudio')).length, 1);
});

test('concurrent audio requests share one download and uncached streaming does not poison the cache', async () => {
  const w = worker();
  const url = w.get('urlFor(AUDIO_FILES[0])');
  await w.dispatch('fetch', { request: new Request(url, { headers: { Range: 'bytes=0-3' } }) });
  assert.equal((await w.message('STATUS')).at(-1).audioCount, 0);
  w.requests.length = 0;
  const results = await Promise.all([w.message('DOWNLOAD_AUDIO'), w.message('DOWNLOAD_AUDIO')]);
  assert.ok(results.every(messages => messages.at(-1).type === 'DONE'));
  assert.equal(w.requests.length, 15);
});
