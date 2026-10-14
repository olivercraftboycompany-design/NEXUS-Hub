/* NEXUS Hub: one dashboard for every NEXUS app on this phone.
   All the apps live on the same site (olivercraftboycompany-design.github.io), so their saved data
   (localStorage + IndexedDB) is readable from here. Hub is READ-ONLY: it never writes, migrates or
   deletes another app's keys or databases. Its own keys all start with "nxhub_". */
(() => {
'use strict';
const ORIGIN = location.origin;
const BASE = '/'; // all apps sit under the same origin root
const APPS = {
  bibley:  { name: 'Bibley', path: '/Bibley-/', icon: '/Bibley-/icons/icon-192.png', accent: '#f59e0b', open: '/Bibley-/?source=hub#continue' },
  nortest: { name: 'nortest', path: '/3tbwg/', icon: '/3tbwg/icons/icon-192.png', accent: '#1ed760', open: '/3tbwg/' },
  calendar:{ name: 'NEXUS Calendar', path: '/NEXUS-Calendar/', icon: '/NEXUS-Calendar/icons/icon-192.png', accent: '#3b82f6', open: '/NEXUS-Calendar/#today' },
  news:    { name: 'NEXUS News', path: '/NEXUS-News/', icon: '/NEXUS-News/icons/icon-192.png', accent: '#ef4444', open: '/NEXUS-News/?tab=top' },
  weather: { name: 'Ultimate Weather', path: '/Ultimate-Weather/', icon: '/Ultimate-Weather/icons/icon-192.png', accent: '#06b6d4', open: '/Ultimate-Weather/' },
  apol:    { name: 'Apologetics101', path: '/Apologetics101/', icon: '/Apologetics101/icons/icon-192.png', accent: '#8b5cf6', open: '/Apologetics101/?source=hub#/continue' }
};
const ORDER = ['bibley', 'nortest', 'calendar', 'news', 'weather', 'apol'];

// Home-screen shortcuts open ./?open=<app>: jump straight into that app.
const want = new URLSearchParams(location.search).get('open');
if (want && APPS[want]) { location.replace(APPS[want].open); return; }

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const dayStr = (d = new Date()) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const addDays = (s, n) => { const [y, m, d] = s.split('-').map(Number); return dayStr(new Date(y, m - 1, d + n)); };
const dOf = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const diffDays = (a, b) => Math.round((dOf(b) - dOf(a)) / 864e5);
const fmtNum = n => Number(n || 0).toLocaleString();
const fmtBytes = b => { if (!b) return '0 MB'; const u = ['B', 'KB', 'MB', 'GB']; let i = 0; while (b >= 1024 && i < 3) { b /= 1024; i++; } return (b >= 100 || i < 2 ? Math.round(b) : b.toFixed(1)) + ' ' + u[i]; };
function ago(ms) {
  if (!ms) return 'never';
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return m + ' min ago';
  const h = Math.floor(m / 60); if (h < 24) return h + ' hr ago';
  const d = Math.floor(h / 24); return d === 1 ? 'yesterday' : d + ' days ago';
}
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const toast = msg => { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, 2600); };

/* ---------- read-only storage helpers ---------- */
const read = (k, d) => { try { const v = localStorage.getItem(k); if (v == null) return d; return JSON.parse(v); } catch { return d; } };
const readRaw = k => { try { return localStorage.getItem(k); } catch { return null; } };
const has = k => readRaw(k) != null;
// Hub's own cache (only nxhub_* keys are ever written)
const hubGet = (k, d) => read('nxhub_' + k, d);
const hubSet = (k, v) => { try { localStorage.setItem('nxhub_' + k, JSON.stringify(v)); } catch {} };

// Open an existing IndexedDB WITHOUT a version (no upgrade) and never create one that isn't there.
async function openExistingDB(name) {
  if (!('indexedDB' in window)) return null;
  if (indexedDB.databases) {
    try { const list = await indexedDB.databases(); if (!list.some(d => d.name === name)) return null; } catch {}
  }
  return new Promise(res => {
    let req;
    try { req = indexedDB.open(name); } catch { res(null); return; }
    // If this fires the database didn't exist: abort so nothing gets created.
    req.onupgradeneeded = () => { try { req.transaction.abort(); } catch {} };
    req.onsuccess = () => { const db = req.result; db.onversionchange = () => db.close(); res(db); };
    req.onerror = e => { e.preventDefault && e.preventDefault(); res(null); };
    req.onblocked = () => res(null);
  });
}
const idbAll = (db, store) => new Promise(res => {
  if (!db.objectStoreNames.contains(store)) { res([]); return; }
  try { const q = db.transaction(store, 'readonly').objectStore(store).getAll(); q.onsuccess = () => res(q.result || []); q.onerror = () => res([]); } catch { res([]); }
});

async function getJSON(url, ms = 9000) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), ms);
  try { const r = await fetch(url, { cache: 'no-store', signal: ac.signal }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); }
  finally { clearTimeout(t); }
}

