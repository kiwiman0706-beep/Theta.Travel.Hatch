// Unit tests for assets/www/js/core.js — run: node --test source/web-tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../app/src/main/assets/www/js/core.js');

function sample() {
  const s = C.emptyState();
  s.settings.home = { label: '大阪', lat: 34.7025, lon: 135.4959 };
  const aw = C.normSpot({ id: 'aw', name: 'アドベンチャーワールド', lat: 33.6683, lon: 135.3626, indoor: 'both', tags: ['動物'], durationMin: 300 });
  const kaiyukan = C.normSpot({ id: 'ky', name: '海遊館', lat: 34.6545, lon: 135.4290, indoor: 'indoor' });
  const nara = C.normSpot({ id: 'np', name: '奈良公園', lat: 34.6851, lon: 135.8430, indoor: 'outdoor', wish: false });
  const noGeo = C.normSpot({ id: 'ng', name: '名前だけ' });
  s.spots.push(aw, kaiyukan, nara, noGeo);
  s.visits.push(C.normVisit({ spotId: 'np', date: '2025-05-01', weather: 'sunny', rating: 5, revisit: 'yes' }));
  s.visits.push(C.normVisit({ spotId: 'ky', date: '2026-08-10', weather: 'rain', rating: 4 }));
  return s;
}

test('migrate tolerates garbage and drops orphan visits', () => {
  const st = C.migrate({ spots: [{ id: 'a', name: 'A', lat: '999', lon: 'x' }], visits: [{ spotId: 'zzz' }, { spotId: 'a' }], plans: [{}] });
  assert.equal(st.spots[0].lat, null);
  assert.equal(st.visits.length, 1);
  assert.equal(st.plans[0].title, '新しいしおり');
  assert.deepEqual(C.migrate(null).spots, []);
  assert.throws(() => C.migrate({ schema: 99 }));
});

test('spot status: wish, visited, both', () => {
  const s = sample();
  assert.equal(C.spotStatus(s, s.spots[0]), 'wish');
  assert.equal(C.spotStatus(s, s.spots[1]), 'both');
  assert.equal(C.spotStatus(s, s.spots[2]), 'visited');
  assert.deepEqual(C.filterSpots(s, 'visited').map((x) => x.id).sort(), ['ky', 'np']);
  assert.equal(C.filterSpots(s, 'all').length, 4);
});

test('parseConditions reads Japanese phrases', () => {
  const s = sample();
  const c = C.parseConditions('雨なので午後から、子連れで車で２時間以内', s.spots);
  assert.ok(c.rain && c.afternoon && c.kids);
  assert.equal(c.mode, 'car');
  assert.equal(c.maxHours, 2);
  const d = C.parseConditions('白浜アドベンチャーワールドに1泊で行きたい', s.spots);
  assert.ok(d.overnight);
  assert.equal(d.nights, 1);
  assert.equal(d.targetSpotId, 'aw');
  assert.equal(C.parseConditions('二泊三日', []).nights, 2);
});

test('suggest prefers indoor spots when it rains', () => {
  const s = sample();
  const r = C.suggest(s, C.parseConditions('雨', s.spots), new Date('2026-10-17T10:00:00'));
  assert.equal(r[0].spot.id, 'ky');
  assert.ok(r[0].reasons.some((x) => x.includes('屋内')));
  const nara = r.find((x) => x.spot.id === 'np');
  assert.ok(nara.cautions.includes('屋外中心'));
  assert.ok(r.every((x) => x.cautions.includes('営業時間・料金は要確認')));
});

test('suggest respects travel limit but keeps the named target', () => {
  const s = sample();
  const c = C.parseConditions('車で1時間以内', s.spots);
  const r = C.suggest(s, c, new Date('2026-10-17T10:00:00'));
  assert.ok(!r.some((x) => x.spot.id === 'aw'));
  const c2 = C.parseConditions('アドベンチャーワールド 車で1時間以内', s.spots);
  const r2 = C.suggest(s, c2, new Date('2026-10-17T10:00:00'));
  assert.equal(r2[0].spot.id, 'aw');
});

