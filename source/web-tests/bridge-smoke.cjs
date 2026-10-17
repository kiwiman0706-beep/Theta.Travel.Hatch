// Exercises the Android code path of native.js with a stubbed window.TabiNative
// (same method names/signatures as NativeBridge.java). run: node source/web-tests/bridge-smoke.cjs
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright')); }
const url = 'file://' + path.join(__dirname, '../app/src/main/assets/www/index.html');

(async () => {
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route(/^https:\/\//, (r) => r.abort());
  await page.addInitScript(() => {
    const store = { data: null, saved: 0, http: [], shared: 'ここ行きたい https://example.com/park' };
    const later = (fn) => setTimeout(fn, 20);
    window.__stub = store;
    window.TabiNative = {
      loadData: () => store.data,
      saveData: (json) => { JSON.parse(json); store.data = json; store.saved++; return true; },
      appInfo: () => JSON.stringify({ versionName: '0.1.0', versionCode: 100, package: 'jp.theta.travelhatch' }),
      consumeSharedText: () => { const s = store.shared; store.shared = null; return s; },
      http: (id, method, url, headers, body) => {
        store.http.push({ method, url, headers: JSON.parse(headers), body });
        let res = { status: 200, body: '[]' };
        if (url.includes('nominatim')) res.body = JSON.stringify([{ name: '公園', display_name: '公園, 大阪市', lat: '34.6', lon: '135.5' }]);
        if (url.includes('generativelanguage')) res.body = JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"name":"大きな公園","area":"大阪市","indoor":"outdoor","durationMin":90,"tags":["公園"],"summary":"広い芝生","kidsNote":"遊具あり"}' }] } }] });
        later(() => window.TabiNativeCallback(id, true, res));
      },
      startVoice: (id) => later(() => window.TabiNativeCallback(id, true, '海遊館に行きたい')),
      pickPhotos: (id) => later(() => window.TabiNativeCallback(id, true, ['a1b2.jpg'])),
      exportFile: (id, name, mime, content) => { store.exported = { name, mime, content }; later(() => window.TabiNativeCallback(id, true, name)); },
      importFile: (id) => later(() => window.TabiNativeCallback(id, true, null)),
      shareText: (t) => { store.sharedOut = t; },
      openUrl: (u) => { store.opened = u; },
      deletePhoto: () => true,
    };
  });
  await page.goto(url);

  // Shared text opens the spot editor prefilled.
  await page.waitForSelector('#sp-url');
  if (await page.inputValue('#sp-url') !== 'https://example.com/park') throw new Error('share URL not prefilled');
  if (await page.inputValue('#sp-name') !== 'ここ行きたい') throw new Error('share name not prefilled');
  // Voice goes through the callback.
  await page.fill('#sp-name', '');
  await page.click('[data-action="voice"][data-target="sp-name"]');
  await page.waitForFunction(() => document.getElementById('sp-name').value === '海遊館に行きたい');
  await page.fill('#sp-name', '大きな公園');
  // Geocode through native http, with UA set natively (not by JS).
  await page.click('[data-action="geo-search"]');
  await page.click('[data-geo-pick="0"]');
  await page.click('[data-action="save-spot"]');
  const stub = await page.evaluate(() => window.__stub);
  if (!stub.saved) throw new Error('saveData not called');
  const saved = JSON.parse(stub.data);
  if (saved.spots[0].lat !== 34.6 || saved.spots[0].geoSource !== 'osm') throw new Error('geocode pick not saved');

  // Gemini spot summary via native http POST with header key.
  await page.evaluate(() => { const s = window.TabiApp.state(); s.settings.geminiKey = 'k-test'; });
  await page.click('[data-action="add-menu"]');
  await page.click('.sheet [data-action="new-spot"]');
  await page.fill('#sp-name', '公園');
  await page.click('[data-action="ai-spot"]');
  await page.waitForFunction(() => document.getElementById('sp-indoor').value === 'outdoor');
  const g = (await page.evaluate(() => window.__stub.http)).find((h) => h.url.includes('generativelanguage'));
  if (g.method !== 'POST' || g.headers['x-goog-api-key'] !== 'k-test') throw new Error('gemini request malformed');
  await page.click('[data-action="save-spot"]');

  // Visit with photos uses /photos/ URLs.
  await page.waitForSelector('#modal', { state: 'hidden' });
  await page.click('.nav [data-screen="history"]');
  await page.click('[data-action="new-visit"]');
  await page.selectOption('#vi-spot', { index: 1 });
  await page.click('[data-action="add-photos"]');
  await page.waitForSelector('#vi-photos img[src="/photos/a1b2.jpg"]');
  await page.click('[data-action="save-visit"]');

  // Export JSON strips the API key.
  await page.click('[data-action="settings"]');
  await page.click('[data-action="export-json"]');
  await page.waitForFunction(() => window.__stub.exported);
  const ex = await page.evaluate(() => window.__stub.exported);
  if (ex.content.includes('k-test') || ex.mime !== 'application/json') throw new Error('export leaked key or wrong mime');

  if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
  await browser.close();
  console.log('Bridge smoke: PASS');
})().catch((e) => { console.error('Bridge smoke: FAIL', e); process.exit(1); });