/* ================= Bibley ================= */
const BOOKS = [["Genesis",50],["Exodus",40],["Leviticus",27],["Numbers",36],["Deuteronomy",34],["Joshua",24],["Judges",21],["Ruth",4],["1 Samuel",31],["2 Samuel",24],["1 Kings",22],["2 Kings",25],["1 Chronicles",29],["2 Chronicles",36],["Ezra",10],["Nehemiah",13],["Esther",10],["Job",42],["Psalm",150],["Proverbs",31],["Ecclesiastes",12],["Song of Songs",8],["Isaiah",66],["Jeremiah",52],["Lamentations",5],["Ezekiel",48],["Daniel",12],["Hosea",14],["Joel",3],["Amos",9],["Obadiah",1],["Jonah",4],["Micah",7],["Nahum",3],["Habakkuk",3],["Zephaniah",3],["Haggai",2],["Zechariah",14],["Malachi",4],["Matthew",28],["Mark",16],["Luke",24],["John",21],["Acts",28],["Romans",16],["1 Corinthians",16],["2 Corinthians",13],["Galatians",6],["Ephesians",6],["Philippians",4],["Colossians",4],["1 Thessalonians",5],["2 Thessalonians",3],["1 Timothy",6],["2 Timothy",4],["Titus",3],["Philemon",1],["Hebrews",13],["James",5],["1 Peter",5],["2 Peter",3],["1 John",5],["2 John",1],["3 John",1],["Jude",1],["Revelation",22]];
const VOTD = ["Jeremiah 29:11", "Philippians 4:13", "Isaiah 41:10", "Joshua 1:9", "Romans 8:28", "Proverbs 3:5", "Proverbs 3:6", "Psalm 23:1", "Matthew 11:28", "John 3:16",     "2 Corinthians 5:17", "Psalm 46:1", "Romans 15:13", "Isaiah 40:31", "Psalm 118:24", "Lamentations 3:22", "Lamentations 3:23", "Philippians 4:6", "Philippians 4:7", "1 Peter 5:7",     "Psalm 27:1", "Hebrews 11:1", "Romans 8:38", "Romans 8:39", "Galatians 6:9", "Psalm 119:105", "Matthew 6:33", "John 14:27", "John 16:33", "Deuteronomy 31:6",     "Psalm 34:18", "Isaiah 26:3", "2 Timothy 1:7", "Romans 12:2", "Ephesians 2:8", "Ephesians 2:10", "Colossians 3:23", "1 Corinthians 16:14", "Micah 6:8", "Zephaniah 3:17",     "Psalm 37:4", "Psalm 16:8", "Psalm 121:2", "Psalm 139:14", "Proverbs 16:3", "James 1:5", "1 John 4:19", "1 John 1:9", "John 15:5", "John 8:12",     "Matthew 5:16", "Psalm 55:22", "Nahum 1:7", "Isaiah 43:2", "Psalm 91:1", "Romans 5:8", "Hebrews 13:8", "Psalm 145:18", "2 Corinthians 12:9", "Psalm 62:1",     "Numbers 6:24", "Psalm 32:8", "Isaiah 12:2", "Mark 10:27", "Luke 1:37", "Psalm 103:2", "Psalm 4:8", "1 Thessalonians 5:16", "1 Thessalonians 5:17", "1 Thessalonians 5:18",     "Proverbs 18:10", "Psalm 28:7", "Matthew 28:20", "Romans 10:9", "Psalm 51:10", "Colossians 3:15", "Psalm 19:14", "James 1:17", "Hebrews 4:16", "Psalm 147:3"];
const VERS = {"nkjv": "NKJV", "esv": "ESV", "nlt": "NLT", "csb": "CSB", "nasb": "NASB", "lsb": "LSB", "net": "NET", "bsb": "BSB", "web": "WEB", "mev": "MEV", "rsv": "RSV", "ceb": "CEB", "amp": "AMP", "msg": "MSG", "gnt": "GNT", "erv": "ERV", "nlv": "NLV", "bbe": "BBE", "kjv": "KJV", "asv": "ASV", "gnv": "GNV", "ylt": "YLT", "lsv": "LSV", "darby": "DARBY", "dra": "DRA", "webbe": "WEBBE", "oeb-us": "OEB-US", "oeb-cw": "OEB-CW", "cjb": "CJB", "tlv": "TLV", "rccv": "RCCV", "cuv": "CUV", "bkr": "BKR"};
const PLANS = {
  gospels30: { name: 'Gospels in 30 days', ico: '✝️' }, pp31: { name: 'Psalms & Proverbs in 31 days', ico: '🎵' },
  nt90: { name: 'New Testament in 90 days', ico: '📜' }, year365: { name: 'Bible in a year', ico: '📖' }
};
const range = (b0, b1) => { const o = []; for (let b = b0; b <= b1; b++) for (let c = 1; c <= BOOKS[b][1]; c++) o.push([b, c]); return o; };
const split = (list, days) => Array.from({ length: days }, (_, d) => list.slice(Math.floor(d * list.length / days), Math.floor((d + 1) * list.length / days)));
const PLAN_DAYS = {
  gospels30: () => split(range(39, 42), 30),
  pp31: () => split(range(18, 18), 31).map((d, i) => d.concat([[19, i + 1]])),
  nt90: () => split(range(39, 65), 90),
  year365: () => split(range(0, 65), 365)
};
function summarize(chs) {
  const parts = []; let i = 0;
  while (i < chs.length) { const b = chs[i][0]; let j = i; while (j + 1 < chs.length && chs[j + 1][0] === b && chs[j + 1][1] === chs[j][1] + 1) j++;
    parts.push(BOOKS[b][0] + ' ' + chs[i][1] + (j > i ? '–' + chs[j][1] : '')); i = j + 1; }
  return parts.join(' · ');
}
function votdRef(date = dayStr()) {
  const [y, m, d] = date.split('-').map(Number); const n = Math.floor(Date.UTC(y, m - 1, d) / 864e5);
  return VOTD[((n * 7) % VOTD.length + VOTD.length) % VOTD.length];
}
function bibley() {
  const keys = ['bible_highlights_v2', 'bible_bookmarks_v2', 'bibley_notes_v1', 'bibley_vbm_v1', 'bibley_plan_v1', 'bibley_read_v1', 'bibley_activity_v1', 'bible_last_pos_v1', 'bible_version_a_v1', 'bibley_prefs_v1', 'bibley_today_seen_v1'];
  const used = keys.some(has);
  const hl = read('bible_highlights_v2', {}), notes = read('bibley_notes_v1', {}), bm = read('bible_bookmarks_v2', []), vbm = read('bibley_vbm_v1', {});
  const act = new Set(read('bibley_activity_v1', [])), today = dayStr();
  let d = act.has(today) ? today : addDays(today, -1), streak = 0; while (act.has(d)) { streak++; d = addDays(d, -1); }
  const readMap = read('bibley_read_v1', {});
  let plan = null; const p = read('bibley_plan_v1', null);
  if (p && PLANS[p.id]) {
    const days = PLAN_DAYS[p.id](), done = p.done || {}; let idx = days.findIndex((_, i) => !done[i]); const finished = idx < 0; if (finished) idx = days.length - 1;
    const doneCount = Object.keys(done).length;
    plan = { ...PLANS[p.id], doneCount, total: days.length, pct: Math.round(doneCount / days.length * 100), day: idx + 1, today: summarize(days[idx]), finished, doneToday: Object.values(done).includes(today) };
  }
  const pos = read('bible_last_pos_v1', null);
  const ver = readRaw('bible_version_a_v1') || (pos && pos.version) || 'web';
  const vref = votdRef();
  const vstore = read('bibley_votd_v1', {}); const vt = vstore[today + '|' + ver] || Object.keys(vstore).filter(k => k.startsWith(today)).map(k => vstore[k])[0] || null;
  return {
    used, hl: Object.keys(hl || {}).length, notes: Object.keys(notes || {}).length,
    bm: (Array.isArray(bm) ? bm.length : 0) + Object.keys(vbm || {}).length, streak, streakToday: act.has(today),
    chapters: Object.keys(readMap || {}).length, plan,
    last: pos && BOOKS[pos.bookIdx] ? { ref: BOOKS[pos.bookIdx][0] + ' ' + pos.chapter, t: pos.t || 0 } : null,
    ver: VERS[ver] || String(ver).toUpperCase(), votd: vref, votdText: vt && vt.text ? vt.text : ''
  };
}