test('buildPlanDraft creates an editable overnight draft with packing', () => {
  const s = sample();
  const c = C.parseConditions('アドベンチャーワールドに1泊 雨かも', s.spots);
  const p = C.buildPlanDraft(s, s.spots[0], c, new Date('2026-10-17T11:00:00'));
  assert.equal(p.status, 'draft');
  assert.equal(p.nights, 1);
  assert.equal(C.planDays(p), 2);
  assert.ok(p.stops.some((x) => x.spotId === 'aw'));
  assert.ok(p.packing.some((x) => x.name === 'レインコート'));
  assert.ok(p.packing.some((x) => x.name === 'パジャマ'));
});

test('planToVisits creates one visit per chosen spot and marks plan done', () => {
  const s = sample();
  const p = C.normPlan({ id: 'p1', startDate: '2026-10-20', stops: [{ spotId: 'aw' }, { spotId: 'ky' }] });
  s.plans.push(p);
  const v = C.planToVisits(s, 'p1', { spotIds: ['aw'], weather: 'rain' });
  assert.equal(v.length, 1);
  assert.equal(v[0].date, '2026-10-20');
  assert.equal(s.plans[0].status, 'done');
  assert.equal(C.spotStatus(s, s.spots[0]), 'both');
});

test('searchVisits filters by weather and text', () => {
  const s = sample();
  assert.equal(C.searchVisits(s, { weather: 'rain' }).length, 1);
  assert.equal(C.searchVisits(s, { text: '奈良' }).length, 1);
  assert.equal(C.searchVisits(s, { revisit: true }).length, 1);
  assert.equal(C.searchVisits(s, { year: '2026' })[0].spotId, 'ky');
});

test('deleteSpot keeps plan stops as labels', () => {
  const s = sample();
  s.plans.push(C.normPlan({ stops: [{ spotId: 'ky' }] }));
  const removed = C.deleteSpot(s, 'ky');
  assert.equal(removed.length, 1);
  assert.equal(s.plans[0].stops[0].spotId, null);
  assert.ok(s.plans[0].stops[0].label);
});

test('transferGaps computes minutes between legs', () => {
  const legs = [C.normLeg({ depart: '09:00', arrive: '09:40' }), C.normLeg({ depart: '09:48', arrive: '11:50' }), C.normLeg({ depart: '', arrive: '' })];
  assert.deepEqual(C.transferGaps(legs), [8, null]);
});

test('CSV export escapes and has BOM; backup omits API key', () => {
  const s = sample();
  s.visits[0].impression = '楽しかった, "また"\n行く';
  const csv = C.visitsCsv(s);
  assert.ok(csv.startsWith('﻿日付'));
  assert.ok(csv.includes('"楽しかった, ""また""\n行く"'));
  s.settings.geminiKey = 'SECRET';
  assert.ok(!C.backupJson(s, {}).includes('SECRET'));
  assert.equal(s.settings.geminiKey, 'SECRET');
  const round = C.migrate(JSON.parse(C.backupJson(s, {})));
  assert.equal(round.spots.length, 4);
  assert.equal(round.visits.length, 2);
});

test('compareVersions handles prerelease', () => {
  assert.equal(C.compareVersions('v0.2.0', '0.1.0'), 1);
  assert.equal(C.compareVersions('0.1.0', '0.1.0'), 0);
  assert.equal(C.compareVersions('0.2.0-beta.1', '0.2.0'), -1);
  assert.equal(C.compareVersions('0.2.0-beta.2', '0.2.0-beta.10'), -1);
});

test('parseModelJson and planFromGemini map stops to spots', () => {
  const s = sample();
  const json = C.parseModelJson('```json\n{"title":"白浜1泊","days":[{"day":1,"stops":[{"time":"9:30","label":"アドベンチャーワールドへ"}]}],"packing":["タオル"],"cautions":["営業時間は要確認"]}\n```');
  const p = C.planFromGemini(s, s.spots[0], { overnight: true, nights: 1 }, json, 'test-model');
  assert.equal(p.stops[0].spotId, 'aw');
  assert.equal(p.stops[0].time, '09:30');
  assert.equal(p.ai.cautions[0], '営業時間は要確認');
  assert.equal(p.status, 'draft');
});

test('summarizeWeather', () => {
  const w = C.summarizeWeather({ daily: { time: ['2026-10-17'], weather_code: [61], precipitation_probability_max: [80], temperature_2m_max: [22], temperature_2m_min: [15] } });
  assert.equal(w.days[0].rainProb, 80);
  assert.equal(C.weatherEmoji(61), '☔');
});
