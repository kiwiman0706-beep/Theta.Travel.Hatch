// Browser smoke test of the web UI (no Android bridge: localStorage + mocked network).
// run: node source/web-tests/ui-smoke.cjs [screenshotDir]
const path = require('path');
const http = require('http');
const fs = require('fs');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright')); }

const ROOT = path.join(__dirname, '../app/src/main/assets/www');
const SHOTS = process.argv[2];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
      if (!p.startsWith(ROOT) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' });
      fs.createReadStream(p).pipe(res);
    }).listen(0, () => resolve(srv));
  });
}

const tile = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

(async () => {
  const srv = await serve();
  const base = `http://localhost:${srv.address().port}/index.html`;
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'ja-JP' });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.route(/^https:\/\//, (route) => {
    const u = route.request().url();
    if (u.includes('nominatim') && u.includes('%E5%A4%A7%E9%98%AA')) return route.fulfill({ json: [] });
    if (u.includes('nominatim')) return route.fulfill({ json: [{ name: 'アドベンチャーワールド', display_name: 'アドベンチャーワールド, 白浜町, 和歌山県', lat: '33.6683', lon: '135.3626' }] });
    if (u.includes('msearch.gsi.go.jp')) {
      if (u.includes('%E5%A4%A7%E9%98%AA')) return route.fulfill({ json: [{ geometry: { coordinates: [135.4959, 34.7025] }, properties: { title: '大阪府大阪市北区梅田' } }] });
      return route.fulfill({ json: [] });
    }
    if (u.includes('open-meteo')) return route.fulfill({ json: { daily: { time: [new Date().toISOString().slice(0, 10)], weather_code: [61], precipitation_probability_max: [80], temperature_2m_max: [22], temperature_2m_min: [15] } } });
    if (/tile|cyberjapandata/.test(u)) return route.fulfill({ body: tile, contentType: 'image/png' });
    return route.abort();
  });
  const shot = async (name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png') }); };
  const step = (m) => console.log('•', m);

  await page.goto(base);
  await page.waitForSelector('.hero');
  await shot('01-home-empty');

  step('settings: home location via search');
  await page.click('[data-action="settings"]');
  await page.fill('#set-home', '大阪');
  await page.fill('#set-geo-q', '大阪');
  await page.click('[data-action="set-geo-search"]');
  await page.click('[data-geo-pick="0"]');
  await page.click('[data-action="save-settings"]');
  await page.waitForSelector('.hero .weather');

  step('add spot with geocode candidate');
  await page.click('[data-action="add-menu"]');
  await page.click('.sheet [data-action="new-spot"]');
  await page.fill('#sp-name', 'アドベンチャーワールド');
  await page.click('[data-action="geo-search"]');
  await page.waitForSelector('[data-geo-pick="0"]');
  await shot('02-spot-candidates');
  await page.click('[data-geo-pick="0"]');
  await page.selectOption('#sp-indoor', 'both');
  await page.click('[data-icon="🐼"]');
  await page.click('[data-action="save-spot"]');

  step('add spot without coordinates (must not get a pin)');
  await page.click('[data-action="add-menu"]');
  await page.click('.sheet [data-action="new-spot"]');
  await page.fill('#sp-name', '海遊館');
  await page.selectOption('#sp-indoor', 'indoor');
  await page.click('details.box summary');
  await page.fill('#sp-lat', '34.6545');
  await page.fill('#sp-lon', '135.4290');
  await page.click('[data-action="geo-manual"]');
  await page.click('[data-action="save-spot"]');
  await page.click('[data-action="add-menu"]');
  await page.click('.sheet [data-action="new-spot"]');
  await page.fill('#sp-name', '位置なしスポット');
  await page.click('[data-action="save-spot"]');

  step('spot map shows 2 pins + unplaced banner');
  await page.click('.nav [data-screen="spots"]');
  await page.waitForSelector('#spot-map .leaflet-marker-icon, #spot-map .marker-cluster');
  const unplaced = await page.textContent('.unplaced');
  if (!unplaced.includes('位置なしスポット')) throw new Error('unplaced banner missing');
  await page.waitForTimeout(400);
  await shot('03-spot-map');

  step('suggest on rainy day → draft plan');
  await page.click('.nav [data-screen="home"]');
  await page.fill('#q', '雨なので午後から屋内で');
  await page.click('[data-action="suggest"]');
  await page.waitForSelector('.suggest h3');
  const top = await page.textContent('.suggest h3');
  if (!top.includes('海遊館')) throw new Error('rainy suggestion should be 海遊館, got ' + top);
  await shot('04-suggest');
  await page.click('.suggest [data-action="draft-plan"]');
  await page.waitForSelector('.cover');
  await shot('05-plan-draft');
  await page.click('[data-action="confirm-plan"]');

  step('transit legs out/back');
  await page.click('[data-plan-tab="legs"]');
  await page.click('[data-plan-mode="transit"]');
  await page.click('[data-action="new-leg"]');
  await page.fill('#lg-from', '大阪'); await page.fill('#lg-to', '弁天町'); await page.fill('#lg-line', 'JR大阪環状線');
  await page.fill('#lg-dep', '13:00'); await page.fill('#lg-arr', '13:10'); await page.fill('#lg-tr', '5');
  await page.click('[data-action="save-leg"]');
  await page.click('[data-action="new-leg"]');
  if (await page.inputValue('#lg-from') !== '弁天町') throw new Error('next leg should start at previous arrival');
  await page.fill('#lg-to', '大阪港'); await page.fill('#lg-line', 'Osaka Metro中央線');
  await page.fill('#lg-dep', '13:13'); await page.fill('#lg-arr', '13:20'); await page.fill('#lg-ticket', 'ICカード');
  await page.click('[data-action="save-leg"]');
  if (!(await page.textContent('.gap')).includes('3分')) throw new Error('transfer gap missing');
  await shot('06-legs');
  await page.click('[data-leg-dir="back"]');
  await page.click('[data-action="new-leg"]');
  await page.fill('#lg-from', '大阪港'); await page.fill('#lg-to', '大阪');
  await page.click('[data-action="save-leg"]');

  step('packing');
  await page.click('[data-plan-tab="packing"]');
  const before = await page.$$eval('.pack-row', (r) => r.length);
  await page.fill('#pack-new', '日焼け止め');
  await page.press('#pack-new', 'Enter');
  await page.click('.pack-row input[type=checkbox]');
  const after = await page.$$eval('.pack-row', (r) => r.length);
  if (after !== before + 1) throw new Error('pack add failed');
  await page.click('[data-action="pack-template"]');
  await page.fill('#tpl-name', '日帰りの基本');
  await page.click('[data-action="save-template"]');
  await page.click('[data-action="close"]');
  await shot('07-packing');

  step('plan → visit');
  await page.click('[data-action="plan-to-visit"]');
  await page.click('[data-pick-weather="rain"]');
  await page.click('[data-action="save-plan-visit"]');

  step('direct visit with new place');
  await page.click('.nav [data-screen="history"]');
  await page.click('[data-action="new-visit"]');
  await page.fill('#vi-newspot', '近所の公園');
  await page.click('[data-star="4"]');
  await page.fill('#vi-imp', '晴れて気持ちよかった');
  await page.click('[data-action="save-visit"]');
  const cards = await page.$$eval('.log-card', (r) => r.length);
  if (cards !== 2) throw new Error('expected 2 visits, got ' + cards);
  await page.click('[data-hq="weather"]');
  if (await page.$$eval('.log-card', (r) => r.length) !== 1) throw new Error('rain filter failed');
  await page.click('[data-hq="weather"]');
  await page.click('[data-history-view="table"]');
  await page.waitForSelector('table tbody tr');
  await shot('08-history-table');
  await page.click('[data-history-view="map"]');
  await page.waitForSelector('#history-map .leaflet-marker-icon');

  step('persistence after reload');
  await page.reload();
  await page.waitForSelector('.hero');
  const st = await page.evaluate(() => { const s = window.TabiApp.state(); return [s.spots.length, s.plans.length, s.visits.length, s.packTemplates.length, s.plans[0].legs.length]; });
  if (JSON.stringify(st) !== '[4,1,2,1,3]') throw new Error('persist mismatch ' + JSON.stringify(st));

  step('back handling');
  await page.click('.nav [data-screen="plans"]');
  await page.click('[data-action="open-plan"]');
  if (!(await page.evaluate(() => window.TabiApp.onBack()))) throw new Error('back should close plan');
  if (!(await page.evaluate(() => window.TabiApp.onBack()))) throw new Error('back should go home');
  if (await page.evaluate(() => window.TabiApp.onBack())) throw new Error('back on home should exit');

  step('no horizontal overflow on narrow screen');
  await page.setViewportSize({ width: 320, height: 640 });
  for (const s of ['home', 'spots', 'plans', 'history']) {
    await page.click(`.nav [data-screen="${s}"]`);
    const over = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    if (over) throw new Error('horizontal overflow on ' + s);
  }

  if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
  await browser.close();
  srv.close();
  console.log('UI smoke: PASS');
})().catch((e) => { console.error('UI smoke: FAIL', e); process.exit(1); });