/* ================= nortest ================= */
async function nortest() {
  const db = await openExistingDB('nortest');
  if (!db) return { used: false };
  try {
    const [songs, pls, meta] = await Promise.all([idbAll(db, 'songs'), idbAll(db, 'playlists'), idbAll(db, 'meta')]);
    const M = {}; meta.forEach(r => { if (r && r.k != null) M[r.k] = r.v; });
    const plays = M.plays || {};
    const byId = {}; songs.forEach(s => { byId[s.id] = s; });
    const total = Object.values(plays).reduce((a, n) => a + (+n || 0), 0);
    const top = Object.entries(plays).filter(([id, n]) => byId[id] && n > 0).sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([id, n]) => ({ t: byId[id].title || 'Untitled', a: byId[id].artist || '', n }));
    const bytes = songs.reduce((a, s) => a + ((s.blob && s.blob.size) || 0) + ((s.cover && s.cover.size) || 0), 0);
    return { used: true, songs: songs.length, pls: pls.length, favs: songs.filter(s => s.fav).length, total, top, bytes, lastBackup: M.lastBackup || 0 };
  } finally { db.close(); }
}

/* ================= NEXUS Calendar ================= */
const CATS = { school: '🏫', test: '📝', homework: '📚', sports: '🏀', church: '⛪', hangout: '🎉', other: '📌' };
const toMin = t => { if (!t) return null; const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); };
const fmtT = t => { const m = toMin(t); if (m == null) return ''; let h = Math.floor(m / 60); const mm = m % 60, ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return mm ? `${h}:${pad(mm)} ${ap}` : `${h} ${ap}`; };
const relDay = k => { const n = diffDays(dayStr(), k); if (n === 0) return 'Today'; if (n === 1) return 'Tomorrow'; if (n === -1) return 'Yesterday'; const d = dOf(k); return n > 1 && n < 7 ? DOW[d.getDay()] : `${MON[d.getMonth()]} ${d.getDate()}`; };
function occurrences(events, from, to) {
  const out = [];
  for (const ev of events) {
    if (!ev || !ev.date) continue;
    const ex = new Set(ev.ex || []);
    const push = k => { if (k >= from && k <= to && k >= ev.date && !ex.has(k)) out.push({ ev, key: k }); };
    if (!ev.repeat || ev.repeat === 'none') push(ev.date);
    else if (ev.repeat === 'daily') { for (let k = ev.date > from ? ev.date : from; k <= to; k = addDays(k, 1)) push(k); }
    else if (ev.repeat === 'weekly') { let k = ev.date; if (k < from) k = addDays(k, Math.ceil(diffDays(k, from) / 7) * 7); for (; k <= to; k = addDays(k, 7)) push(k); }
    else if (ev.repeat === 'monthly') {
      const day = dOf(ev.date).getDate(); const f = dOf(from > ev.date ? from : ev.date);
      for (let y = f.getFullYear(), m = f.getMonth(), guard = 0; guard < 24; m++, guard++) {
        const d = new Date(y, m, day); if (d.getDate() !== day) { if (dayStr(new Date(y, m, 1)) > to) break; continue; }
        const k = dayStr(d); if (k > to) break; push(k);
      }
    }
  }
  return out.sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : (a.ev.allDay === b.ev.allDay ? (toMin(a.ev.start) || 0) - (toMin(b.ev.start) || 0) : a.ev.allDay ? -1 : 1));
}
function calendar() {
  const raw = read('nxcal_v1', null);
  if (!raw || !Array.isArray(raw.events)) return { used: false };
  const ev = raw.events, done = raw.done || {}, today = dayStr();
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const occ = occurrences(ev, today, addDays(today, 60));
  const upcoming = occ.filter(o => o.key > today || o.ev.allDay || (toMin(o.ev.end || o.ev.start) || 0) >= nowMin).slice(0, 5);
  const todayCount = occ.filter(o => o.key === today).length;
  const hw = occurrences(ev.filter(e => e.cat === 'homework'), addDays(today, -3), addDays(today, 7))
    .map(o => ({ ...o, done: !!done[o.ev.id + '@' + o.key] }))
    .filter(o => o.key >= today || !o.done).slice(0, 6);
  const push = read('nxcal_push', {});
  return {
    used: true, total: ev.length, todayCount,
    upcoming: upcoming.map(o => ({ when: relDay(o.key) + (o.ev.allDay ? '' : ' ' + fmtT(o.ev.start)), t: o.ev.title, e: CATS[o.ev.cat] || '📌' })),
    hw: hw.map(o => ({ when: relDay(o.key), t: o.ev.title, done: o.done, late: o.key < today })),
    hwLeft: hw.filter(o => !o.done).length,
    remEvents: ev.filter(e => Array.isArray(e.rem) && e.rem.length).length,
    remOn: !!push.on && ('Notification' in window ? Notification.permission === 'granted' : true)
  };
}

