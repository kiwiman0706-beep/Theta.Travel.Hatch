/* たびのたね — UI layer. State lives in S (persisted via TabiNativeApi), view state in ui. */
(function () {
  'use strict';
  const C = window.TabiCore;
  const N = window.TabiNativeApi;
  const REPO = 'kiwiman0706-beep/Theta.Travel.Hatch';
  const ICONS = ['📍', '🐼', '🦌', '🐠', '🏯', '⛩', '🌊', '⛰', '🎢', '♨', '🍜', '🌸', '🏞', '🏛', '🛍', '🎡', '🚂', '🏕', '🍦', '🖼'];
  const LEG_ICON = { train: '🚃', bus: '🚌', walk: '🚶', car: '🚗', plane: '✈', ship: '⛴', taxi: '🚕', other: '•' };

  let S;
  try {
    S = C.migrate(N.loadData());
  } catch (e) {
    S = C.emptyState();
    setTimeout(() => toast('保存データを読み込めませんでした: ' + e.message), 300);
  }
  const app = N.appInfo();

  const ui = {
    screen: 'home',
    query: '',
    cond: { rain: false, afternoon: false, overnight: false, kids: false, indoor: false },
    results: null,
    spotView: 'map',
    spotFilter: 'all',
    spotQuery: '',
    planId: null,
    planTab: 'stops',
    planDay: 1,
    legDir: 'out',
    historyView: 'list',
    hq: { text: '', weather: '', revisit: false, minRating: 0, year: '' },
    tableSort: { key: 'date', dir: -1 },
    sheet: null, // {kind, ...} for the open bottom sheet
    busy: false,
  };

  // ---- helpers ---------------------------------------------------------------------------

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => [...(root || document).querySelectorAll(sel)];
  const esc = (s) => String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const val = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
  const checked = (id) => { const el = document.getElementById(id); return !!(el && el.checked); };
  const spotById = (id) => S.spots.find((s) => s.id === id);
  const planById = (id) => S.plans.find((p) => p.id === id);
  const fmtDate = (d) => (d ? d.replace(/-/g, '.') : '');
  const fmtTime = (iso) => { try { const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; } catch (e) { return ''; } };
  const yen = (n) => (n === null || n === undefined || n === '' ? '' : `¥${Number(n).toLocaleString('ja-JP')}`);
  const stars = (n) => (n ? '★'.repeat(n) + '☆'.repeat(5 - n) : '');
  const hasKey = () => !!S.settings.geminiKey;

  function persist() {
    if (!N.saveData(S)) toast('保存に失敗しました。端末の空き容量を確認してください');
  }

  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2800);
  }

  function addDays(date, n) {
    const d = new Date(date + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return C.isoDate(d);
  }

  // ---- maps ------------------------------------------------------------------------------

  let maps = [];
  function destroyMaps(root) {
    maps = maps.filter((m) => {
      if (!root || root.contains(m.getContainer())) { m.stop(); m.off(); m.remove(); return false; }
      return true;
    });
  }

  function tileLayer() {
    if (S.settings.tiles === 'osm') {
      return L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' });
    }
    return L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html">国土地理院</a>' });
  }

  function pinIcon(kind, emoji) {
    return L.divIcon({ className: '', html: `<div class="pin ${kind}"><span>${esc(emoji)}</span></div>`, iconSize: [34, 34], iconAnchor: [4, 34], popupAnchor: [13, -30] });
  }

  /** Plots spots on a map inside el. items: [{spot, kind, sub}] */
  function mountSpotMap(el, items) {
    if (!window.L) { el.innerHTML = '<div class="empty">地図を読み込めませんでした</div>'; return; }
    const map = L.map(el, { zoomControl: true, attributionControl: true });
    tileLayer().addTo(map);
    const cluster = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 45 });
    const pts = [];
    items.forEach(({ spot, kind, sub }) => {
      const m = L.marker([spot.lat, spot.lon], { icon: pinIcon(kind, spot.icon), title: spot.name, alt: spot.name });
      m.bindPopup(`<div class="popup-title">${esc(spot.icon)} ${esc(spot.name)}</div><div class="popup-meta">${esc(sub)}</div><button type="button" class="popup-btn" data-action="open-spot" data-id="${esc(spot.id)}">くわしく見る</button>`);
      cluster.addLayer(m);
      pts.push([spot.lat, spot.lon]);
    });
    map.addLayer(cluster);
    const home = S.settings.home;
    if (home.lat !== null && home.lon !== null) {
      L.circleMarker([home.lat, home.lon], { radius: 7, color: '#0c7d82', fillColor: '#fff', fillOpacity: 1, weight: 3 }).bindTooltip('出発地').addTo(map);
      if (!pts.length) pts.push([home.lat, home.lon]);
    }
    if (pts.length > 1) map.fitBounds(pts, { padding: [36, 36], maxZoom: 14, animate: false });
    else if (pts.length === 1) map.setView(pts[0], 12);
    else map.setView([34.7, 135.5], 7);
    maps.push(map);
    setTimeout(() => { if (maps.includes(map)) map.invalidateSize({ animate: false }); }, 60);
    return map;
  }

  /** Map for choosing a location: tap to place. onPick(lat, lon). */
  function mountPickMap(el, lat, lon, onPick) {
    if (!window.L) return null;
    const map = L.map(el);
    tileLayer().addTo(map);
    let marker = null;
    const place = (la, lo) => {
      if (marker) marker.setLatLng([la, lo]);
      else marker = L.marker([la, lo], { icon: pinIcon('pick', '📍') }).addTo(map);
    };
    const home = S.settings.home;
    if (lat !== null && lon !== null) { place(lat, lon); map.setView([lat, lon], 14); }
    else if (home.lat !== null) map.setView([home.lat, home.lon], 10);
    else map.setView([34.7, 135.5], 7);
    map.on('click', (e) => { place(e.latlng.lat, e.latlng.lng); onPick(e.latlng.lat, e.latlng.lng); });
    map.setPin = (la, lo) => { place(la, lo); map.setView([la, lo], 15); };
    maps.push(map);
    setTimeout(() => { if (maps.includes(map)) map.invalidateSize({ animate: false }); }, 80);
    return map;
  }

  // ---- network features ------------------------------------------------------------------

  async function geocode(q) {
    const enc = encodeURIComponent(q);
    const out = [];
    const jobs = [
      N.getJson(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&countrycodes=jp&accept-language=ja&q=${enc}`)
        .then((r) => r.forEach((x) => out.push({ name: x.name || x.display_name.split(',')[0], address: x.display_name, lat: Number(x.lat), lon: Number(x.lon), source: 'osm' })))
        .catch(() => {}),
      N.getJson(`https://msearch.gsi.go.jp/address-search/AddressSearch?q=${enc}`)
        .then((r) => r.slice(0, 6).forEach((x) => out.push({ name: x.properties.title, address: x.properties.title, lat: x.geometry.coordinates[1], lon: x.geometry.coordinates[0], source: 'gsi' })))
        .catch(() => {}),
    ];
    await Promise.all(jobs);
    return out.filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lon));
  }

  async function refreshWeather(force) {
    const h = S.settings.home;
    if (h.lat === null || h.lon === null) return;
    if (!force && S.weather && Date.now() - new Date(S.weather.fetchedAt).getTime() < 3 * 3600 * 1000) return;
    try {
      const json = await N.getJson(`https://api.open-meteo.com/v1/forecast?latitude=${h.lat}&longitude=${h.lon}&daily=weather_code,precipitation_probability_max,temperature_2m_max,temperature_2m_min&timezone=Asia%2FTokyo&forecast_days=3`);
      S.weather = C.summarizeWeather(json);
      persist();
      if (ui.screen === 'home' && !ui.sheet) render();
    } catch (e) {
      if (force) toast('天気を取得できませんでした');
    }
  }

  async function gemini(prompt) {
    const model = S.settings.geminiModel || 'gemini-flash-latest';
    const r = await N.http('POST', `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      { 'Content-Type': 'application/json', 'x-goog-api-key': S.settings.geminiKey },
      JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.4, responseMimeType: 'application/json' } }));
    let body;
    try { body = JSON.parse(r.body); } catch (e) { throw new Error(`Gemini HTTP ${r.status}`); }
    if (r.status >= 400) throw new Error((body.error && body.error.message) || `Gemini HTTP ${r.status}`);
    const text = (((body.candidates || [])[0] || {}).content || { parts: [] }).parts.map((p) => p.text || '').join('');
    return { json: C.parseModelJson(text), model };
  }

  // ---- screens ---------------------------------------------------------------------------

  function todayWeather() {
    if (!S.weather || !S.weather.days.length) return null;
    const today = C.isoDate(new Date());
    return S.weather.days.find((d) => d.date === today) || null;
  }

  function spotCard(spot, sub) {
    const st = C.spotStatus(S, spot);
    const noGeo = !C.hasCoords(spot) ? '<span class="badge warn">位置未確認</span>' : '';
    return `<button type="button" class="card spot-card active" data-action="open-spot" data-id="${esc(spot.id)}">
      <div class="art ${st}" aria-hidden="true">${esc(spot.icon)}</div>
      <div><div class="card-title">${esc(spot.name)}</div><div class="card-meta"><span class="badge">${C.STATUS_LABEL[st]}</span>${noGeo}${esc(sub || spot.address || C.INDOOR_LABEL[spot.indoor])}</div></div>
      <span class="chev" aria-hidden="true">›</span></button>`;
  }

  function home() {
    const w = todayWeather();
    const wBadge = w ? `<span class="weather">${C.weatherEmoji(w.code)} 降水${w.rainProb ?? '-'}%</span>` : '';
    const c = ui.cond;
    const chip = (k, label) => `<button class="chip active" type="button" data-cond="${k}" aria-pressed="${!!c[k]}">${label}</button>`;
    let results = '';
    if (ui.results) {
      if (!ui.results.length) {
        results = `<div class="card suggest"><h3>候補がまだありません</h3><p style="font-size:13px">行きたい場所や思い出を登録すると、条件に合わせて提案できます。</p><button class="primary active" type="button" data-action="new-spot">＋ 行きたい場所を追加</button></div>`;
      } else {
        results = `<div class="section-head"><h2>条件に合いそうな場所</h2><span class="hint">${esc(C.describeConditions(ui.parsed) || '条件なし')}</span></div><div class="list">` +
          ui.results.slice(0, 3).map((r, i) => `<div class="card suggest">
            <span class="eyebrow">${i === 0 ? 'いちばんのおすすめ' : `候補 ${i + 1}`}${r.hours !== null ? ` · 移動の目安 約${r.hours.toFixed(1)}時間` : ''}</span>
            <h3>${esc(r.spot.icon)} ${esc(r.spot.name)}</h3>
            <ul>${r.reasons.map((x) => `<li>${esc(x)}</li>`).join('')}${r.cautions.map((x) => `<li class="caution">${esc(x)}</li>`).join('')}</ul>
            <div class="btn-row"><button type="button" class="primary active" data-action="draft-plan" data-id="${esc(r.spot.id)}">しおりの下書きを作る</button>
            ${hasKey() ? `<button type="button" class="primary active" data-action="ai-plan" data-id="${esc(r.spot.id)}">✦ AIで下書き</button>` : ''}</div></div>`).join('') +
          `</div><p class="hint">移動時間は出発地からの直線距離による目安です。営業時間・料金・空室は出かける前に公式情報で確認してください。</p>`;
      }
    }
    const upcoming = S.plans.filter((p) => p.status !== 'done').sort((a, b) => (a.startDate < b.startDate ? -1 : 1)).slice(0, 2);
    const recent = [...S.visits].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 3);
    const wishes = S.spots.filter((s) => s.wish).slice(-3).reverse();
    return `<div class="hero"><span class="eyebrow" style="color:inherit">今日のおでかけ、ここから</span><h1>行きたい気持ちが、<br>旅のはじまり。</h1><p>${S.settings.home.label ? `${esc(S.settings.home.label)}から` : '思いついたら、たびのたねに。'}</p><i class="sun" aria-hidden="true"></i><i class="hill-a" aria-hidden="true"></i><i class="hill-b" aria-hidden="true"></i>${wBadge}</div>
      <div class="field"><label for="q">どんなおでかけにする？</label>
        <div class="input-with-btn"><input id="q" type="text" value="${esc(ui.query)}" placeholder="例：雨なので午後から屋内で遊びたい" enterkeyhint="search">
        <button type="button" class="active" data-action="voice" data-target="q" aria-label="音声で入力">🎤</button></div></div>
      <div class="chips" aria-label="今日の条件">${chip('rain', '☔ 雨の日')}${chip('afternoon', '🕒 午後から')}${chip('overnight', '🧳 1泊')}${chip('kids', '🧒 子連れ')}${chip('indoor', '🏠 屋内')}</div>
      <button class="primary active" type="button" data-action="suggest">✦　条件に合う場所を見る</button>
      ${!S.settings.home.label ? '<p class="hint">⚙設定で出発地を登録すると、移動時間と天気も考えて提案します。</p>' : ''}
      ${results}
      ${upcoming.length ? `<div class="section-head"><h2>続きのしおり</h2><button class="text-link" type="button" data-screen="plans">すべて →</button></div><div class="list">${upcoming.map(planCard).join('')}</div>` : ''}
      <div class="section-head"><h2>気になる旅のたね</h2><button class="text-link" type="button" data-screen="spots">地図で見る →</button></div>
      <div class="list">${wishes.length ? wishes.map((s) => spotCard(s)).join('') : `<div class="card empty">まだありません。右上の＋や共有メニューから、行ってみたい場所を貯めましょう。<button class="outline active" type="button" data-action="new-spot">＋ 行きたい場所を追加</button></div>`}</div>
      ${recent.length ? `<div class="section-head"><h2>最近の思い出</h2><button class="text-link" type="button" data-screen="history">すべて →</button></div><div class="list">${recent.map(visitCard).join('')}</div>` : ''}`;
  }

  function spots() {
    const all = S.spots;
    const counts = { all: all.length, wish: C.filterSpots(S, 'wish').length, visited: C.filterSpots(S, 'visited').length };
    let list = C.filterSpots(S, ui.spotFilter);
    const f = (k, label) => `<button class="chip active" type="button" data-spot-filter="${k}" aria-pressed="${ui.spotFilter === k}">${label} ${counts[k]}</button>`;
    let body;
    if (ui.spotView === 'map') {
      const placed = list.filter(C.hasCoords);
      const unplaced = list.filter((s) => !C.hasCoords(s));
      body = `<div class="legend"><span><i class="dot"></i>行きたい</span><span><i class="dot visited"></i>行った</span><span><i class="dot both"></i>両方</span><span>◯ 出発地</span></div>
        <div class="map" id="spot-map" role="region" aria-label="スポットの地図"></div>
        <p class="map-note">${placed.length}件を表示中。近いスポットは数字でまとまり、拡大すると分かれます。</p>
        ${unplaced.length ? `<div class="unplaced">位置が未確認のため地図に出ていないスポット ${unplaced.length}件：${unplaced.map((s) => `<button type="button" data-action="edit-spot" data-id="${esc(s.id)}">${esc(s.name)}</button>`).join('、')}</div>` : ''}`;
    } else {
      const q = ui.spotQuery.toLowerCase();
      if (q) list = list.filter((s) => [s.name, s.address, s.memo, s.tags.join(' ')].join(' ').toLowerCase().includes(q));
      list = [...list].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
      body = `<input type="search" id="spot-q" placeholder="名前・タグ・メモで探す" value="${esc(ui.spotQuery)}" style="margin-bottom:10px">
        <div class="list">${list.length ? list.map((s) => { const n = C.visitsOf(S, s.id).length; return spotCard(s, `${C.INDOOR_LABEL[s.indoor]}${n ? ` · 訪問${n}回` : ''}${s.tags.length ? ' · ' + s.tags.join(' ') : ''}`); }).join('') : '<div class="empty">該当するスポットはありません</div>'}</div>`;
    }
    return `<div class="page-top"><span class="eyebrow">SPOT MAP ◎</span><h1>旅のスポット</h1><p>行きたい場所も、行った場所も、一枚に。</p></div>
      <div class="tabs"><button type="button" data-spot-view="map" aria-pressed="${ui.spotView === 'map'}">地図</button><button type="button" data-spot-view="list" aria-pressed="${ui.spotView === 'list'}">一覧</button></div>
      <div class="chips">${f('all', 'すべて')}${f('wish', '♡ 行きたい')}${f('visited', '✓ 行った')}</div>
      ${body}
      <button class="outline active" type="button" data-action="new-spot">＋　スポットを追加</button>`;
  }

  function planCard(p) {
    const days = C.planDays(p);
    const status = { draft: '<span class="badge ai">下書き</span>', planned: '<span class="badge">予定</span>', done: '<span class="badge">行った</span>' }[p.status];
    const packDone = p.packing.filter((x) => x.done).length;
    return `<button type="button" class="card spot-card active" data-action="open-plan" data-id="${esc(p.id)}">
      <div class="art both" aria-hidden="true">${p.nights ? '🧳' : '🎒'}</div>
      <div><div class="card-title">${esc(p.title)}</div><div class="card-meta">${status}${fmtDate(p.startDate)}${p.nights ? `〜${days}日間` : ' 日帰り'} · ${p.mode === 'transit' ? '公共交通' : '車'} · 持ち物 ${packDone}/${p.packing.length}</div></div>
      <span class="chev" aria-hidden="true">›</span></button>`;
  }

  function plans() {
    if (ui.planId && planById(ui.planId)) return planDetail(planById(ui.planId));
    ui.planId = null;
    const groups = [['draft', '下書き'], ['planned', 'これからの予定'], ['done', '行った旅']];
    const html = groups.map(([k, label]) => {
      const list = S.plans.filter((p) => p.status === k).sort((a, b) => (a.startDate < b.startDate ? (k === 'done' ? 1 : -1) : (k === 'done' ? -1 : 1)));
      return list.length ? `<div class="section-head"><h2>${label}</h2></div><div class="list">${list.map(planCard).join('')}</div>` : '';
    }).join('');
    return `<div class="page-top"><span class="eyebrow">TRIP BOOK ▤</span><h1>旅のしおり</h1><p>行程・移動と乗換・持ち物を、旅ごとに。</p></div>
      ${html || '<div class="card empty">しおりはまだありません。ホームで条件を選ぶと下書きを作れます。</div>'}
      <button class="outline active" type="button" data-action="new-plan">＋　新しいしおり</button>`;
  }

  function planDetail(p) {
    const days = C.planDays(p);
    if (ui.planDay > days) ui.planDay = 1;
    const tab = (k, label) => `<button type="button" data-plan-tab="${k}" aria-pressed="${ui.planTab === k}">${label}</button>`;
    let body = '';
    if (ui.planTab === 'stops') {
      const stops = C.sortStops(p.stops).filter((s) => s.day === ui.planDay);
      body = `${days > 1 ? `<div class="tabs">${Array.from({ length: days }, (_, i) => `<button type="button" data-plan-day="${i + 1}" aria-pressed="${ui.planDay === i + 1}">${i + 1}日目</button>`).join('')}</div>` : ''}
        <p class="hint">${fmtDate(addDays(p.startDate, ui.planDay - 1))}</p>
        <div class="timeline">${stops.length ? stops.map((s) => { const sp = s.spotId && spotById(s.spotId); return `<button type="button" class="stop active" data-action="edit-stop" data-id="${esc(s.id)}"><span class="t">${esc(s.time || '--:--')}</span><strong>${sp ? esc(sp.icon) + ' ' : ''}${esc(sp ? sp.name : s.label || '予定')}</strong>${s.durationMin ? `<p>滞在 約${s.durationMin}分</p>` : ''}${s.memo ? `<p>${esc(s.memo)}</p>` : ''}${s.rainAlt ? `<p>☔ 雨のとき：${esc(s.rainAlt)}</p>` : ''}</button>`; }).join('') : '<div class="empty">この日の予定はまだありません</div>'}</div>
        <button class="outline active" type="button" data-action="new-stop">＋ 予定を追加</button>
        ${p.reservationMemo ? `<div class="note"><b>予約メモ</b><br>${esc(p.reservationMemo).replace(/\n/g, '<br>')}</div>` : ''}`;
    } else if (ui.planTab === 'legs') {
      const mode = (m, label) => `<button type="button" data-plan-mode="${m}" aria-pressed="${p.mode === m}">${label}</button>`;
      if (p.mode === 'car') {
        body = `<div class="tabs fill">${mode('car', '🚗 車')}${mode('transit', '🚃 公共交通')}</div>
          <div class="field"><label for="car-memo">車のメモ（駐車場・休憩場所・高速など）</label><textarea id="car-memo" data-plan-field="carMemo" placeholder="例：〇〇SAで休憩、現地の駐車場は第2が近い">${esc(p.carMemo)}</textarea></div>
          <p class="hint">入力内容は自動で保存されます。</p>`;
      } else {
        const legs = C.sortLegs(p.legs, ui.legDir);
        const gaps = C.transferGaps(legs);
        body = `<div class="tabs fill">${mode('car', '🚗 車')}${mode('transit', '🚃 公共交通')}</div>
          <div class="tabs fill"><button type="button" data-leg-dir="out" aria-pressed="${ui.legDir === 'out'}">往路 ${C.sortLegs(p.legs, 'out').length}</button><button type="button" data-leg-dir="back" aria-pressed="${ui.legDir === 'back'}">復路 ${C.sortLegs(p.legs, 'back').length}</button></div>
          <div class="list">${legs.length ? legs.map((l, i) => `${i > 0 && gaps[i - 1] !== null ? `<div class="gap ${gaps[i - 1] < (legs[i - 1].transferMin || 5) ? 'bad' : ''}">↓ 乗換 ${gaps[i - 1]}分${gaps[i - 1] < (legs[i - 1].transferMin || 5) ? '（余裕が足りないかも）' : ''}</div>` : ''}
            <button type="button" class="card leg active" data-action="edit-leg" data-id="${esc(l.id)}"><span class="m" aria-hidden="true">${LEG_ICON[l.mode]}</span>
            <div><div class="card-title">${esc(l.from || '?')} → ${esc(l.to || '?')}</div><div class="card-meta">${esc(l.depart || '--:--')} 発 → ${esc(l.arrive || '--:--')} 着 · ${esc(C.MODE_LABEL[l.mode])}${l.line ? ' · ' + esc(l.line) : ''}${l.transferMin ? ` · 乗換余裕${l.transferMin}分` : ''}</div>${l.ticketMemo ? `<div class="card-meta">🎫 ${esc(l.ticketMemo)}</div>` : ''}<div class="card-meta">${l.source === 'auto' ? `自動取得 ${fmtTime(l.fetchedAt)}（要再確認）` : '手入力'}</div></div></button>`).join('') : `<div class="empty">${ui.legDir === 'out' ? '往路' : '復路'}の区間はまだありません。<br>駅・路線・時刻・切符メモを区間ごとに登録できます。</div>`}</div>
          <button class="outline active" type="button" data-action="new-leg">＋ 区間を追加</button>
          <p class="hint">乗換検索の自動取得は次の版で対応予定です。今は時刻表アプリ等で調べた内容を手入力してください。</p>`;
      }
    } else {
      const done = p.packing.filter((x) => x.done).length;
      const pct = p.packing.length ? Math.round((done / p.packing.length) * 100) : 0;
      body = `<div class="count">${done} / ${p.packing.length} 準備できた</div><div class="progress"><i style="width:${pct}%"></i></div>
        <div class="list">${p.packing.map((x) => `<div class="pack-row"><input type="checkbox" data-pack-toggle="${esc(x.id)}" ${x.done ? 'checked' : ''} aria-label="${esc(x.name)}"><span class="${x.done ? 'done' : ''}">${esc(x.name)}${x.qty > 1 ? `<small>×${x.qty}</small>` : ''}${x.assignee ? `<small>👤${esc(x.assignee)}</small>` : ''}</span><button type="button" data-action="edit-pack" data-id="${esc(x.id)}" aria-label="${esc(x.name)}を編集">✎</button></div>`).join('') || '<div class="empty">持ち物はまだありません</div>'}</div>
        <div class="input-with-btn" style="margin-top:10px"><input id="pack-new" type="text" placeholder="持ち物を追加（例：日焼け止め）" enterkeyhint="done"><button type="button" class="active" data-action="add-pack" aria-label="追加">＋</button></div>
        <div class="btn-row"><button class="outline active" type="button" data-action="pack-suggest">✦ 条件から候補</button><button class="outline active" type="button" data-action="pack-template">定番リスト</button></div>`;
    }
    const aiNote = p.ai ? `<div class="note warn"><b>✦ AIの下書き（${esc(p.ai.model)}・${fmtTime(p.ai.at)}）</b><br>内容は確定情報ではありません。${p.ai.cautions.length ? '<br>' + p.ai.cautions.map((c) => '・' + esc(c)).join('<br>') : ''}</div>` : '';
    const draftNote = p.status === 'draft' ? `<div class="note warn">下書きです。時刻は目安なので、確認してから「予定に確定」してください。<button class="outline active" type="button" data-action="confirm-plan">予定に確定する</button></div>` : '';
    return `<button class="text-link" type="button" data-action="back-plans">‹ しおり一覧</button>
      <div class="cover"><span class="eyebrow" style="color:inherit">${p.status === 'done' ? '行った旅' : p.status === 'draft' ? '下書き' : 'これからの旅'}</span><h2>${esc(p.title)}</h2>
        <p>${fmtDate(p.startDate)}${p.nights ? `〜${fmtDate(addDays(p.startDate, p.nights))}（${p.nights}泊）` : '（日帰り）'}${p.departTime ? ` ${esc(p.departTime)}出発` : ''}</p>
        <p>${esc(p.departure || '出発地未設定')}から · ${p.mode === 'transit' ? '公共交通' : '車'}${p.companions ? ' · ' + esc(p.companions) : ''}${p.budget ? ' · 予算' + yen(p.budget) : ''}</p>
        ${p.conditions ? `<p>条件：${esc(p.conditions)}</p>` : ''}
        <button class="edit active" type="button" data-action="edit-plan" aria-label="しおりの基本情報を編集">✎</button></div>
      ${aiNote}${draftNote}
      <div class="tabs fill">${tab('stops', '行程')}${tab('legs', '移動・乗換')}${tab('packing', '持ち物')}</div>
      ${body}
      <div class="section-head"><h2>旅のあと</h2></div>
      <button class="primary active" type="button" data-action="plan-to-visit">✓ 行った記録にする</button>
      <div class="btn-row"><button class="outline active" type="button" data-action="share-plan">しおりを共有</button><button class="outline danger active" type="button" data-action="delete-plan">削除</button></div>`;
  }

  function visitCard(v) {
    const s = spotById(v.spotId);
    if (!s) return '';
    return `<button type="button" class="card log-card active" data-action="edit-visit" data-id="${esc(v.id)}"><span class="log-icon" aria-hidden="true">${esc(s.icon)}</span>
      <span><strong class="card-title">${esc(s.name)}</strong><span class="card-meta" style="display:block">${fmtDate(v.date)} · ${C.WEATHER_LABEL[v.weather]}${v.rating ? ' · ' + stars(v.rating) : ''}${v.photos.length ? ` · 📷${v.photos.length}` : ''}</span>${v.impression ? `<span class="card-meta" style="display:block">${esc(v.impression.slice(0, 60))}</span>` : ''}</span>
      <span class="chev" aria-hidden="true">›</span></button>`;
  }

  function history() {
    const q = ui.hq;
    const results = C.searchVisits(S, q);
    const years = [...new Set(S.visits.map((v) => v.date.slice(0, 4)))].sort().reverse();
    const chip = (k, v, label) => `<button class="chip active" type="button" data-hq="${k}" data-hq-val="${v}" aria-pressed="${q[k] === v || (v === true && q[k] === true)}">${label}</button>`;
    let body;
    if (!S.visits.length) {
      body = '<div class="card empty">まだ記録がありません。しおりから「行った記録にする」か、＋から計画外のおでかけも記録できます。</div>';
    } else if (ui.historyView === 'list') {
      let month = '';
      body = results.map((v) => {
        const m = v.date.slice(0, 7);
        const head = m !== month ? `<div class="month">${m.replace('-', '年')}月</div>` : '';
        month = m;
        return head + visitCard(v);
      }).join('') || '<div class="empty">条件に合う記録はありません</div>';
    } else if (ui.historyView === 'table') {
      const { key, dir } = ui.tableSort;
      const rows = [...results].sort((a, b) => {
        const va = key === 'place' ? (spotById(a.spotId) || {}).name || '' : a[key] ?? -1;
        const vb = key === 'place' ? (spotById(b.spotId) || {}).name || '' : b[key] ?? -1;
        return (va < vb ? -1 : va > vb ? 1 : 0) * dir;
      });
      const th = (k, label) => `<th><button type="button" data-sort="${k}">${label}${key === k ? (dir > 0 ? ' ▲' : ' ▼') : ''}</button></th>`;
      body = `<div class="table-wrap"><table><thead><tr>${th('date', '日付')}${th('place', '場所')}<th>天気</th>${th('rating', '満足')}${th('cost', '費用')}<th>再訪</th><th>感想</th></tr></thead><tbody>
        ${rows.map((v) => { const s = spotById(v.spotId); return `<tr data-action="edit-visit" data-id="${esc(v.id)}"><td>${fmtDate(v.date)}</td><td>${esc(s.icon)} ${esc(s.name)}</td><td>${C.WEATHER_LABEL[v.weather]}</td><td>${v.rating || ''}</td><td>${yen(v.cost)}</td><td>${{ yes: '♡', maybe: '△', no: '×', '': '' }[v.revisit]}</td><td class="wrap">${esc(v.impression.slice(0, 40))}</td></tr>`; }).join('')}
        </tbody></table></div><p class="hint">${rows.length}件 · 見出しを押すと並べ替え。CSVは⚙設定から書き出せます。</p>`;
    } else {
      body = `<div class="map" id="history-map" role="region" aria-label="思い出の地図"></div><p class="map-note">検索条件に合う記録の場所を表示しています。</p>`;
    }
    return `<div class="page-top"><span class="eyebrow">MEMORIES ✧</span><h1>おでかけの思い出</h1><p>一覧・表・地図で見返せます。</p></div>
      <input type="search" id="hq" placeholder="場所・感想・同行者で検索" value="${esc(q.text)}" style="margin-top:8px">
      <div class="chips">${chip('weather', 'rain', '☔ 雨の日')}${chip('revisit', true, '♡ また行きたい')}${chip('minRating', 4, '★4以上')}
        ${years.length ? `<select id="hq-year" style="width:auto;min-height:38px;border-radius:999px;font-size:13px"><option value="">全期間</option>${years.map((y) => `<option value="${y}" ${q.year === y ? 'selected' : ''}>${y}年</option>`).join('')}</select>` : ''}</div>
      <div class="tabs"><button type="button" data-history-view="list" aria-pressed="${ui.historyView === 'list'}">一覧</button><button type="button" data-history-view="table" aria-pressed="${ui.historyView === 'table'}">表</button><button type="button" data-history-view="map" aria-pressed="${ui.historyView === 'map'}">地図</button></div>
      ${body}
      <button class="outline active" type="button" data-action="new-visit">＋　思い出を記録</button>`;
  }

  const screens = { home, spots, plans, history };

  function render() {
    const main = $('#main');
    destroyMaps(main);
    const scroll = main.scrollTop;
    main.innerHTML = screens[ui.screen]();
    $$('.nav button').forEach((b) => b.setAttribute('aria-current', b.dataset.screen === ui.screen ? 'page' : 'false'));
    const sm = $('#spot-map');
    if (sm) {
      mountSpotMap(sm, C.filterSpots(S, ui.spotFilter).filter(C.hasCoords).map((s) => {
        const st = C.spotStatus(S, s);
        const n = C.visitsOf(S, s.id).length;
        return { spot: s, kind: st === 'both' ? 'both' : st === 'visited' ? 'visited' : '', sub: `${C.STATUS_LABEL[st]}${n ? ` · 訪問${n}回` : ''}` };
      }));
    }
    const hm = $('#history-map');
    if (hm) {
      const counts = new Map();
      C.searchVisits(S, ui.hq).forEach((v) => counts.set(v.spotId, (counts.get(v.spotId) || 0) + 1));
      mountSpotMap(hm, [...counts.entries()].map(([id, n]) => ({ spot: spotById(id), n })).filter((x) => x.spot && C.hasCoords(x.spot))
        .map(({ spot, n }) => ({ spot, kind: 'visited', sub: `訪問${n}回` })));
    }
    if (ui.keepScroll) main.scrollTop = scroll;
    ui.keepScroll = false;
  }

  function go(screen) {
    ui.screen = screen;
    if (screen !== 'plans') ui.planId = null;
    render();
    $('#main').scrollTop = 0;
  }

  // ---- sheets ----------------------------------------------------------------------------

  function openSheet(kind, title, body, foot, onMount) {
    const modal = $('#modal');
    destroyMaps(modal);
    ui.sheet = { kind };
    $('#sheet-title').textContent = title;
    $('#sheet-body').innerHTML = body;
    $('#sheet-foot').innerHTML = foot || '';
    $('#sheet-foot').hidden = !foot;
    modal.hidden = false;
    $('#sheet-body').scrollTop = 0;
    if (onMount) onMount();
  }

  function closeSheet() {
    const modal = $('#modal');
    destroyMaps(modal);
    modal.hidden = true;
    ui.sheet = null;
  }

  function addMenu() {
    openSheet('add', '何を追加する？', `<div class="list">
      <button class="card spot-card active" type="button" data-action="new-spot"><div class="art wish">♡</div><div><div class="card-title">行きたい場所</div><div class="card-meta">名前・URL・音声から。位置を確認して地図に置きます</div></div><span class="chev">›</span></button>
      <button class="card spot-card active" type="button" data-action="new-plan"><div class="art both">🧳</div><div><div class="card-title">しおり（旅程）</div><div class="card-meta">日帰り・宿泊の行程、乗換、持ち物</div></div><span class="chev">›</span></button>
      <button class="card spot-card active" type="button" data-action="new-visit"><div class="art visited">✓</div><div><div class="card-title">思い出（訪問記録）</div><div class="card-meta">計画しなかったおでかけもそのまま記録</div></div><span class="chev">›</span></button></div>`);
  }

  // Spot detail
  function spotDetail(id) {
    const s = spotById(id);
    if (!s) return;
    const st = C.spotStatus(S, s);
    const visits = C.visitsOf(S, id);
    const plansRel = C.plansWithSpot(S, id);
    const geo = C.hasCoords(s) ? `${s.lat.toFixed(5)}, ${s.lon.toFixed(5)}<br><small class="hint">出典：${{ osm: 'OpenStreetMap検索', gsi: '国土地理院検索', map: '地図で指定', manual: '手入力' }[s.geoSource] || s.geoSource}${s.geoCheckedAt ? ' · ' + fmtTime(s.geoCheckedAt) : ''}</small>` : '<span class="badge warn">未確認</span>（地図に表示されません）';
    openSheet('spot', `${s.icon} ${s.name}`, `
      <div><span class="badge">${C.STATUS_LABEL[st]}</span>${s.tags.map((t) => `<span class="badge ai">${esc(t)}</span>`).join('')}</div>
      <dl class="kv"><dt>住所</dt><dd>${esc(s.address || '—')}</dd><dt>位置</dt><dd>${geo}</dd><dt>屋内外</dt><dd>${C.INDOOR_LABEL[s.indoor]}</dd><dt>所要</dt><dd>${s.durationMin ? `約${s.durationMin}分` : '—'}</dd>
      ${s.url ? `<dt>URL</dt><dd><button class="text-link" type="button" data-action="open-url" data-url="${esc(s.url)}">${esc(s.url.slice(0, 48))}${s.url.length > 48 ? '…' : ''}</button></dd>` : ''}</dl>
      ${s.memo ? `<div class="note">${esc(s.memo).replace(/\n/g, '<br>')}</div>` : ''}
      ${s.ai && s.ai.text ? `<div class="note warn"><b>✦ AIのまとめ（要確認・${fmtTime(s.ai.at)}）</b><br>${esc(s.ai.text).replace(/\n/g, '<br>')}</div>` : ''}
      <div class="section-head"><h2>訪問の記録 ${visits.length}件</h2></div>
      <div class="list">${visits.map(visitCard).join('') || '<div class="hint">まだ訪問の記録はありません</div>'}</div>
      ${plansRel.length ? `<div class="section-head"><h2>関連するしおり</h2></div><div class="list">${plansRel.map(planCard).join('')}</div>` : ''}
      <div class="btn-row"><button class="outline active" type="button" data-action="toggle-wish" data-id="${esc(id)}">${s.wish ? '♡ 行きたいから外す' : '♡ 行きたいに入れる'}</button>${C.hasCoords(s) ? `<button class="outline active" type="button" data-action="open-geo" data-id="${esc(id)}">地図アプリで開く</button>` : ''}</div>
      <button class="outline danger active" type="button" data-action="delete-spot" data-id="${esc(id)}">このスポットを削除</button>`,
    `<button class="outline active" type="button" data-action="edit-spot" data-id="${esc(id)}">編集</button><button class="outline active" type="button" data-action="visit-spot" data-id="${esc(id)}">✓ 行った</button><button class="primary active" type="button" data-action="draft-plan" data-id="${esc(id)}">しおりへ</button>`);
  }

  // Spot editor (new or edit). prefill: {name, url, memo}
  let pickState = null;
  function spotEditor(id, prefill) {
    const s = id ? spotById(id) : C.normSpot(Object.assign({ name: '' }, prefill || {}));
    if (!id && prefill && !prefill.name) s.name = '';
    pickState = { lat: s.lat, lon: s.lon, source: s.geoSource, checkedAt: s.geoCheckedAt, map: null };
    openSheet('spot-edit', id ? 'スポットを編集' : '行きたい！を追加', `
      <div class="field"><label for="sp-name">場所の名前</label><div class="input-with-btn"><input id="sp-name" type="text" value="${esc(s.name)}" placeholder="例：アドベンチャーワールド"><button type="button" class="active" data-action="voice" data-target="sp-name" aria-label="音声で入力">🎤</button></div></div>
      ${hasKey() ? `<button class="outline active" type="button" data-action="ai-spot">✦ AIで特徴を整理（下書き）</button>` : ''}
      <div class="field"><span class="label">地図の位置</span>
        <div class="input-with-btn"><input id="sp-geo-q" type="search" value="${esc(s.address || s.name)}" placeholder="名前や住所で位置を検索"><button type="button" class="active" data-action="geo-search" aria-label="位置を検索">🔍</button></div>
        <div class="candidates" id="sp-cands"></div>
        <p class="hint" id="sp-geo-status">${C.hasCoords(s) ? `位置：${s.lat.toFixed(5)}, ${s.lon.toFixed(5)}` : '候補から選ぶか、地図をタップして位置を決めてください。自動ではピンを置きません。'}</p>
        <div class="map small" id="sp-map"></div>
        <details class="box"><summary>緯度・経度を直接入力</summary><div class="row"><input id="sp-lat" type="number" step="any" placeholder="緯度" value="${s.lat ?? ''}"><input id="sp-lon" type="number" step="any" placeholder="経度" value="${s.lon ?? ''}"></div><button class="outline active" type="button" data-action="geo-manual">この座標にする</button><button class="outline danger active" type="button" data-action="geo-clear">位置をクリア</button></details>
      </div>
      <div class="field"><label for="sp-address">住所・エリア</label><input id="sp-address" type="text" value="${esc(s.address)}" placeholder="例：和歌山県白浜町"></div>
      <div class="row"><div class="field"><label for="sp-indoor">屋内／屋外</label><select id="sp-indoor">${['', 'indoor', 'outdoor', 'both'].map((k) => `<option value="${k}" ${s.indoor === k ? 'selected' : ''}>${C.INDOOR_LABEL[k]}</option>`).join('')}</select></div>
        <div class="field"><label for="sp-dur">滞在の目安（分）</label><input id="sp-dur" type="number" min="0" step="15" value="${s.durationMin ?? ''}" placeholder="120"></div></div>
      <div class="field"><label for="sp-url">URL</label><input id="sp-url" type="url" value="${esc(s.url)}" placeholder="https://"></div>
      <div class="field"><label for="sp-tags">タグ（空白区切り）</label><input id="sp-tags" type="text" value="${esc(s.tags.join(' '))}" placeholder="動物 子ども 温泉"></div>
      <div class="field"><label for="sp-memo">メモ</label><textarea id="sp-memo" placeholder="子連れの注意点、気になった理由など">${esc(s.memo)}</textarea></div>
      <div class="field"><span class="label">アイコン</span><div class="chips" id="sp-icons">${ICONS.map((ic) => `<button class="chip" type="button" data-icon="${ic}" aria-pressed="${s.icon === ic}">${ic}</button>`).join('')}</div></div>
      <label class="field" style="display:flex;gap:8px;align-items:center;font-weight:800;font-size:14px"><input id="sp-wish" type="checkbox" ${s.wish ? 'checked' : ''} style="width:22px;height:22px"> 行きたいリストに入れる</label>
      <input type="hidden" id="sp-id" value="${esc(id || '')}"><input type="hidden" id="sp-ai" value="${esc(s.ai ? JSON.stringify(s.ai) : '')}">`,
    `<button class="primary active" type="button" data-action="save-spot">保存する</button>`,
    () => {
      pickState.map = mountPickMap($('#sp-map'), s.lat, s.lon, (la, lo) => setPick(la, lo, 'map'));
    });
  }

  function setPick(lat, lon, source) {
    pickState.lat = lat;
    pickState.lon = lon;
    pickState.source = source;
    pickState.checkedAt = C.nowIso();
    const st = $('#sp-geo-status') || $('#set-geo-status');
    if (st) st.textContent = lat === null ? '位置は未設定です' : `位置：${lat.toFixed(5)}, ${lon.toFixed(5)}（${{ osm: 'OpenStreetMap検索', gsi: '国土地理院検索', map: '地図で指定', manual: '手入力' }[source]}）`;
    if (lat !== null && pickState.map) pickState.map.setPin(lat, lon);
    const la = $('#sp-lat') || $('#set-lat'), lo = $('#sp-lon') || $('#set-lon');
    if (la) la.value = lat ?? '';
    if (lo) lo.value = lon ?? '';
  }

  async function runGeoSearch(inputId, candsId) {
    const q = val(inputId);
    const box = $('#' + candsId);
    if (!q) { toast('検索する名前や住所を入れてください'); return; }
    box.innerHTML = '<div class="hint">検索中…</div>';
    const cands = await geocode(q);
    if (!cands.length) { box.innerHTML = '<div class="hint">候補が見つかりませんでした。住所で検索するか、地図をタップして指定してください。</div>'; return; }
    ui.geoCands = cands;
    box.innerHTML = `<div class="hint">候補が${cands.length}件あります。正しい場所を選んでください。</div>` + cands.map((c, i) => `<button type="button" data-geo-pick="${i}">${esc(c.name)}<small>${esc(c.address)} · ${c.source === 'gsi' ? '国土地理院' : 'OpenStreetMap'}</small></button>`).join('');
  }

  function saveSpot() {
    const id = val('sp-id');
    const name = val('sp-name');
    if (!name) { toast('場所の名前を入れてください'); return; }
    const icon = ($('#sp-icons [aria-pressed="true"]') || {}).dataset?.icon || '📍';
    let ai = null;
    try { ai = val('sp-ai') ? JSON.parse(val('sp-ai')) : null; } catch (e) { ai = null; }
    const base = id ? spotById(id) : {};
    const s = C.normSpot(Object.assign({}, base, {
      name, icon, address: val('sp-address'), url: val('sp-url'), indoor: val('sp-indoor'), durationMin: val('sp-dur'),
      tags: val('sp-tags').split(/[\s,、]+/).filter(Boolean), memo: $('#sp-memo').value, wish: checked('sp-wish'),
      lat: pickState.lat, lon: pickState.lon, geoSource: pickState.source, geoCheckedAt: pickState.checkedAt, ai, updatedAt: C.nowIso(),
    }));
    if (id) S.spots = S.spots.map((x) => (x.id === id ? s : x));
    else S.spots.push(s);
    persist();
    closeSheet();
    render();
    toast(C.hasCoords(s) ? '保存しました' : '保存しました（位置未確認のため地図には出ません）');
    if (ui.afterSpotSave) { const f = ui.afterSpotSave; ui.afterSpotSave = null; f(s); }
  }

  async function aiSpot() {
    const text = [val('sp-name'), val('sp-url'), $('#sp-memo').value].filter(Boolean).join('\n');
    if (!text) { toast('名前かURLを入れてください'); return; }
    toast('AIに問い合わせ中…');
    try {
      const { json, model } = await gemini(C.geminiSpotPrompt(text));
      if (json.name && !val('sp-name')) $('#sp-name').value = json.name;
      if (json.area && !val('sp-address')) $('#sp-address').value = json.area;
      if (json.indoor && !val('sp-indoor')) $('#sp-indoor').value = json.indoor;
      if (json.durationMin && !val('sp-dur')) $('#sp-dur').value = json.durationMin;
      if (Array.isArray(json.tags) && !val('sp-tags')) $('#sp-tags').value = json.tags.join(' ');
      if (json.area && !val('sp-geo-q')) $('#sp-geo-q').value = `${json.name || ''} ${json.area}`.trim();
      const note = [json.summary, json.kidsNote && `子連れ：${json.kidsNote}`].filter(Boolean).join('\n');
      $('#sp-ai').value = JSON.stringify({ text: note, model, at: C.nowIso() });
      toast('AIの下書きを入れました。内容を確認して位置を選んでください');
    } catch (e) {
      toast('AIエラー：' + e.message);
    }
  }

  // Plan editor
  function planEditor(id) {
    const p = id ? planById(id) : C.normPlan({ departure: S.settings.home.label, companions: S.settings.companions, mode: S.settings.defaultMode });
    openSheet('plan-edit', id ? 'しおりの基本情報' : '新しいしおり', `
      <div class="field"><label for="pl-title">タイトル</label><input id="pl-title" type="text" value="${id ? esc(p.title) : ''}" placeholder="例：白浜でパンダに会う旅"></div>
      <div class="row"><div class="field"><label for="pl-date">出発日</label><input id="pl-date" type="date" value="${esc(p.startDate)}"></div>
        <div class="field"><label for="pl-nights">泊数（0=日帰り）</label><input id="pl-nights" type="number" min="0" max="14" value="${p.nights}"></div></div>
      <div class="row"><div class="field"><label for="pl-dep">出発地</label><input id="pl-dep" type="text" value="${esc(p.departure)}" placeholder="例：自宅"></div>
        <div class="field"><label for="pl-time">出発時刻</label><input id="pl-time" type="time" value="${esc(p.departTime)}"></div></div>
      <div class="row"><div class="field"><label for="pl-mode">交通手段</label><select id="pl-mode"><option value="car" ${p.mode === 'car' ? 'selected' : ''}>車</option><option value="transit" ${p.mode === 'transit' ? 'selected' : ''}>公共交通</option></select></div>
        <div class="field"><label for="pl-budget">予算（円）</label><input id="pl-budget" type="number" min="0" step="1000" value="${p.budget ?? ''}"></div></div>
      <div class="field"><label for="pl-comp">同行者</label><input id="pl-comp" type="text" value="${esc(p.companions)}" placeholder="例：家族4人（子ども5歳・8歳）"></div>
      <div class="field"><label for="pl-cond">条件メモ</label><input id="pl-cond" type="text" value="${esc(p.conditions)}" placeholder="例：雨・午後から"></div>
      <div class="field"><label for="pl-res">予約メモ</label><textarea id="pl-res" placeholder="宿・チケットの予約番号、確認した日時など">${esc(p.reservationMemo)}</textarea></div>
      <input type="hidden" id="pl-id" value="${esc(id || '')}">`,
    `<button class="primary active" type="button" data-action="save-plan">保存する</button>`);
  }

  function savePlan() {
    const id = val('pl-id');
    const base = id ? planById(id) : { status: 'planned' };
    const p = C.normPlan(Object.assign({}, base, {
      title: val('pl-title'), startDate: val('pl-date'), nights: val('pl-nights'), departure: val('pl-dep'), departTime: val('pl-time'),
      mode: val('pl-mode'), budget: val('pl-budget'), companions: val('pl-comp'), conditions: val('pl-cond'), reservationMemo: $('#pl-res').value, updatedAt: C.nowIso(),
    }));
    if (id) S.plans = S.plans.map((x) => (x.id === id ? p : x));
    else S.plans.push(p);
    persist();
    closeSheet();
    openPlan(p.id);
  }

  function openPlan(id) {
    ui.planId = id;
    ui.planTab = 'stops';
    ui.planDay = 1;
    ui.screen = 'plans';
    render();
    $('#main').scrollTop = 0;
  }

  function stopEditor(id) {
    const p = planById(ui.planId);
    const st = id ? p.stops.find((s) => s.id === id) : C.normStop({ day: ui.planDay });
    const days = Math.max(C.planDays(p), st.day);
    openSheet('stop-edit', id ? '予定を編集' : '予定を追加', `
      <div class="row"><div class="field"><label for="st-day">日</label><select id="st-day">${Array.from({ length: days + 1 }, (_, i) => `<option value="${i + 1}" ${st.day === i + 1 ? 'selected' : ''}>${i + 1}日目</option>`).join('')}</select></div>
        <div class="field"><label for="st-time">時刻</label><input id="st-time" type="time" value="${esc(st.time)}"></div></div>
      <div class="field"><label for="st-spot">登録済みスポット</label><select id="st-spot"><option value="">（スポットを使わない）</option>${S.spots.map((s) => `<option value="${esc(s.id)}" ${st.spotId === s.id ? 'selected' : ''}>${esc(s.icon)} ${esc(s.name)}</option>`).join('')}</select></div>
      <div class="field"><label for="st-label">内容（スポット以外の予定）</label><input id="st-label" type="text" value="${esc(st.label)}" placeholder="例：昼食、休憩、チェックイン"></div>
      <div class="field"><label for="st-dur">滞在（分）</label><input id="st-dur" type="number" min="0" step="15" value="${st.durationMin ?? ''}"></div>
      <div class="field"><label for="st-rain">雨のときの代わり</label><input id="st-rain" type="text" value="${esc(st.rainAlt)}" placeholder="例：屋内の水族館へ"></div>
      <div class="field"><label for="st-memo">メモ（予約・営業時間の確認など）</label><textarea id="st-memo">${esc(st.memo)}</textarea></div>
      <input type="hidden" id="st-id" value="${esc(id || '')}">`,
    `${id ? '<button class="outline danger active" type="button" data-action="delete-stop">削除</button>' : ''}<button class="primary active" type="button" data-action="save-stop">保存する</button>`);
  }

  function saveStop() {
    const p = planById(ui.planId);
    const id = val('st-id');
    const spotId = val('st-spot') || null;
    if (!spotId && !val('st-label')) { toast('スポットか内容を入れてください'); return; }
    const st = C.normStop({ id: id || undefined, day: val('st-day'), time: val('st-time'), spotId, label: val('st-label'), durationMin: val('st-dur'), rainAlt: val('st-rain'), memo: $('#st-memo').value });
    if (id) p.stops = p.stops.map((x) => (x.id === id ? st : x));
    else p.stops.push(st);
    p.updatedAt = C.nowIso();
    ui.planDay = st.day;
    persist();
    closeSheet();
    ui.keepScroll = true;
    render();
  }

  function legEditor(id) {
    const p = planById(ui.planId);
    const l = id ? p.legs.find((x) => x.id === id) : C.normLeg({ dir: ui.legDir });
    if (!id) {
      // Continue from the previous leg's arrival station.
      const prev = C.sortLegs(p.legs, ui.legDir).slice(-1)[0];
      if (prev) l.from = prev.to;
    }
    openSheet('leg-edit', id ? '区間を編集' : '区間を追加', `
      <div class="row"><div class="field"><label for="lg-dir">往路／復路</label><select id="lg-dir"><option value="out" ${l.dir === 'out' ? 'selected' : ''}>往路</option><option value="back" ${l.dir === 'back' ? 'selected' : ''}>復路</option></select></div>
        <div class="field"><label for="lg-mode">手段</label><select id="lg-mode">${C.LEG_MODES.filter((m) => m !== 'car').map((m) => `<option value="${m}" ${l.mode === m ? 'selected' : ''}>${LEG_ICON[m]} ${C.MODE_LABEL[m]}</option>`).join('')}</select></div></div>
      <div class="row"><div class="field"><label for="lg-from">出発駅・停留所</label><input id="lg-from" type="text" value="${esc(l.from)}" placeholder="大阪"></div>
        <div class="field"><label for="lg-to">到着駅・停留所</label><input id="lg-to" type="text" value="${esc(l.to)}" placeholder="白浜"></div></div>
      <div class="field"><label for="lg-line">路線・便名</label><input id="lg-line" type="text" value="${esc(l.line)}" placeholder="例：特急くろしお5号 3号車"></div>
      <div class="row"><div class="field"><label for="lg-dep">出発時刻</label><input id="lg-dep" type="time" value="${esc(l.depart)}"></div>
        <div class="field"><label for="lg-arr">到着時刻</label><input id="lg-arr" type="time" value="${esc(l.arrive)}"></div></div>
      <div class="field"><label for="lg-tr">次の乗換に必要な余裕（分）</label><input id="lg-tr" type="number" min="0" step="1" value="${l.transferMin ?? ''}" placeholder="例：10"></div>
      <div class="field"><label for="lg-ticket">切符・予約メモ</label><textarea id="lg-ticket" placeholder="例：e5489で予約済み、指定席">${esc(l.ticketMemo)}</textarea></div>
      <input type="hidden" id="lg-id" value="${esc(id || '')}">`,
    `${id ? '<button class="outline danger active" type="button" data-action="delete-leg">削除</button>' : ''}<button class="primary active" type="button" data-action="save-leg">保存する</button>`);
  }

  function saveLeg() {
    const p = planById(ui.planId);
    const id = val('lg-id');
    if (!val('lg-from') && !val('lg-to')) { toast('出発か到着を入れてください'); return; }
    const l = C.normLeg({ id: id || undefined, dir: val('lg-dir'), mode: val('lg-mode'), from: val('lg-from'), to: val('lg-to'), line: val('lg-line'), depart: val('lg-dep'), arrive: val('lg-arr'), transferMin: val('lg-tr'), ticketMemo: $('#lg-ticket').value, source: 'manual' });
    if (id) p.legs = p.legs.map((x) => (x.id === id ? l : x));
    else p.legs.push(l);
    ui.legDir = l.dir;
    persist();
    closeSheet();
    ui.keepScroll = true;
    render();
  }

  function packEditor(id) {
    const p = planById(ui.planId);
    const x = p.packing.find((i) => i.id === id);
    openSheet('pack-edit', '持ち物を編集', `
      <div class="field"><label for="pk-name">品名</label><input id="pk-name" type="text" value="${esc(x.name)}"></div>
      <div class="row"><div class="field"><label for="pk-qty">数量</label><input id="pk-qty" type="number" min="1" value="${x.qty}"></div>
        <div class="field"><label for="pk-who">担当</label><input id="pk-who" type="text" value="${esc(x.assignee)}" placeholder="例：パパ"></div></div>
      <input type="hidden" id="pk-id" value="${esc(id)}">`,
    `<button class="outline danger active" type="button" data-action="delete-pack">削除</button><button class="primary active" type="button" data-action="save-pack">保存する</button>`);
  }

  function packTemplates() {
    const p = planById(ui.planId);
    openSheet('pack-tpl', '定番リスト', `
      <p class="hint">よく使う持ち物を保存して、次の旅に追加できます。</p>
      <div class="list">${S.packTemplates.map((t) => `<div class="card"><div class="card-title">${esc(t.name)}</div><div class="card-meta">${t.items.map((i) => esc(i.name)).join('、')}</div>
        <div class="btn-row"><button class="outline active" type="button" data-action="apply-template" data-id="${esc(t.id)}">このしおりに追加</button><button class="outline danger active" type="button" data-action="delete-template" data-id="${esc(t.id)}">削除</button></div></div>`).join('') || '<div class="empty">まだ定番リストはありません</div>'}</div>
      <div class="field"><label for="tpl-name">今の持ち物（${p.packing.length}件）を定番として保存</label><input id="tpl-name" type="text" placeholder="例：日帰りの基本"></div>
      <button class="outline active" type="button" data-action="save-template" ${p.packing.length ? '' : 'disabled'}>定番として保存</button>`);
  }

  function planToVisitSheet() {
    const p = planById(ui.planId);
    const ids = [...new Set(p.stops.map((s) => s.spotId).filter((id) => id && spotById(id)))];
    openSheet('plan-visit', '行った記録にする', `
      <p class="hint">実際に行った場所にチェックを入れてください。訪問ごとに写真や感想をあとから追加できます。</p>
      <div class="field"><label for="pv-date">行った日</label><input id="pv-date" type="date" value="${esc(p.startDate)}"></div>
      <div class="field"><span class="label">天気</span><div class="chips">${['sunny', 'cloudy', 'rain', 'snow'].map((w) => `<button class="chip" type="button" data-pick-weather="${w}" aria-pressed="false">${C.WEATHER_LABEL[w]}</button>`).join('')}</div></div>
      <div class="list">${ids.map((id) => { const s = spotById(id); return `<label class="pack-row"><input type="checkbox" class="pv-spot" value="${esc(id)}" checked><span>${esc(s.icon)} ${esc(s.name)}</span><span></span></label>`; }).join('') || '<div class="empty">しおりにスポットが入っていません。行程の予定に登録済みスポットを選ぶか、＋から思い出を直接記録してください。</div>'}</div>`,
    ids.length ? '<button class="primary active" type="button" data-action="save-plan-visit">記録する</button>' : '');
  }

  // Visit editor
  let visitDraft = null;
  function visitEditor(id, spotId) {
    const v = id ? S.visits.find((x) => x.id === id) : C.normVisit({ spotId: spotId || '', companions: S.settings.companions });
    visitDraft = { photos: [...v.photos], removed: [], weather: v.weather, rating: v.rating };
    const spotOpts = S.spots.map((s) => `<option value="${esc(s.id)}" ${v.spotId === s.id ? 'selected' : ''}>${esc(s.icon)} ${esc(s.name)}</option>`).join('');
    openSheet('visit-edit', id ? '思い出を編集' : '思い出を記録', `
      <div class="field"><label for="vi-spot">行った場所</label><select id="vi-spot"><option value="__new" ${!v.spotId ? 'selected' : ''}>＋ 新しい場所を入力</option>${spotOpts}</select>
        <input id="vi-newspot" type="text" placeholder="場所の名前（あとで位置を確認できます）" style="margin-top:6px" ${v.spotId ? 'hidden' : ''}></div>
      <div class="field"><label for="vi-date">日付</label><input id="vi-date" type="date" value="${esc(v.date)}"></div>
      <div class="field"><span class="label">天気</span><div class="chips">${['sunny', 'cloudy', 'rain', 'snow'].map((w) => `<button class="chip" type="button" data-pick-weather="${w}" aria-pressed="${v.weather === w}">${C.WEATHER_LABEL[w]}</button>`).join('')}</div></div>
      <div class="field"><span class="label">満足度</span><div class="stars" id="vi-stars">${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-star="${n}" class="${v.rating >= n ? 'on' : ''}" aria-label="${n}">★</button>`).join('')}</div></div>
      <div class="row"><div class="field"><label for="vi-cost">費用（円）</label><input id="vi-cost" type="number" min="0" step="100" value="${v.cost ?? ''}"></div>
        <div class="field"><label for="vi-revisit">また行きたい？</label><select id="vi-revisit">${[['', '—'], ['yes', '♡ また行きたい'], ['maybe', '△ たぶん'], ['no', '× もういい']].map(([k, l]) => `<option value="${k}" ${v.revisit === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
      <div class="field"><label for="vi-comp">同行者</label><input id="vi-comp" type="text" value="${esc(v.companions)}"></div>
      <div class="field"><label for="vi-imp">感想</label><textarea id="vi-imp" placeholder="雨でも楽しめた？ 子どもの反応は？">${esc(v.impression)}</textarea></div>
      <div class="field"><span class="label">写真</span><div class="photos" id="vi-photos"></div>
        ${N.photosAvailable ? '<button class="outline active" type="button" data-action="add-photos">📷 写真を追加</button>' : '<p class="hint">写真の追加はAndroidアプリで使えます。</p>'}</div>
      <input type="hidden" id="vi-id" value="${esc(id || '')}">`,
    `${id ? '<button class="outline danger active" type="button" data-action="delete-visit">削除</button>' : ''}<button class="primary active" type="button" data-action="save-visit">保存する</button>`,
    renderVisitPhotos);
  }

  function renderVisitPhotos() {
    const box = $('#vi-photos');
    if (!box) return;
    box.innerHTML = visitDraft.photos.map((n) => `<div><img src="${esc(N.photoUrl(n))}" alt="写真"><button type="button" data-remove-photo="${esc(n)}" aria-label="写真を外す">×</button></div>`).join('');
  }

  function saveVisit() {
    const id = val('vi-id');
    let spotId = val('vi-spot');
    if (spotId === '__new') {
      const name = val('vi-newspot');
      if (!name) { toast('行った場所の名前を入れてください'); return; }
      const s = C.normSpot({ name, wish: false, icon: '📍' });
      S.spots.push(s);
      spotId = s.id;
    }
    const base = id ? S.visits.find((x) => x.id === id) : {};
    const v = C.normVisit(Object.assign({}, base, {
      spotId, date: val('vi-date'), weather: visitDraft.weather, rating: visitDraft.rating, cost: val('vi-cost'), revisit: val('vi-revisit'),
      companions: val('vi-comp'), impression: $('#vi-imp').value, photos: visitDraft.photos,
    }));
    if (id) S.visits = S.visits.map((x) => (x.id === id ? v : x));
    else S.visits.push(v);
    visitDraft.removed.forEach((n) => N.deletePhoto(n));
    persist();
    closeSheet();
    render();
    const s = spotById(spotId);
    toast(s && !C.hasCoords(s) ? '記録しました。スポットの位置を確認すると地図に出ます' : '記録しました');
  }

  // Settings
  function settingsSheet() {
    const st = S.settings;
    pickState = { lat: st.home.lat, lon: st.home.lon, source: 'manual', map: null };
    openSheet('settings', '設定', `
      <div class="section-head" style="margin-top:6px"><h2>出発地と好み</h2></div>
      <div class="field"><label for="set-home">主な出発地の名前</label><input id="set-home" type="text" value="${esc(st.home.label)}" placeholder="例：自宅（大阪市）"></div>
      <div class="input-with-btn" style="margin-top:8px"><input id="set-geo-q" type="search" placeholder="出発地の位置を検索（市区町村・駅名など）" value="${esc(st.home.label)}"><button type="button" class="active" data-action="set-geo-search" aria-label="検索">🔍</button></div>
      <div class="candidates" id="set-cands"></div>
      <p class="hint" id="set-geo-status">${st.home.lat !== null ? `位置：${st.home.lat.toFixed(4)}, ${st.home.lon.toFixed(4)}` : '位置は未設定です（移動時間と天気に使います）'}</p>
      <div class="row" hidden><input id="set-lat" type="number" step="any" value="${st.home.lat ?? ''}"><input id="set-lon" type="number" step="any" value="${st.home.lon ?? ''}"></div>
      <div class="row"><div class="field"><label for="set-mode">ふだんの交通手段</label><select id="set-mode"><option value="car" ${st.defaultMode === 'car' ? 'selected' : ''}>車</option><option value="transit" ${st.defaultMode === 'transit' ? 'selected' : ''}>公共交通</option></select></div>
        <div class="field"><label for="set-pref">提案の好み</label><select id="set-pref"><option value="balanced" ${st.preference === 'balanced' ? 'selected' : ''}>バランス</option><option value="new" ${st.preference === 'new' ? 'selected' : ''}>新しい場所を優先</option><option value="revisit" ${st.preference === 'revisit' ? 'selected' : ''}>また行きたい場所を優先</option></select></div></div>
      <div class="field"><label for="set-comp">いつもの同行者</label><input id="set-comp" type="text" value="${esc(st.companions)}" placeholder="例：家族4人（子ども5歳・8歳）"></div>
      <div class="field"><label for="set-tiles">地図</label><select id="set-tiles"><option value="gsi" ${st.tiles === 'gsi' ? 'selected' : ''}>国土地理院 地理院タイル</option><option value="osm" ${st.tiles === 'osm' ? 'selected' : ''}>OpenStreetMap</option></select></div>

      <div class="section-head"><h2>Gemini（任意）</h2></div>
      <p class="hint">自分のAPIキーを入れると、スポットの整理と旅程の下書きにGeminiを使えます。キーはこの端末の中だけに保存され、書き出すバックアップには含まれません。AIの内容は下書きで、営業時間・料金・空室は確定情報ではありません。</p>
      <div class="field"><label for="set-key">APIキー</label><input id="set-key" type="password" autocomplete="off" value="${esc(st.geminiKey)}" placeholder="未設定"></div>
      <div class="field"><label for="set-model">モデル名</label><input id="set-model" type="text" value="${esc(st.geminiModel)}"></div>
      <button class="text-link" type="button" data-action="open-url" data-url="https://aistudio.google.com/apikey">APIキーの取得（Google AI Studio）→</button>

      <div class="section-head"><h2>データ</h2></div>
      <p class="hint">データはこの端末内に保存されています（スポット${S.spots.length}・しおり${S.plans.length}・思い出${S.visits.length}）。機種変更の前にバックアップを書き出してください。写真ファイルはバックアップJSONに含まれません。</p>
      <button class="outline active" type="button" data-action="export-json">バックアップを書き出す（JSON）</button>
      <div class="btn-row"><button class="outline active" type="button" data-action="export-visits">思い出をCSV</button><button class="outline active" type="button" data-action="export-spots">スポットをCSV</button></div>
      <button class="outline active" type="button" data-action="import-json">バックアップから復元</button>

      <div class="section-head"><h2>アップデート</h2></div>
      <div class="row"><div class="field"><label for="set-channel">配信チャネル</label><select id="set-channel"><option value="stable" ${st.updateChannel === 'stable' ? 'selected' : ''}>安定版</option><option value="beta" ${st.updateChannel === 'beta' ? 'selected' : ''}>ベータ版も含む</option></select></div>
        <div class="field"><span class="label">&nbsp;</span><button class="outline active" type="button" data-action="check-update" style="margin-top:0">新しい版を確認</button></div></div>
      <p class="hint" id="update-status">いまの版：${esc(app.versionName)}（${esc(app.package)}）</p>

      <div class="section-head"><h2>このアプリについて</h2></div>
      <p class="hint">たびのたね — Theta.Travel.Hatch<br>地図：国土地理院 地理院タイル / © OpenStreetMap contributors。位置検索：Nominatim（OpenStreetMap）・国土地理院 住所検索。天気：Open-Meteo.com（CC BY 4.0）。<br>Leaflet（BSD-2-Clause）、Leaflet.markercluster（MIT）を使用しています。<br>通信するのは地図・位置検索・天気・Gemini（設定時）・更新確認のときだけです。登録内容を開発者に送信することはありません。</p>
      <button class="text-link" type="button" data-action="open-url" data-url="https://github.com/${REPO}">GitHub リポジトリ →</button>`,
    `<button class="primary active" type="button" data-action="save-settings">保存する</button>`);
  }

  function saveSettings() {
    const st = S.settings;
    st.home = { label: val('set-home'), lat: pickState.lat, lon: pickState.lon };
    st.defaultMode = val('set-mode');
    st.preference = val('set-pref');
    st.companions = val('set-comp');
    st.tiles = val('set-tiles');
    st.geminiKey = val('set-key');
    st.geminiModel = val('set-model') || 'gemini-flash-latest';
    st.updateChannel = val('set-channel');
    S.weather = null;
    persist();
    closeSheet();
    render();
    refreshWeather(true);
    toast('設定を保存しました');
  }

  async function checkUpdate() {
    const el = $('#update-status');
    el.textContent = '確認中…';
    try {
      const list = await N.getJson(`https://api.github.com/repos/${REPO}/releases?per_page=15`, { Accept: 'application/vnd.github+json' });
      const beta = val('set-channel') === 'beta';
      const latest = list.filter((r) => !r.draft && (beta || !r.prerelease)).sort((a, b) => C.compareVersions(b.tag_name, a.tag_name))[0];
      if (!latest) { el.textContent = '公開されている版が見つかりません'; return; }
      if (C.compareVersions(latest.tag_name, app.versionName) > 0) {
        el.innerHTML = `新しい版 ${esc(latest.tag_name)} があります。<button class="text-link" type="button" data-action="open-url" data-url="${esc(latest.html_url)}">ダウンロードページを開く →</button>`;
      } else {
        el.textContent = `最新です（${app.versionName}）`;
      }
    } catch (e) {
      el.textContent = '確認できませんでした：' + e.message;
    }
  }

  // ---- actions ---------------------------------------------------------------------------

  function runSuggest() {
    ui.query = val('q');
    const parsed = C.parseConditions(ui.query, S.spots);
    // Chips and free text combine: a chip or a phrase can switch a condition on.
    ['rain', 'afternoon', 'overnight', 'kids', 'indoor'].forEach((k) => { if (parsed[k]) ui.cond[k] = true; });
    Object.assign(parsed, { rain: ui.cond.rain, afternoon: ui.cond.afternoon, overnight: ui.cond.overnight, kids: ui.cond.kids, indoor: ui.cond.indoor });
    if (parsed.overnight && !parsed.nights) parsed.nights = 1;
    ui.parsed = parsed;
    ui.results = C.suggest(S, parsed, new Date());
    render();
    setTimeout(() => { const el = $('.suggest'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 50);
  }

  function currentCond() {
    return ui.parsed || Object.assign(C.parseConditions('', []), ui.cond, { nights: ui.cond.overnight ? 1 : null });
  }

  function createDraftPlan(spotId) {
    const spot = spotById(spotId);
    const plan = C.buildPlanDraft(S, spot, currentCond(), new Date());
    S.plans.push(plan);
    persist();
    closeSheet();
    openPlan(plan.id);
    toast('しおりの下書きを作りました。時刻や内容は自由に直せます');
  }

  async function createAiPlan(spotId) {
    if (ui.busy) return;
    const spot = spotById(spotId);
    ui.busy = true;
    toast('AIが下書きを作っています…');
    try {
      const cond = currentCond();
      const { json, model } = await gemini(C.geminiPlanPrompt(S, spot, cond, ui.query));
      const plan = C.planFromGemini(S, spot, cond, json, model);
      if (!plan.stops.some((s) => s.spotId === spot.id)) plan.stops.push(C.normStop({ day: 1, time: '', spotId: spot.id, memo: '目的地' }));
      S.plans.push(plan);
      persist();
      openPlan(plan.id);
      toast('AIの下書きを作りました。要確認の項目を見てください');
    } catch (e) {
      toast('AIエラー：' + e.message + '（テンプレートの下書きは使えます）');
    } finally {
      ui.busy = false;
    }
  }

  function planShareText(p) {
    const lines = [`【${p.title}】`, `${fmtDate(p.startDate)}${p.nights ? ` ${p.nights}泊` : ' 日帰り'} / ${p.departure || ''}から / ${p.mode === 'transit' ? '公共交通' : '車'}`];
    for (let d = 1; d <= C.planDays(p); d++) {
      lines.push('', `■ ${d}日目`);
      C.sortStops(p.stops).filter((s) => s.day === d).forEach((s) => { const sp = s.spotId && spotById(s.spotId); lines.push(`${s.time || '--:--'} ${sp ? sp.name : s.label}${s.memo ? `（${s.memo}）` : ''}`); });
    }
    if (p.mode === 'transit' && p.legs.length) {
      ['out', 'back'].forEach((dir) => {
        const legs = C.sortLegs(p.legs, dir);
        if (!legs.length) return;
        lines.push('', dir === 'out' ? '■ 往路' : '■ 復路');
        legs.forEach((l) => lines.push(`${l.depart || '--:--'} ${l.from} → ${l.arrive || '--:--'} ${l.to} ${l.line}${l.ticketMemo ? ` / ${l.ticketMemo}` : ''}`));
      });
    }
    if (p.packing.length) lines.push('', '■ 持ち物', p.packing.map((x) => `${x.done ? '☑' : '☐'} ${x.name}${x.qty > 1 ? ' ×' + x.qty : ''}`).join('\n'));
    lines.push('', '— たびのたね');
    return lines.join('\n');
  }

  async function voiceInto(targetId) {
    if (!N.voiceAvailable) { toast('音声入力はAndroidアプリで使えます'); return; }
    try {
      const text = await N.startVoice();
      if (!text) return;
      const el = document.getElementById(targetId);
      if (el) {
        el.value = el.value ? `${el.value} ${text}` : text;
        if (targetId === 'q') ui.query = el.value;
      }
    } catch (e) {
      toast(e.message);
    }
  }

  function handleShared(text) {
    if (!text) return;
    const urlMatch = text.match(/https?:\/\/\S+/);
    const url = urlMatch ? urlMatch[0] : '';
    const rest = text.replace(url, '').trim();
    const name = rest.split('\n')[0].slice(0, 60);
    closeSheet();
    spotEditor(null, { name, url, memo: rest.includes('\n') ? rest : '' });
    toast('共有された内容から追加します。位置を確認して保存してください');
  }

  const actions = {
    'settings': () => settingsSheet(),
    'add-menu': () => addMenu(),
    'close': () => closeSheet(),
    'suggest': () => runSuggest(),
    'voice': (el) => voiceInto(el.dataset.target),
    'new-spot': () => spotEditor(null),
    'open-spot': (el) => spotDetail(el.dataset.id),
    'edit-spot': (el) => spotEditor(el.dataset.id),
    'save-spot': () => saveSpot(),
    'ai-spot': () => aiSpot(),
    'geo-search': () => runGeoSearch('sp-geo-q', 'sp-cands'),
    'set-geo-search': () => runGeoSearch('set-geo-q', 'set-cands'),
    'geo-manual': () => {
      const la = Number(val('sp-lat')), lo = Number(val('sp-lon'));
      if (!val('sp-lat') || !val('sp-lon') || !Number.isFinite(la) || !Number.isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) { toast('緯度・経度を正しく入れてください'); return; }
      setPick(la, lo, 'manual');
    },
    'geo-clear': () => { pickState.lat = null; pickState.lon = null; pickState.source = ''; $('#sp-geo-status').textContent = '位置は未設定です（地図には出ません）'; $('#sp-lat').value = ''; $('#sp-lon').value = ''; },
    'toggle-wish': (el) => { const s = spotById(el.dataset.id); s.wish = !s.wish; s.updatedAt = C.nowIso(); persist(); render(); spotDetail(s.id); },
    'open-geo': (el) => { const s = spotById(el.dataset.id); N.openUrl(`geo:${s.lat},${s.lon}?q=${s.lat},${s.lon}(${encodeURIComponent(s.name)})`); },
    'open-url': (el) => N.openUrl(el.dataset.url),
    'delete-spot': (el) => {
      const s = spotById(el.dataset.id);
      const n = C.visitsOf(S, s.id).length;
      if (!confirm(`「${s.name}」を削除しますか？${n ? `\n訪問の記録${n}件も削除されます。` : ''}`)) return;
      C.deleteSpot(S, s.id).forEach((v) => v.photos.forEach((p) => N.deletePhoto(p)));
      persist(); closeSheet(); render(); toast('削除しました');
    },
    'visit-spot': (el) => visitEditor(null, el.dataset.id),
    'draft-plan': (el) => createDraftPlan(el.dataset.id),
    'ai-plan': (el) => createAiPlan(el.dataset.id),
    'new-plan': () => planEditor(null),
    'open-plan': (el) => { closeSheet(); openPlan(el.dataset.id); },
    'edit-plan': () => planEditor(ui.planId),
    'save-plan': () => savePlan(),
    'back-plans': () => { ui.planId = null; render(); },
    'confirm-plan': () => { planById(ui.planId).status = 'planned'; persist(); render(); toast('予定に確定しました'); },
    'delete-plan': () => { const p = planById(ui.planId); if (!confirm(`「${p.title}」を削除しますか？`)) return; S.plans = S.plans.filter((x) => x.id !== p.id); ui.planId = null; persist(); render(); toast('削除しました'); },
    'share-plan': () => N.shareText(planShareText(planById(ui.planId))),
    'new-stop': () => stopEditor(null),
    'edit-stop': (el) => stopEditor(el.dataset.id),
    'save-stop': () => saveStop(),
    'delete-stop': () => { const p = planById(ui.planId); p.stops = p.stops.filter((s) => s.id !== val('st-id')); persist(); closeSheet(); ui.keepScroll = true; render(); },
    'new-leg': () => legEditor(null),
    'edit-leg': (el) => legEditor(el.dataset.id),
    'save-leg': () => saveLeg(),
    'delete-leg': () => { const p = planById(ui.planId); p.legs = p.legs.filter((l) => l.id !== val('lg-id')); persist(); closeSheet(); ui.keepScroll = true; render(); },
    'add-pack': () => {
      const name = val('pack-new');
      if (!name) return;
      planById(ui.planId).packing.push(C.normPack({ name }));
      persist(); ui.keepScroll = true; render();
      const el = $('#pack-new'); if (el) el.focus();
    },
    'edit-pack': (el) => packEditor(el.dataset.id),
    'save-pack': () => {
      const p = planById(ui.planId);
      const x = p.packing.find((i) => i.id === val('pk-id'));
      if (!val('pk-name')) { toast('品名を入れてください'); return; }
      Object.assign(x, C.normPack({ ...x, name: val('pk-name'), qty: val('pk-qty'), assignee: val('pk-who') }));
      persist(); closeSheet(); ui.keepScroll = true; render();
    },
    'delete-pack': () => { const p = planById(ui.planId); p.packing = p.packing.filter((i) => i.id !== val('pk-id')); persist(); closeSheet(); ui.keepScroll = true; render(); },
    'pack-suggest': () => {
      const p = planById(ui.planId);
      const w = S.weather && S.weather.days.find((d) => d.date >= p.startDate && d.date <= addDays(p.startDate, p.nights));
      const rain = /雨/.test(p.conditions) || !!(w && w.rainProb >= 50);
      const names = C.suggestPacking(p, { rain });
      if (!names.length) { toast('追加する候補はありません'); return; }
      names.forEach((name) => p.packing.push(C.normPack({ name })));
      persist(); ui.keepScroll = true; render();
      toast(`${names.length}件の候補を追加しました${rain ? '（雨の予報・条件を反映）' : ''}。不要なものは✎から削除できます`);
    },
    'pack-template': () => packTemplates(),
    'save-template': () => {
      const p = planById(ui.planId);
      S.packTemplates.push({ id: C.uid(), name: val('tpl-name') || `${p.title}の持ち物`, items: p.packing.map(({ name, qty, category }) => ({ name, qty, category })) });
      persist(); packTemplates(); toast('定番リストに保存しました');
    },
    'apply-template': (el) => {
      const p = planById(ui.planId);
      const t = S.packTemplates.find((x) => x.id === el.dataset.id);
      const have = new Set(p.packing.map((x) => x.name));
      const add = t.items.filter((i) => !have.has(i.name));
      add.forEach((i) => p.packing.push(C.normPack(i)));
      persist(); closeSheet(); ui.keepScroll = true; render(); toast(`${add.length}件追加しました`);
    },
    'delete-template': (el) => { S.packTemplates = S.packTemplates.filter((x) => x.id !== el.dataset.id); persist(); packTemplates(); },
    'plan-to-visit': () => planToVisitSheet(),
    'save-plan-visit': () => {
      const ids = $$('.pv-spot').filter((c) => c.checked).map((c) => c.value);
      if (!ids.length) { toast('行った場所を選んでください'); return; }
      const weather = ($('[data-pick-weather][aria-pressed="true"]') || {}).dataset?.pickWeather || '';
      const created = C.planToVisits(S, ui.planId, { spotIds: ids, date: val('pv-date'), weather });
      persist(); closeSheet(); render();
      toast(`${created.length}件の思い出を記録しました。思い出タブで写真や感想を追加できます`);
    },
    'new-visit': () => visitEditor(null),
    'edit-visit': (el) => visitEditor(el.dataset.id),
    'save-visit': () => saveVisit(),
    'delete-visit': () => {
      const v = S.visits.find((x) => x.id === val('vi-id'));
      if (!confirm('この思い出を削除しますか？')) return;
      v.photos.forEach((n) => N.deletePhoto(n));
      S.visits = S.visits.filter((x) => x.id !== v.id);
      persist(); closeSheet(); render();
    },
    'add-photos': async () => {
      try {
        const names = await N.pickPhotos();
        (names || []).forEach((n) => visitDraft.photos.push(n));
        renderVisitPhotos();
      } catch (e) { toast('写真を追加できませんでした'); }
    },
    'save-settings': () => saveSettings(),
    'check-update': () => checkUpdate(),
    'export-json': async () => {
      try { const r = await N.exportFile(`tabi-no-tane-backup-${C.isoDate(new Date())}.json`, 'application/json', C.backupJson(S, app)); if (r) toast('書き出しました'); } catch (e) { toast('書き出せませんでした'); }
    },
    'export-visits': async () => { try { if (await N.exportFile(`tabi-no-tane-visits-${C.isoDate(new Date())}.csv`, 'text/csv', C.visitsCsv(S))) toast('書き出しました'); } catch (e) { toast('書き出せませんでした'); } },
    'export-spots': async () => { try { if (await N.exportFile(`tabi-no-tane-spots-${C.isoDate(new Date())}.csv`, 'text/csv', C.spotsCsv(S))) toast('書き出しました'); } catch (e) { toast('書き出せませんでした'); } },
    'import-json': async () => {
      try {
        const text = await N.importFile();
        if (!text) return;
        const next = C.migrate(JSON.parse(text));
        if (!confirm(`バックアップの内容（スポット${next.spots.length}・しおり${next.plans.length}・思い出${next.visits.length}）で、今のデータを置き換えますか？`)) return;
        next.settings.geminiKey = S.settings.geminiKey; // the backup never carries the key
        S = next;
        persist(); closeSheet(); go('home'); toast('復元しました');
      } catch (e) { toast('復元できませんでした：' + e.message); }
    },
  };

  // ---- events ----------------------------------------------------------------------------

  document.addEventListener('click', (e) => {
    const t = e.target.closest('button, tr[data-action], [data-geo-pick]');
    if (!t) {
      if (e.target === $('#modal')) closeSheet();
      return;
    }
    const d = t.dataset;
    if (d.action && actions[d.action]) { actions[d.action](t, e); return; }
    if (d.screen) { closeSheet(); go(d.screen); return; }
    if (d.cond) { ui.cond[d.cond] = !ui.cond[d.cond]; ui.query = val('q'); ui.keepScroll = true; render(); return; }
    if (d.spotView) { ui.spotView = d.spotView; render(); return; }
    if (d.spotFilter) { ui.spotFilter = d.spotFilter; ui.keepScroll = true; render(); return; }
    if (d.planTab) { ui.planTab = d.planTab; ui.keepScroll = true; render(); return; }
    if (d.planDay) { ui.planDay = Number(d.planDay); ui.keepScroll = true; render(); return; }
    if (d.legDir) { ui.legDir = d.legDir; ui.keepScroll = true; render(); return; }
    if (d.planMode) { const p = planById(ui.planId); p.mode = d.planMode; persist(); ui.keepScroll = true; render(); return; }
    if (d.historyView) { ui.historyView = d.historyView; ui.keepScroll = true; render(); return; }
    if (d.hq) {
      const k = d.hq;
      const v = k === 'revisit' ? true : k === 'minRating' ? 4 : d.hqVal;
      ui.hq[k] = ui.hq[k] === v ? (k === 'revisit' ? false : k === 'minRating' ? 0 : '') : v;
      ui.keepScroll = true; render(); return;
    }
    if (d.sort) { ui.tableSort = { key: d.sort, dir: ui.tableSort.key === d.sort ? -ui.tableSort.dir : -1 }; ui.keepScroll = true; render(); return; }
    if (d.geoPick !== undefined) {
      const c = ui.geoCands[Number(d.geoPick)];
      setPick(c.lat, c.lon, c.source);
      $$('[data-geo-pick]').forEach((b) => b.setAttribute('aria-pressed', b === t ? 'true' : 'false'));
      if (ui.sheet && ui.sheet.kind === 'spot-edit') {
        if (!val('sp-address')) $('#sp-address').value = c.address;
      }
      if (ui.sheet && ui.sheet.kind === 'settings' && !val('set-home')) $('#set-home').value = c.name;
      return;
    }
    if (d.icon) { $$('#sp-icons .chip').forEach((b) => b.setAttribute('aria-pressed', b === t ? 'true' : 'false')); return; }
    if (d.pickWeather) {
      const on = t.getAttribute('aria-pressed') !== 'true';
      $$('[data-pick-weather]').forEach((b) => b.setAttribute('aria-pressed', 'false'));
      t.setAttribute('aria-pressed', on ? 'true' : 'false');
      if (visitDraft && ui.sheet && ui.sheet.kind === 'visit-edit') visitDraft.weather = on ? d.pickWeather : '';
      return;
    }
    if (d.star) {
      const n = Number(d.star);
      visitDraft.rating = visitDraft.rating === n ? 0 : n;
      $$('#vi-stars button').forEach((b) => b.classList.toggle('on', Number(b.dataset.star) <= visitDraft.rating));
      return;
    }
    if (d.removePhoto) { visitDraft.photos = visitDraft.photos.filter((n) => n !== d.removePhoto); visitDraft.removed.push(d.removePhoto); renderVisitPhotos(); }
  });

  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.packToggle) {
      const p = planById(ui.planId);
      const x = p.packing.find((i) => i.id === t.dataset.packToggle);
      x.done = t.checked;
      persist(); ui.keepScroll = true; render();
    } else if (t.dataset.planField) {
      const p = planById(ui.planId);
      p[t.dataset.planField] = t.value;
      p.updatedAt = C.nowIso();
      persist();
    } else if (t.id === 'hq-year') {
      ui.hq.year = t.value; ui.keepScroll = true; render();
    } else if (t.id === 'vi-spot') {
      $('#vi-newspot').hidden = t.value !== '__new';
    }
  });

  let searchTimer;
  document.addEventListener('input', (e) => {
    const t = e.target;
    if (t.id === 'hq' || t.id === 'spot-q') {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        if (t.id === 'hq') ui.hq.text = t.value; else ui.spotQuery = t.value;
        const pos = t.selectionStart;
        ui.keepScroll = true;
        render();
        const el = document.getElementById(t.id);
        if (el) { el.focus(); try { el.setSelectionRange(pos, pos); } catch (err) { /* search inputs */ } }
      }, 250);
    } else if (t.id === 'q') {
      ui.query = t.value;
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const id = e.target.id;
    if (id === 'q') { e.preventDefault(); runSuggest(); }
    else if (id === 'pack-new') { e.preventDefault(); actions['add-pack'](); }
    else if (id === 'sp-geo-q') { e.preventDefault(); runGeoSearch('sp-geo-q', 'sp-cands'); }
    else if (id === 'set-geo-q') { e.preventDefault(); runGeoSearch('set-geo-q', 'set-cands'); }
  });

  window.TabiApp = {
    onBack() {
      if (ui.sheet) { closeSheet(); return true; }
      if (ui.screen === 'plans' && ui.planId) { ui.planId = null; render(); return true; }
      if (ui.screen !== 'home') { go('home'); return true; }
      return false;
    },
    onShared() { handleShared(N.consumeSharedText()); },
    // test hooks
    state: () => S,
    ui,
  };

  render();
  refreshWeather(false);
  handleShared(N.consumeSharedText());
})();
