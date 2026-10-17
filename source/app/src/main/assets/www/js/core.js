/* Theta.Travel.Hatch — pure data/logic layer. No DOM access, so it runs in Node for tests. */
(function (root) {
  'use strict';

  const SCHEMA = 1;

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const pad2 = (n) => String(n).padStart(2, '0');
  const isoDate = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const nowIso = () => new Date().toISOString();

  function defaultSettings() {
    return {
      home: { label: '', lat: null, lon: null },
      defaultMode: 'car',
      companions: '',
      geminiKey: '',
      geminiModel: 'gemini-flash-latest',
      tiles: 'gsi',
      preference: 'balanced', // 'new' | 'revisit' | 'balanced'
      updateChannel: 'stable', // 'stable' | 'beta'
    };
  }

  function emptyState() {
    return {
      schema: SCHEMA,
      settings: defaultSettings(),
      spots: [],
      plans: [],
      visits: [],
      packTemplates: [],
      weather: null,
    };
  }

  const num = (v) => {
    if (v === '' || v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const str = (v) => (v === null || v === undefined ? '' : String(v));
  const arr = (v) => (Array.isArray(v) ? v : []);

  function normSpot(s) {
    const lat = num(s.lat), lon = num(s.lon);
    const valid = lat !== null && lon !== null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
    return {
      id: str(s.id) || uid(),
      name: str(s.name).trim() || '名前のないスポット',
      icon: str(s.icon) || '📍',
      address: str(s.address),
      lat: valid ? lat : null,
      lon: valid ? lon : null,
      geoSource: valid ? str(s.geoSource) || 'manual' : '',
      geoCheckedAt: valid ? str(s.geoCheckedAt) : '',
      url: str(s.url),
      indoor: ['indoor', 'outdoor', 'both'].includes(s.indoor) ? s.indoor : '',
      durationMin: num(s.durationMin),
      tags: arr(s.tags).map(str).filter(Boolean),
      memo: str(s.memo),
      wish: s.wish !== false,
      ai: s.ai && typeof s.ai === 'object' ? { text: str(s.ai.text), model: str(s.ai.model), at: str(s.ai.at) } : null,
      createdAt: str(s.createdAt) || nowIso(),
      updatedAt: str(s.updatedAt) || nowIso(),
    };
  }

  function normStop(s) {
    return {
      id: str(s.id) || uid(),
      day: Math.max(1, num(s.day) || 1),
      time: str(s.time),
      spotId: s.spotId ? str(s.spotId) : null,
      label: str(s.label),
      durationMin: num(s.durationMin),
      rainAlt: str(s.rainAlt),
      memo: str(s.memo),
    };
  }

  const LEG_MODES = ['train', 'bus', 'walk', 'car', 'plane', 'ship', 'taxi', 'other'];
  function normLeg(l) {
    return {
      id: str(l.id) || uid(),
      dir: l.dir === 'back' ? 'back' : 'out',
      mode: LEG_MODES.includes(l.mode) ? l.mode : 'train',
      from: str(l.from),
      to: str(l.to),
      line: str(l.line),
      depart: str(l.depart),
      arrive: str(l.arrive),
      transferMin: num(l.transferMin),
      ticketMemo: str(l.ticketMemo),
      source: l.source === 'auto' ? 'auto' : 'manual',
      fetchedAt: str(l.fetchedAt),
    };
  }

  function normPack(p) {
    return {
      id: str(p.id) || uid(),
      name: str(p.name).trim(),
      qty: Math.max(1, num(p.qty) || 1),
      assignee: str(p.assignee),
      category: str(p.category),
      done: !!p.done,
    };
  }

  function normPlan(p) {
    const start = str(p.startDate) || isoDate(new Date());
    return {
      id: str(p.id) || uid(),
      title: str(p.title).trim() || '新しいしおり',
      startDate: start,
      nights: Math.max(0, num(p.nights) || 0),
      departure: str(p.departure),
      departTime: str(p.departTime),
      companions: str(p.companions),
      budget: num(p.budget),
      conditions: str(p.conditions),
      reservationMemo: str(p.reservationMemo),
      mode: p.mode === 'transit' ? 'transit' : 'car',
      carMemo: str(p.carMemo),
      status: ['draft', 'planned', 'done'].includes(p.status) ? p.status : 'planned',
      ai: p.ai && typeof p.ai === 'object' ? { model: str(p.ai.model), at: str(p.ai.at), cautions: arr(p.ai.cautions).map(str) } : null,
      stops: arr(p.stops).map(normStop),
      legs: arr(p.legs).map(normLeg),
      packing: arr(p.packing).map(normPack).filter((x) => x.name),
      createdAt: str(p.createdAt) || nowIso(),
      updatedAt: str(p.updatedAt) || nowIso(),
    };
  }

  const WEATHERS = ['sunny', 'cloudy', 'rain', 'snow'];
  function normVisit(v) {
    return {
      id: str(v.id) || uid(),
      date: str(v.date) || isoDate(new Date()),
      spotId: str(v.spotId),
      planId: v.planId ? str(v.planId) : null,
      weather: WEATHERS.includes(v.weather) ? v.weather : '',
      cost: num(v.cost),
      rating: Math.min(5, Math.max(0, num(v.rating) || 0)),
      impression: str(v.impression),
      revisit: ['yes', 'maybe', 'no'].includes(v.revisit) ? v.revisit : '',
      companions: str(v.companions),
      photos: arr(v.photos).map(str).filter((n) => /^[A-Za-z0-9-]+\.jpg$/.test(n)),
      createdAt: str(v.createdAt) || nowIso(),
    };
  }

  /** Accepts anything parsed from storage or an imported backup and returns a valid state. */
  function migrate(raw) {
    const base = emptyState();
    if (!raw || typeof raw !== 'object') return base;
    if (num(raw.schema) > SCHEMA) throw new Error('このバックアップは新しい版のアプリで作られています。アプリを更新してください。');
    const settings = Object.assign(defaultSettings(), raw.settings || {});
    settings.home = Object.assign({ label: '', lat: null, lon: null }, settings.home || {});
    settings.home.lat = num(settings.home.lat);
    settings.home.lon = num(settings.home.lon);
    const spots = arr(raw.spots).map(normSpot);
    const ids = new Set(spots.map((s) => s.id));
    return {
      schema: SCHEMA,
      settings,
      spots,
      plans: arr(raw.plans).map(normPlan),
      visits: arr(raw.visits).map(normVisit).filter((v) => ids.has(v.spotId)),
      packTemplates: arr(raw.packTemplates).map((t) => ({
        id: str(t.id) || uid(),
        name: str(t.name) || '定番リスト',
        items: arr(t.items).map(normPack).filter((x) => x.name).map(({ name, qty, category }) => ({ name, qty, category })),
      })),
      weather: raw.weather && typeof raw.weather === 'object' ? raw.weather : null,
    };
  }

  // ---- spots & visits ------------------------------------------------------------------

  function visitsOf(state, spotId) {
    return state.visits.filter((v) => v.spotId === spotId).sort((a, b) => (a.date < b.date ? 1 : -1));
  }

  /** 'wish' | 'visited' | 'both' | 'none' */
  function spotStatus(state, spot) {
    const visited = state.visits.some((v) => v.spotId === spot.id);
    if (spot.wish && visited) return 'both';
    if (spot.wish) return 'wish';
    if (visited) return 'visited';
    return 'none';
  }

  const STATUS_LABEL = { wish: '行きたい', visited: '行った', both: '行きたい・行った', none: '保存のみ' };

  function filterSpots(state, filter) {
    return state.spots.filter((s) => {
      const st = spotStatus(state, s);
      if (filter === 'wish') return st === 'wish' || st === 'both';
      if (filter === 'visited') return st === 'visited' || st === 'both';
      return true;
    });
  }

  const hasCoords = (s) => s && s.lat !== null && s.lon !== null;

  function plansWithSpot(state, spotId) {
    return state.plans.filter((p) => p.stops.some((s) => s.spotId === spotId));
  }

  function deleteSpot(state, spotId) {
    state.spots = state.spots.filter((s) => s.id !== spotId);
    const removedVisits = state.visits.filter((v) => v.spotId === spotId);
    state.visits = state.visits.filter((v) => v.spotId !== spotId);
    state.plans.forEach((p) => p.stops.forEach((st) => {
      if (st.spotId === spotId) {
        st.label = st.label || '（削除したスポット）';
        st.spotId = null;
      }
    }));
    return removedVisits;
  }

  /** Converts a plan into visit records for the chosen spots. Returns the created visits. */
  function planToVisits(state, planId, opts) {
    const plan = state.plans.find((p) => p.id === planId);
    if (!plan) return [];
    const created = [];
    arr(opts.spotIds).forEach((spotId) => {
      if (!state.spots.some((s) => s.id === spotId)) return;
      const v = normVisit({
        spotId,
        planId,
        date: opts.date || plan.startDate,
        weather: opts.weather,
        companions: opts.companions !== undefined ? opts.companions : plan.companions,
      });
      state.visits.push(v);
      created.push(v);
    });
    if (created.length) plan.status = 'done';
    return created;
  }

  function searchVisits(state, q) {
    const text = str(q.text).trim().toLowerCase();
    const byId = new Map(state.spots.map((s) => [s.id, s]));
    return state.visits
      .filter((v) => {
        const s = byId.get(v.spotId);
        if (!s) return false;
        if (q.weather && v.weather !== q.weather) return false;
        if (q.revisit && v.revisit !== 'yes') return false;
        if (q.year && !v.date.startsWith(q.year)) return false;
        if (q.minRating && v.rating < q.minRating) return false;
        if (!text) return true;
        const hay = [s.name, s.address, s.memo, s.tags.join(' '), v.impression, v.companions, WEATHER_LABEL[v.weather] || ''].join(' ').toLowerCase();
        return text.split(/\s+/).every((t) => hay.includes(t));
      })
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }

  const WEATHER_LABEL = { sunny: '☀ 晴れ', cloudy: '☁ くもり', rain: '☔ 雨', snow: '❄ 雪', '': '—' };
  const INDOOR_LABEL = { indoor: '屋内', outdoor: '屋外', both: '屋内・屋外', '': '未設定' };
  const MODE_LABEL = { train: '電車', bus: 'バス', walk: '徒歩', car: '車', plane: '飛行機', ship: '船', taxi: 'タクシー', other: 'その他' };

  // ---- geo -------------------------------------------------------------------------------

  function haversineKm(a, b) {
    const R = 6371;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lon - a.lon);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  /** Rough one-way hours from straight-line distance. Labelled as an estimate in the UI. */
  function estimateHours(km, mode) {
    const road = km * 1.35;
    return mode === 'transit' ? road / 40 + 0.4 : road / 45 + 0.15;
  }

  // ---- conditions & suggestions ---------------------------------------------------------

  const toHalfWidth = (s) => str(s).replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  const KANJI_NUM = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 半: 0.5 };

  /** Reads Japanese free text like 「雨なので屋内、午後から車で2時間以内」. */
  function parseConditions(text, spots) {
    const t = toHalfWidth(text);
    const c = { rain: false, afternoon: false, overnight: false, dayTrip: false, indoor: false, kids: false, maxHours: null, mode: null, targetSpotId: null, nights: null };
    if (/雨|あめ|雪/.test(t)) c.rain = true;
    if (/屋内|室内|インドア/.test(t)) c.indoor = true;
    if (/午後|昼から|昼過ぎ|今から|これから/.test(t)) c.afternoon = true;
    const n = t.match(/([0-9一二三四五])\s*泊/);
    if (n) {
      c.overnight = true;
      c.nights = Number(n[1]) || KANJI_NUM[n[1]] || 1;
    } else if (/泊まり|宿泊|お泊/.test(t)) {
      c.overnight = true;
      c.nights = 1;
    }
    if (/日帰り/.test(t)) c.dayTrip = true;
    if (/子(ども|供)|子連れ|こども|キッズ|赤ちゃん/.test(t)) c.kids = true;
    if (/電車|公共交通|バス|新幹線/.test(t)) c.mode = 'transit';
    else if (/車|ドライブ/.test(t)) c.mode = 'car';
    const h = t.match(/([0-9]+(?:\.[0-9]+)?|[一二三四五半])\s*時間\s*(以内|まで|くらい|程度)?/);
    if (h && /以内|まで|くらい|程度|で/.test(t.slice(h.index - 2, h.index + h[0].length + 3))) {
      c.maxHours = Number(h[1]) || KANJI_NUM[h[1]] || null;
    }
    const m = t.match(/([0-9]+)\s*分\s*(以内|まで)/);
    if (m) c.maxHours = Number(m[1]) / 60;
    if (spots && spots.length) {
      // Longest matching name wins (「白浜アドベンチャーワールド」 over 「白浜」).
      const hit = spots.filter((s) => s.name && t.includes(s.name)).sort((a, b) => b.name.length - a.name.length)[0];
      if (hit) c.targetSpotId = hit.id;
    }
    return c;
  }

  /**
   * Ranks saved spots for the given conditions.
   * Returns [{spot, score, reasons[], cautions[], km, hours}] best first.
   */
  function suggest(state, cond, now) {
    now = now || new Date();
    const home = state.settings.home;
    const mode = cond.mode || state.settings.defaultMode;
    const pref = cond.preference || state.settings.preference;
    const hasHome = home && home.lat !== null && home.lon !== null;
    const hour = now.getHours() + now.getMinutes() / 60;
    // Hours left today for a day trip (aim to be home by 20:00).
    const startHour = cond.afternoon ? Math.max(hour, 13) : Math.max(hour, 9);
    const available = cond.overnight ? 36 : Math.max(0, 20 - startHour);

    const out = [];
    for (const spot of state.spots) {
      const visits = visitsOf(state, spot.id);
      const reasons = [];
      const cautions = [];
      let score = 0;
      let km = null, hours = null;

      if (cond.targetSpotId && spot.id === cond.targetSpotId) {
        score += 20;
        reasons.push('入力した場所');
      }
      if (spot.wish) { score += 1.5; if (!visits.length) reasons.push('行きたいリストにある'); }

      if (hasCoords(spot) && hasHome) {
        km = haversineKm(home, spot);
        hours = estimateHours(km, mode);
        if (cond.maxHours && hours > cond.maxHours) {
          if (spot.id !== cond.targetSpotId) continue;
          cautions.push(`移動目安${hours.toFixed(1)}時間で上限を超えそう`);
        }
        const stay = (spot.durationMin || 120) / 60;
        if (!cond.overnight && hours * 2 + stay > available) {
          if (spot.id !== cond.targetSpotId) { score -= 6; }
          cautions.push('今日中の往復は厳しい見込み');
        } else if (!cond.overnight && cond.afternoon) {
          score += 1;
          reasons.push(`${pad2(Math.floor(startHour))}時出発でも往復できる見込み`);
        }
        if (cond.overnight) {
          if (km > 60) { score += 2; reasons.push('1泊ならゆっくり行ける距離'); }
        } else {
          score += Math.max(0, 3 - hours);
          if (hours <= 1) reasons.push('近場（移動の目安1時間以内）');
        }
      } else if (!hasCoords(spot)) {
        cautions.push('位置が未確認');
        score -= 1;
      } else {
        cautions.push('出発地を設定すると移動時間も考慮できます');
      }

      if (cond.rain || cond.indoor) {
        if (spot.indoor === 'indoor') { score += 4; reasons.push('屋内で雨でも遊べる'); }
        else if (spot.indoor === 'both') { score += 1.5; reasons.push('屋内の施設もある'); }
        else if (spot.indoor === 'outdoor') { score -= 5; cautions.push('屋外中心'); }
        else cautions.push('屋内外が未設定');
        if (visits.some((v) => v.weather === 'rain' && v.rating >= 4)) { score += 2; reasons.push('雨の日にも楽しめた記録あり'); }
      }

      if (cond.kids && spot.tags.some((t) => /子|キッズ|ファミリー|動物|公園/.test(t))) { score += 1.5; reasons.push('子ども向けのタグ'); }

      const liked = visits.some((v) => v.revisit === 'yes' || v.rating >= 4);
      if (pref === 'new' && !visits.length) { score += 2.5; reasons.push('まだ行ったことがない'); }
      if (pref === 'revisit' && liked) { score += 2.5; reasons.push('また行きたい記録あり'); }
      if (pref === 'balanced') {
        if (!visits.length) score += 1;
        if (liked) { score += 1; reasons.push('前回の満足度が高い'); }
      }
      if (visits.some((v) => v.revisit === 'no')) score -= 2;

      cautions.push('営業時間・料金は要確認');
      out.push({ spot, score, reasons, cautions, km, hours, visits: visits.length });
    }
    return out.sort((a, b) => b.score - a.score);
  }

  // ---- plan drafts -----------------------------------------------------------------------

  const addMinutes = (hhmm, min) => {
    const [h, m] = hhmm.split(':').map(Number);
    const t = Math.max(0, Math.min(23 * 60 + 59, h * 60 + m + Math.round(min)));
    return `${pad2(Math.floor(t / 60))}:${pad2(t % 60)}`;
  };
  const roundUp15 = (d) => {
    const t = Math.ceil((d.getHours() * 60 + d.getMinutes()) / 15) * 15;
    return `${pad2(Math.min(23, Math.floor(t / 60)))}:${pad2(t % 60)}`;
  };

  /** Rule-based editable draft (works offline, no AI). */
  function buildPlanDraft(state, spot, cond, now) {
    now = now || new Date();
    const mode = cond.mode || state.settings.defaultMode;
    const home = state.settings.home;
    const nights = cond.overnight ? cond.nights || 1 : 0;
    let travelMin = 90;
    if (hasCoords(spot) && home.lat !== null) travelMin = Math.max(20, Math.round(estimateHours(haversineKm(home, spot), mode) * 60 / 15) * 15);
    const depart = cond.afternoon || nights ? (now.getHours() >= 12 ? roundUp15(new Date(now.getTime() + 30 * 60000)) : '13:00') : '09:00';
    const stay = spot.durationMin || 150;
    const rainAlt = spot.indoor === 'outdoor' ? '雨の場合は近くの屋内施設に変更' : '';
    const stops = [];
    const add = (day, time, label, extra) => stops.push(normStop(Object.assign({ day, time, label }, extra || {})));
    add(1, depart, `${home.label || '自宅'}を出発`, { memo: '移動時間は直線距離からの目安' });
    const arrive = addMinutes(depart, travelMin);
    if (!nights) {
      add(1, arrive, spot.name, { spotId: spot.id, durationMin: stay, rainAlt, memo: '営業時間・チケットは要確認' });
      const leave = addMinutes(arrive, stay);
      add(1, leave, '帰路へ', { memo: '混雑や天候に合わせて調整' });
      add(1, addMinutes(leave, travelMin), '帰宅');
    } else {
      add(1, arrive, spot.name, { spotId: spot.id, durationMin: stay, rainAlt, memo: '営業時間・チケットは要確認' });
      add(1, addMinutes(arrive, stay + 30), '宿にチェックイン', { memo: '宿泊先・空室は要確認' });
      add(1, '18:30', '夕食');
      for (let d = 2; d <= nights + 1; d++) {
        add(d, '08:00', '朝食');
        if (d <= nights) add(d, '10:00', '周辺を散策', { memo: '行きたいリストから追加できます' });
        else {
          add(d, '10:00', 'チェックアウト・おみやげ');
          add(d, '13:00', '帰路へ', { memo: '休憩をはさみながら' });
          add(d, addMinutes('13:00', travelMin + 30), '帰宅');
        }
      }
    }
    const title = nights ? `${spot.name}へ${nights}泊` : `${spot.name}へおでかけ`;
    return normPlan({
      title,
      startDate: isoDate(now),
      nights,
      departure: home.label,
      departTime: depart,
      companions: state.settings.companions,
      conditions: describeConditions(cond),
      mode,
      status: 'draft',
      stops,
      packing: suggestPacking({ nights, mode, packing: [] }, { rain: cond.rain, kids: cond.kids }).map((name) => ({ name })),
    });
  }

  function describeConditions(c) {
    const parts = [];
    if (c.rain) parts.push('雨');
    if (c.indoor) parts.push('屋内');
    if (c.afternoon) parts.push('午後から');
    if (c.overnight) parts.push(`${c.nights || 1}泊`);
    if (c.dayTrip) parts.push('日帰り');
    if (c.kids) parts.push('子連れ');
    if (c.maxHours) parts.push(`移動${c.maxHours}時間以内`);
    if (c.mode) parts.push(c.mode === 'transit' ? '公共交通' : '車');
    return parts.join('・');
  }

  const PACK_BASE = ['財布', 'スマホ・充電器', '保険証', '予約確認・チケット', '飲み物'];
  const PACK_OVERNIGHT = ['着替え', '洗面用具', 'パジャマ', '常備薬'];
  const PACK_RAIN = ['折りたたみ傘', 'レインコート', 'タオル', '替えの靴下'];
  const PACK_KIDS = ['子どもの着替え', 'おやつ', 'ウェットティッシュ', 'ビニール袋'];
  const PACK_TRANSIT = ['ICカード', '時刻・乗換メモ'];
  const PACK_CAR = ['運転免許証', 'ETCカード', '車内用の充電ケーブル'];

  /** Returns item names not yet in the plan's list. */
  function suggestPacking(plan, ctx) {
    ctx = ctx || {};
    const want = [...PACK_BASE];
    if (plan.nights > 0) want.push(...PACK_OVERNIGHT);
    if (ctx.rain) want.push(...PACK_RAIN);
    if (ctx.kids || /子/.test(str(plan.companions))) want.push(...PACK_KIDS);
    want.push(...(plan.mode === 'transit' ? PACK_TRANSIT : PACK_CAR));
    const have = new Set(arr(plan.packing).map((p) => p.name));
    return [...new Set(want)].filter((n) => !have.has(n));
  }

  function planDays(plan) {
    const maxStopDay = plan.stops.reduce((m, s) => Math.max(m, s.day), 1);
    return Math.max(plan.nights + 1, maxStopDay);
  }

  function sortStops(stops) {
    return [...stops].sort((a, b) => a.day - b.day || (a.time || '99').localeCompare(b.time || '99'));
  }

  function sortLegs(legs, dir) {
    return legs.filter((l) => l.dir === dir).sort((a, b) => (a.depart || '99').localeCompare(b.depart || '99'));
  }

  /** Minutes between consecutive legs (arrive → next depart) for transfer checks. */
  function transferGaps(legs) {
    const gaps = [];
    for (let i = 1; i < legs.length; i++) {
      const a = legs[i - 1].arrive, d = legs[i].depart;
      if (/^\d\d:\d\d$/.test(a) && /^\d\d:\d\d$/.test(d)) {
        const [ah, am] = a.split(':').map(Number), [dh, dm] = d.split(':').map(Number);
        gaps.push(dh * 60 + dm - (ah * 60 + am));
      } else gaps.push(null);
    }
    return gaps;
  }

  // ---- AI (Gemini) -----------------------------------------------------------------------

  function geminiPlanPrompt(state, spot, cond, userText) {
    const s = state.settings;
    return [
      'あなたは日本の家族旅行の計画を手伝うアシスタントです。以下の条件で、編集可能な旅程の下書きをJSONだけで返してください。',
      '営業時間・料金・空室など確認できない情報は断定せず、cautionsに「要確認」として書いてください。',
      `ユーザーの入力: ${userText || '(なし)'}`,
      `目的地: ${spot.name}${spot.address ? `（${spot.address}）` : ''}`,
      `出発地: ${s.home.label || '未設定'}`,
      `交通手段: ${(cond.mode || s.defaultMode) === 'transit' ? '公共交通' : '車'}`,
      `同行者: ${s.companions || '未設定'}`,
      `条件: ${describeConditions(cond) || '特になし'}`,
      `泊数: ${cond.overnight ? cond.nights || 1 : 0}`,
      '形式: {"title":string,"days":[{"day":number,"stops":[{"time":"HH:MM","label":string,"memo":string,"rainAlt":string}]}],"packing":[string],"cautions":[string]}',
    ].join('\n');
  }

  function geminiSpotPrompt(text) {
    return [
      '次の「行ってみたい場所」の入力を整理して、JSONだけで返してください。わからない項目は空文字にし、推測で断定しないでください。',
      `入力: ${text}`,
      '形式: {"name":string,"area":string,"indoor":"indoor"|"outdoor"|"both"|"","durationMin":number|null,"tags":[string],"summary":string,"kidsNote":string}',
    ].join('\n');
  }

  /** Extracts the first JSON object from model text (handles ```json fences). */
  function parseModelJson(text) {
    const t = str(text).replace(/```(?:json)?/g, '');
    const start = t.indexOf('{');
    const end = t.lastIndexOf('}');
    if (start < 0 || end <= start) throw new Error('AIの応答を読み取れませんでした');
    return JSON.parse(t.slice(start, end + 1));
  }

  function planFromGemini(state, spot, cond, json, model) {
    const nights = cond.overnight ? cond.nights || 1 : 0;
    const names = state.spots.map((s) => s.name).sort((a, b) => b.length - a.length);
    const stops = [];
    arr(json.days).forEach((d) => arr(d.stops).forEach((st) => {
      const label = str(st.label);
      const hit = names.find((n) => label.includes(n));
      const sp = hit ? state.spots.find((s) => s.name === hit) : null;
      stops.push({ day: num(d.day) || 1, time: /^\d{1,2}:\d\d$/.test(str(st.time)) ? str(st.time).padStart(5, '0') : '', label, spotId: sp ? sp.id : null, memo: str(st.memo), rainAlt: str(st.rainAlt) });
    }));
    return normPlan({
      title: str(json.title) || `${spot.name}への旅`,
      startDate: isoDate(new Date()),
      nights,
      departure: state.settings.home.label,
      companions: state.settings.companions,
      conditions: describeConditions(cond),
      mode: cond.mode || state.settings.defaultMode,
      status: 'draft',
      ai: { model, at: nowIso(), cautions: arr(json.cautions).map(str) },
      stops,
      packing: arr(json.packing).map((name) => ({ name: str(name) })),
    });
  }

  // ---- export ----------------------------------------------------------------------------

  function csvCell(v) {
    const s = str(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }
  const csv = (rows) => '\ufeff' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';

  function visitsCsv(state) {
    const byId = new Map(state.spots.map((s) => [s.id, s]));
    const rows = [['日付', '場所', '住所', '緯度', '経度', '天気', '満足度', '費用', '再訪', '同行者', '感想', '写真枚数']];
    [...state.visits].sort((a, b) => (a.date < b.date ? -1 : 1)).forEach((v) => {
      const s = byId.get(v.spotId) || {};
      rows.push([v.date, s.name, s.address, s.lat, s.lon, (WEATHER_LABEL[v.weather] || '').replace(/^\S+\s/, ''), v.rating || '', v.cost, { yes: 'また行きたい', maybe: 'たぶん', no: 'もういい', '': '' }[v.revisit], v.companions, v.impression, v.photos.length]);
    });
    return csv(rows);
  }

  function spotsCsv(state) {
    const rows = [['名前', '状態', '住所', '緯度', '経度', '位置の出典', '屋内外', '所要分', 'タグ', 'URL', 'メモ', '訪問回数']];
    state.spots.forEach((s) => rows.push([s.name, STATUS_LABEL[spotStatus(state, s)], s.address, s.lat, s.lon, s.geoSource, INDOOR_LABEL[s.indoor], s.durationMin, s.tags.join(' '), s.url, s.memo, visitsOf(state, s.id).length]));
    return csv(rows);
  }

  function backupJson(state, appInfo) {
    const copy = JSON.parse(JSON.stringify(state));
    copy.settings.geminiKey = ''; // never put the API key into a file the user may share
    return JSON.stringify({ app: 'Theta.Travel.Hatch', exportedAt: nowIso(), appVersion: appInfo && appInfo.versionName, ...copy }, null, 2);
  }

  /** Compares dotted versions; prerelease suffix ranks lower. 1 if a>b. */
  function compareVersions(a, b) {
    const parse = (v) => {
      const [core, pre] = str(v).replace(/^v/, '').split('-');
      return { n: core.split('.').map((x) => Number(x) || 0), pre: pre || '' };
    };
    const A = parse(a), B = parse(b);
    for (let i = 0; i < 3; i++) if ((A.n[i] || 0) !== (B.n[i] || 0)) return (A.n[i] || 0) > (B.n[i] || 0) ? 1 : -1;
    if (A.pre === B.pre) return 0;
    if (!A.pre) return 1;
    if (!B.pre) return -1;
    return A.pre.localeCompare(B.pre, 'en', { numeric: true }) > 0 ? 1 : -1;
  }

  /** Open-Meteo forecast response → compact summary. */
  function summarizeWeather(json, fetchedAt) {
    const d = json && json.daily;
    if (!d || !Array.isArray(d.time)) throw new Error('天気の応答を読み取れませんでした');
    return {
      fetchedAt: fetchedAt || nowIso(),
      days: d.time.map((t, i) => ({
        date: t,
        code: d.weather_code ? d.weather_code[i] : null,
        rainProb: d.precipitation_probability_max ? d.precipitation_probability_max[i] : null,
        tMax: d.temperature_2m_max ? d.temperature_2m_max[i] : null,
        tMin: d.temperature_2m_min ? d.temperature_2m_min[i] : null,
      })),
    };
  }

  function weatherEmoji(code) {
    if (code === null || code === undefined) return '·';
    if (code === 0) return '☀';
    if (code <= 3) return '⛅';
    if (code <= 48) return '🌫';
    if (code <= 67 || (code >= 80 && code <= 82)) return '☔';
    if (code <= 77 || code === 85 || code === 86) return '❄';
    return '⛈';
  }

  const api = {
    SCHEMA, uid, isoDate, nowIso, emptyState, defaultSettings, migrate,
    normSpot, normPlan, normStop, normLeg, normPack, normVisit,
    visitsOf, spotStatus, STATUS_LABEL, filterSpots, hasCoords, plansWithSpot, deleteSpot, planToVisits, searchVisits,
    WEATHER_LABEL, INDOOR_LABEL, MODE_LABEL, LEG_MODES,
    haversineKm, estimateHours, parseConditions, suggest, describeConditions,
    buildPlanDraft, suggestPacking, planDays, sortStops, sortLegs, transferGaps, addMinutes,
    geminiPlanPrompt, geminiSpotPrompt, parseModelJson, planFromGemini,
    visitsCsv, spotsCsv, backupJson, compareVersions, summarizeWeather, weatherEmoji,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TabiCore = api;
})(typeof self !== 'undefined' ? self : this);