/* ================= NEXUS News ================= */
const NEWS_RAW = 'https://raw.githubusercontent.com/olivercraftboycompany-design/NEXUS-News/data/news.json';
function topOf(d) {
  if (!d || !Array.isArray(d.items)) return [];
  const m = new Map(d.items.map(i => [i.id, i]));
  let top = (d.top || []).map(id => m.get(id)).filter(Boolean);
  if (top.length < 3) top = top.concat(d.items.filter(i => (i.c || []).includes('top') && !top.includes(i)).sort((a, b) => b.p - a.p));
  return top.slice(0, 3).map(i => ({ t: i.t, s: i.s, u: i.u, p: i.p }));
}
async function news(online) {
  const saved = read('nxnews_saved_v1', null);
  const used = saved != null || has('nxnews_data_v1') || has('nxnews_tab') || has('nxnews_theme');
  let heads = null, updated = 0, live = false;
  if (online) {
    try { const d = await getJSON(NEWS_RAW, 10000); const h = topOf(d); if (h.length) { heads = h; updated = Date.parse(d.updated) || Date.now(); live = true; hubSet('news', { heads, updated }); } } catch {}
  }
  if (!heads) { const c = hubGet('news', null); if (c && c.heads) { heads = c.heads; updated = c.updated; } }
  if (!heads) { const d = read('nxnews_data_v1', null); const h = topOf(d); if (h.length) { heads = h; updated = Date.parse(d.updated) || 0; } }
  return { used, saved: Array.isArray(saved) ? saved.length : 0, heads: heads || [], updated, live };
}

/* ================= Ultimate Weather ================= */
const WXD = { 0: ['Clear', '☀️', '🌙'], 1: ['Mainly clear', '🌤️', '🌙'], 2: ['Partly cloudy', '⛅', '☁️'], 3: ['Overcast', '☁️', '☁️'], 45: ['Fog', '🌫️', '🌫️'], 48: ['Rime fog', '🌫️', '🌫️'],
  51: ['Light drizzle', '🌦️', '🌧️'], 53: ['Drizzle', '🌦️', '🌧️'], 55: ['Heavy drizzle', '🌧️', '🌧️'], 56: ['Freezing drizzle', '🌧️', '🌧️'], 57: ['Freezing drizzle', '🌧️', '🌧️'],
  61: ['Light rain', '🌦️', '🌧️'], 63: ['Rain', '🌧️', '🌧️'], 65: ['Heavy rain', '🌧️', '🌧️'], 66: ['Freezing rain', '🌧️', '🌧️'], 67: ['Freezing rain', '🌧️', '🌧️'],
  71: ['Light snow', '🌨️', '🌨️'], 73: ['Snow', '🌨️', '🌨️'], 75: ['Heavy snow', '❄️', '❄️'], 77: ['Snow grains', '🌨️', '🌨️'], 80: ['Rain showers', '🌦️', '🌧️'], 81: ['Rain showers', '🌧️', '🌧️'],
  82: ['Violent showers', '⛈️', '⛈️'], 85: ['Snow showers', '🌨️', '🌨️'], 86: ['Snow showers', '❄️', '❄️'], 95: ['Thunderstorm', '⛈️', '⛈️'], 96: ['Storm + hail', '⛈️', '⛈️'], 99: ['Storm + hail', '⛈️', '⛈️'] };
async function weather(online) {
  const loc = read('nx_last', null), unit = read('nx_unit', 'F'), P = read('nx_push', {}) || {};
  const used = loc != null || has('nx_snap') || has('nx_unit');
  const L = loc && isFinite(loc.lat) ? loc : { lat: 41.5868, lon: -93.625, name: 'Des Moines, IA' };
  const F = unit !== 'C';
  let cur = null;
  if (online) {
    try {
      const u = `https://api.open-meteo.com/v1/forecast?latitude=${L.lat}&longitude=${L.lon}&current=temperature_2m,apparent_temperature,is_day,weather_code,wind_speed_10m,relative_humidity_2m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=1${F ? '&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch' : ''}`;
      const d = await getJSON(u, 10000); const c = d.current, dy = d.daily || {};
      cur = { temp: Math.round(c.temperature_2m), feels: Math.round(c.apparent_temperature), code: c.weather_code, day: c.is_day, wind: Math.round(c.wind_speed_10m), hum: Math.round(c.relative_humidity_2m),
        hi: dy.temperature_2m_max ? Math.round(dy.temperature_2m_max[0]) : null, lo: dy.temperature_2m_min ? Math.round(dy.temperature_2m_min[0]) : null,
        rain: dy.precipitation_probability_max ? dy.precipitation_probability_max[0] : null, t: Date.now(), name: L.name, F, live: true };
      hubSet('wx', cur);
    } catch {}
  }
  if (!cur) { const c = hubGet('wx', null); if (c && c.name === L.name) cur = { ...c, live: false }; }
  const custom = Array.isArray(P.custom) ? P.custom : [];
  const liveA = custom.find(a => a && a.preset === 'live');
  return { used, loc: L, isDefault: !loc, cur, notif: !!P.on, alerts: !!P.on && P.alerts !== false, liveOn: !!P.on && !!liveA && liveA.on !== false, liveSet: !!liveA && liveA.on !== false, customN: custom.filter(a => a && a.on !== false).length };
}

/* ================= Apologetics101 ================= */
function apol() {
  const last = read('a101.lastRead', null), saved = read('a101.saved', []), best = read('a101.quizBest', null);
  const used = last != null || has('a101.saved') || has('a101.recent') || has('a101.quizBest');
  return { used, last: last && last.slug ? { title: last.title || last.slug, pct: Math.max(0, Math.min(100, Math.round(last.pct || 0))), at: last.at || 0 } : null, saved: Array.isArray(saved) ? saved.length : 0, best };
}

/* ================= render ================= */
const stat = (n, label) => `<div class="stat"><b>${esc(n)}</b><span>${esc(label)}</span></div>`;
const row = (k, v) => `<div class="row"><span class="k">${esc(k)}</span><span class="v">${v}</span></div>`;
const empty = (app, extra) => `<div class="empty">Open ${esc(APPS[app].name)} once to see stats here.${extra ? '<br>' + extra : ''}</div>`;
function card(app, sub, body) {
  const A = APPS[app];
  return `<article class="card" id="card-${app}" style="--accent:${A.accent}" aria-labelledby="h-${app}">
    <div class="ch"><img src="${A.icon}" alt="" width="40" height="40" onerror="this.style.visibility='hidden'"><div class="t"><h2 id="h-${app}">${esc(A.name)}</h2><div class="sub">${sub}</div></div>
    <a class="open" href="${A.open}" aria-label="Open ${esc(A.name)}">Open</a></div>${body}</article>`;
}
function rBibley(b) {
  if (!b.used) return card('bibley', 'Bible reader', empty('bibley'));
  let h = `<div class="stats">${stat(b.hl, 'highlights')}${stat(b.notes, 'notes')}${stat(b.bm, 'bookmarks')}</div>`;
  if (b.plan) {
    h += `<div class="sec">${esc(b.plan.ico)} ${esc(b.plan.name)}</div><div class="bar2" role="progressbar" aria-valuenow="${b.plan.pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${b.plan.pct}%"></i></div>`;
    h += row(b.plan.finished ? 'Plan complete 🎉' : `Day ${b.plan.day} of ${b.plan.total}`, `${b.plan.pct}% · ${b.plan.doneCount} days done`);
    if (!b.plan.finished) h += row(b.plan.doneToday ? 'Today ✓' : 'Today', esc(b.plan.today));
  } else h += row('Reading plan', 'none yet · tap Plans');
  h += row('🔥 Streak', b.streak ? `${b.streak} day${b.streak === 1 ? '' : 's'}${b.streakToday ? '' : ' · read today to keep it'}` : 'start one today');
  h += row('Chapters read', fmtNum(b.chapters));
  h += row('Last read', b.last ? esc(b.last.ref) + (b.last.t ? ` · ${ago(b.last.t)}` : '') : '—');
  h += row('Version', esc(b.ver));
  h += `<div class="sec">Verse of the day · ${esc(b.votd)}</div>` + (b.votdText ? `<p class="verse">“${esc(b.votdText.length > 220 ? b.votdText.slice(0, 217) + '…' : b.votdText)}”</p>` : '');
  return card('bibley', b.streak ? `🔥 ${b.streak}-day streak` : 'Bible reader', h);
}
function rNortest(n) {
  if (!n.used || !n.songs) return card('nortest', 'Music player', n.used ? '<div class="empty">No songs yet. Open nortest and tap Upload to add some.</div>' : empty('nortest'));
  let h = `<div class="stats">${stat(n.songs, n.songs === 1 ? 'song' : 'songs')}${stat(n.pls, n.pls === 1 ? 'playlist' : 'playlists')}${stat(n.favs, 'favourites')}</div>`;
  h += row('Total plays', fmtNum(n.total));
  h += row('Song storage', fmtBytes(n.bytes));
  h += row('Last backup', ago(n.lastBackup));
  if (n.top.length) h += `<div class="sec">Most played</div><ol class="list">${n.top.map((s, i) => `<li><span class="when">#${i + 1}</span><span class="what">${esc(s.t)}${s.a && s.a !== 'Unknown Artist' ? ' · ' + esc(s.a) : ''}</span><span class="n">${s.n} play${s.n === 1 ? '' : 's'}</span></li>`).join('')}</ol>`;
  else h += '<div class="sec">Most played</div><div class="empty">Play a song all the way through to start counting.</div>';
  const due = !n.lastBackup || Date.now() - n.lastBackup > 14 * 864e5;
  if (due) h += `<div class="note">💾 ${n.lastBackup ? `Last backup was ${ago(n.lastBackup)}.` : 'No backup yet.'} Open nortest → Backup to save your songs.</div>`;
  return card('nortest', `${n.songs} song${n.songs === 1 ? '' : 's'} · ${fmtBytes(n.bytes)}`, h);
}
function rCalendar(c) {
  if (!c.used) return card('calendar', 'Calendar', empty('calendar'));
  let h = `<div class="stats">${stat(c.todayCount, 'today')}${stat(c.hwLeft, 'homework left')}${stat(c.remEvents, c.remEvents === 1 ? 'reminder' : 'reminders')}</div>`;
  h += '<div class="sec">Coming up</div>' + (c.upcoming.length ? `<ul class="list">${c.upcoming.map(o => `<li><span class="when">${esc(o.when)}</span><span class="what">${o.e} ${esc(o.t)}</span></li>`).join('')}</ul>` : '<div class="empty">Nothing coming up. Enjoy it 😎</div>');
  if (c.hw.length) h += `<div class="sec">Homework</div><ul class="list">${c.hw.map(o => `<li class="${o.done ? 'done' : ''}"><span class="when">${o.done ? '✅' : o.late ? '⚠️' : '⬜'} ${esc(o.when)}</span><span class="what">${esc(o.t)}</span></li>`).join('')}</ul>`;
  h += row('Reminders', c.remEvents ? (c.remOn ? `🔔 on · ${c.remEvents} event${c.remEvents === 1 ? '' : 's'}` : `${c.remEvents} set · notifications off`) : 'none set');
  return card('calendar', c.todayCount ? `${c.todayCount} event${c.todayCount === 1 ? '' : 's'} today` : `${c.total} event${c.total === 1 ? '' : 's'} saved`, h);
}
function rNews(n) {
  let h = `<div class="stats">${stat(n.saved, 'saved')}${stat(n.heads.length ? 'Live' : '—', n.updated ? 'upd ' + ago(n.updated) : 'headlines')}${stat('8', 'categories')}</div>`;
  h += '<div class="sec">Top headlines</div>' + (n.heads.length ? `<ol class="list">${n.heads.map((s, i) => `<li><span class="when">${i + 1}.</span><span class="what"><a href="${esc(s.u)}" target="_blank" rel="noopener noreferrer">${esc(s.t)}</a></span><span class="n">${esc(s.s || '')}</span></li>`).join('')}</ol>` : '<div class="empty">Headlines show up here once you\'re online.</div>');
  if (!n.used) h += '<div class="empty" style="margin-top:8px">Open NEXUS News once and tap ☆ on a story to see your saved count.</div>';
  return card('news', n.saved ? `${n.saved} saved stor${n.saved === 1 ? 'y' : 'ies'}` : 'Auto-updating news', h);
}
function rWeather(w) {
  let h = '';
  if (w.cur) {
    const c = w.cur, D = WXD[c.code] || ['—', '🌡️', '🌡️'], U = c.F ? '°F' : '°C';
    h += `<div class="wx"><span class="em">${c.day === 0 ? D[2] : D[1]}</span><span class="temp">${c.temp}${U}</span><div class="d"><b>${esc(D[0])}</b>Feels ${c.feels}° · H ${c.hi ?? '–'}° L ${c.lo ?? '–'}°</div></div>`;
    h += row('📍 ' + (w.isDefault ? 'Default spot' : 'Saved spot'), esc(w.loc.name || 'Your location'));
    h += row('Wind · humidity', `${c.wind} ${c.F ? 'mph' : 'km/h'} · ${c.hum}%`);
    if (c.rain != null) h += row('Rain chance today', c.rain + '%');
    if (!c.live) h += row('Updated', ago(c.t));
  } else h += '<div class="empty">Weather shows up here once you\'re online.</div>';
  h += `<div style="margin-top:8px"><span class="tag ${w.alerts ? 'on' : 'off'}">${w.alerts ? '✅' : '⛔'} Severe alerts ${w.alerts ? 'on' : 'off'}</span><span class="tag ${w.liveOn ? 'on' : 'off'}">${w.liveOn ? '✅' : '⛔'} Live updates ${w.liveOn ? 'on' : 'off'}</span></div>`;
  if (!w.used) h += '<div class="empty" style="margin-top:8px">Open Ultimate Weather once so the Hub uses your spot (showing Des Moines for now).</div>';
  else if (!w.notif) h += '<div class="note">🔔 Notifications are off in Ultimate Weather. Open it → Notifications to get severe-weather alerts.</div>';
  return card('weather', w.cur ? esc(w.loc.name || '') : 'Weather', h);
}
function rApol(a) {
  if (!a.used || !a.last) return card('apol', 'Apologetics', a.used ? '<div class="empty">Start an article in Apologetics101 to pick up where you left off here.</div>' : empty('apol'));
  const done = a.last.pct >= 95;
  let h = `<div class="sec">${done ? 'Finished · read again' : 'Continue reading'}</div><div class="row" style="border:0"><span class="v" style="text-align:left;white-space:normal">${esc(a.last.title)}</span></div>`;
  h += `<div class="bar2" role="progressbar" aria-valuenow="${a.last.pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${a.last.pct}%"></i></div>`;
  h += row('Progress', `${a.last.pct}%${a.last.at ? ' · ' + ago(a.last.at) : ''}`);
  if (a.saved) h += row('Saved', fmtNum(a.saved));
  if (a.best != null) h += row('Best quiz score', esc(a.best));
  return card('apol', `${a.last.pct}% through`, h);
}
function rSummary(S) {
  const p = [];
  if (S.bibley && S.bibley.used) p.push(`<a class="pill ${S.bibley.streak ? 'hot' : ''}" href="#card-bibley">🔥 ${S.bibley.streak}-day streak</a>`);
  if (S.nortest && S.nortest.used) p.push(`<a class="pill" href="#card-nortest">🎵 ${fmtNum(S.nortest.songs || 0)} song${S.nortest.songs === 1 ? '' : 's'}</a>`);
  if (S.calendar && S.calendar.used) p.push(`<a class="pill" href="#card-calendar">📅 ${S.calendar.todayCount} event${S.calendar.todayCount === 1 ? '' : 's'} today</a>`);
  if (S.weather && S.weather.cur) p.push(`<a class="pill" href="#card-weather">${(WXD[S.weather.cur.code] || ['', '🌡️'])[S.weather.cur.day === 0 ? 2 : 1]} ${S.weather.cur.temp}°${S.weather.cur.F ? 'F' : 'C'}</a>`);
  if (S.news && S.news.saved) p.push(`<a class="pill" href="#card-news">🔖 ${S.news.saved} saved</a>`);
  if (S.apol && S.apol.last) p.push(`<a class="pill" href="#card-apol">✝️ ${S.apol.last.pct}% read</a>`);
  $('#summary').innerHTML = p.join('') || '<span class="pill">Open your apps once to fill this in ✨</span>';
}
function greet() { const h = new Date().getHours(); $('#greet').textContent = (h < 5 ? 'Up late, Oliver 🌙' : h < 12 ? 'Good morning, Oliver ☀️' : h < 17 ? 'Good afternoon, Oliver 👋' : 'Good evening, Oliver 🌆'); }

const R = { bibley: rBibley, nortest: rNortest, calendar: rCalendar, news: rNews, weather: rWeather, apol: rApol };
let busy = false;
async function refresh(manual) {
  if (busy) return; busy = true;
  document.body.classList.add('spinning');
  const online = navigator.onLine !== false;
  $('#offline').hidden = online;
  greet();
  const S = {};
  const safe = async (k, f) => { try { S[k] = await f(); } catch (e) { console.warn('hub:', k, e && e.message); S[k] = { used: false }; } };
  await Promise.all([
    safe('bibley', bibley), safe('nortest', nortest), safe('calendar', calendar),
    safe('news', () => news(online)), safe('weather', () => weather(online)), safe('apol', apol)
  ]);
  $('#cards').innerHTML = ORDER.map(k => { try { return R[k](S[k] || { used: false }); } catch (e) { console.warn('hub render', k, e && e.message); return card(k, '', empty(k)); } }).join('');
  rSummary(S);
  window.__hub = S;
  const live = (S.weather && S.weather.cur && S.weather.cur.live) || (S.news && S.news.live);
  $('#dot').className = 'dot' + (online && live ? '' : ' stale');
  $('#updated').textContent = online ? (live ? 'Updated just now' : 'Updated · some live info couldn\'t load') : 'Offline · showing saved stats';
  hubSet('last', Date.now());
  document.body.classList.remove('spinning');
  busy = false;
  if (manual) toast('Stats refreshed ✓');
}

/* ---------- pull to refresh ---------- */
(() => {
  const ptr = $('#ptr'), txt = $('#ptrText'); let y0 = null, dy = 0;
  addEventListener('touchstart', e => { y0 = scrollY <= 0 ? e.touches[0].clientY : null; dy = 0; }, { passive: true });
  addEventListener('touchmove', e => { if (y0 == null) return; dy = e.touches[0].clientY - y0; if (dy > 0) { ptr.style.transform = `translateY(${Math.min(dy * 0.5, 70) - 60}px)`; txt.textContent = dy > 110 ? 'Release to refresh' : 'Pull to refresh'; } }, { passive: true });
  addEventListener('touchend', () => {
    if (y0 == null) return; y0 = null;
    if (dy > 110) { ptr.classList.add('go'); txt.textContent = 'Refreshing…'; ptr.style.transform = 'translateY(0)'; refresh(true).finally(() => { setTimeout(() => { ptr.classList.remove('go'); ptr.style.transform = ''; }, 300); }); }
    else ptr.style.transform = '';
  });
})();
$('#refreshBtn').addEventListener('click', () => refresh(true));
addEventListener('online', () => refresh());
addEventListener('offline', () => { $('#offline').hidden = false; $('#dot').className = 'dot stale'; $('#updated').textContent = 'Offline · showing saved stats'; });
// Coming back from another app: re-read everything.
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && Date.now() - (hubGet('last', 0) || 0) > 15000) refresh(); });
addEventListener('pageshow', e => { if (e.persisted) refresh(); });

/* ---------- install + service worker ---------- */
let deferred = null;
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; if (!standalone()) $('#installBtn').hidden = false; });
$('#installBtn').addEventListener('click', async () => {
  if (!deferred) { toast('Use ⋮ → Install app'); return; }
  deferred.prompt(); try { await deferred.userChoice; } catch {} deferred = null; $('#installBtn').hidden = true;
});
addEventListener('appinstalled', () => { $('#installBtn').hidden = true; deferred = null; toast('Installed! NEXUS Hub is on your home screen 🚀'); });
if ('serviceWorker' in navigator) {
  addEventListener('load', () => { navigator.serviceWorker.register('sw.js', { scope: './', updateViaCache: 'none' }).catch(err => console.warn('Offline mode not available:', err && err.message)); });
}

$('#cards').innerHTML = '<div class="skel"></div><div class="skel"></div><div class="skel"></div>';
refresh();
})();
