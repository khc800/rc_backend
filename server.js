// // server.js
// const express = require('express');
// const { Client } = require('pg');
// const cors = require('cors');
// require('dotenv').config();

// const app = express();
// const port = process.env.PORT || 3000;

// // ===== DB =====
// const client = new Client({
//   connectionString: process.env.DATABASE_URL,
//   ssl: { rejectUnauthorized: false },
// });
// client.connect()
//   .then(() => console.log('Connected to Neon database'))
//   .catch(err => { console.error('Connection error', err.stack); process.exit(1); });

// // ===== MW =====
// app.use(cors());
// app.use(express.json());

// // ===== Helpers =====
// function toInt(v, def=0){ const n = parseInt(v, 10); return Number.isFinite(n) ? n : def; }
// function isISODate(s){ return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s); }

// // Saturday–Friday window containing ref date
// const WEEK_SQL_START = `(date_trunc('week', $1::date + interval '2 days') - interval '2 days')`;
// const WEEK_SQL_END   = `(date_trunc('week', $1::date + interval '2 days') - interval '2 days' + interval '7 days')`;

// // Build a date range for last N days ending at ref date (inclusive)
// function lastNDaysRangeSQL(n){
//   return {
//     where: `logs.date >= ($1::date - interval '${n-1} days') AND logs.date <= $1::date`,
//     params: (ref)=>[ref],
//   };
// }

// // Get all names from settings, trimmed
// async function getAllNames(){
//   const { rows } = await client.query(`
//     SELECT DISTINCT trim(name) AS name
//     FROM settings
//     WHERE name IS NOT NULL AND length(trim(name))>0
//     ORDER BY name
//   `);
//   return rows.map(r=>r.name);
// }

// // ===== Health =====
// app.get('/api/health', (_req, res) => res.json({ ok: true }));

// // ===== Logs: list (paginated) =====
// app.get('/api/logs', async (req, res) => {
//   const page  = Math.max(1, toInt(req.query.page, 1));
//   const limit = Math.min(200, Math.max(1, toInt(req.query.limit, 20)));
//   const offset = (page - 1) * limit;

//   try {
//     const { rows } = await client.query(
//       `SELECT id, timestamp, name, minutes, date
//        FROM logs
//        ORDER BY timestamp DESC
//        LIMIT $1::int OFFSET $2::int`,
//       [limit, offset]
//     );
//     const { rows: cnt } = await client.query(`SELECT COUNT(*)::int AS total FROM logs`);
//     res.status(200).json({ page, limit, total: cnt[0].total, items: rows });
//   } catch (err) {
//     console.error('Error retrieving logs:', err);
//     res.status(500).json({ error: 'Error retrieving logs' });
//   }
// });

// // ===== Logs: insert =====
// app.post('/api/logs', async (req, res) => {
//   let { timestamp, name, minutes, date } = req.body;
//   if (!timestamp) timestamp = new Date().toISOString();
//   if (typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'name is required' });
//   const mins = Number(minutes);
//   if (!Number.isFinite(mins) || mins <= 0) return res.status(400).json({ error: 'minutes must be a positive number' });
//   if (!isISODate(date)) return res.status(400).json({ error: 'date must be YYYY-MM-DD' });

//   try {
//     await client.query(
//       `INSERT INTO logs (timestamp, name, minutes, date) VALUES ($1, $2, $3, $4)`,
//       [timestamp, name.trim(), mins, date]
//     );
//     res.status(201).json({ message: 'تم الحفظ' });
//   } catch (err) {
//     console.error('Error inserting log:', err);
//     res.status(500).json({ error: 'Error creating log' });
//   }
// });

// // ===== Names =====
// app.get('/api/names', async (_req, res) => {
//     try {
//       const a = await client.query(`
//         SELECT DISTINCT trim(name) AS name
//         FROM settings
//         WHERE name IS NOT NULL AND length(trim(name)) > 0
//         ORDER BY name
//       `);
//       let names = a.rows.map(r => r.name);
  
//       if (names.length === 0) {
//         const b = await client.query(`
//           SELECT DISTINCT trim(name) AS name
//           FROM logs
//           WHERE name IS NOT NULL AND length(trim(name)) > 0
//           ORDER BY name
//         `);
//         names = b.rows.map(r => r.name);
//       }
  
//       // final sanitize
//       names = Array.from(new Set(names.map(n => n.trim()))).filter(n => n.length > 0).sort((x,y)=>x.localeCompare(y,'ar'));
//       res.status(200).json({ names });
//     } catch (err) {
//       console.error('Error fetching names:', err);
//       res.status(500).json({ error: 'Error fetching names' });
//     }
//   });
  

// // ===== Stats (aggregates) =====
// // range: day|week|month|undefined (all-time), date: YYYY-MM-DD
// app.get('/api/stats', async (req, res) => {
//   const { range, date } = req.query;
//   const params = [];
//   let where = '';

//   if (range && date) {
//     if (!isISODate(date)) return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
//     if (range === 'day') {
//       where = `WHERE logs.date::date = $1::date`; params.push(date);
//     } else if (range === 'week') {
//       where = `WHERE logs.date >= ${WEEK_SQL_START} AND logs.date < ${WEEK_SQL_END}`; params.push(date);
//     } else if (range === 'month') {
//       where = `WHERE logs.date >= date_trunc('month', $1::date) AND logs.date < date_trunc('month', $1::date) + interval '1 month'`; params.push(date);
//     }
//   }

//   const sql = `
//     SELECT name,
//            SUM(minutes)::int AS total_minutes,
//            COUNT(*)::int    AS reading_sessions
//     FROM logs
//     ${where}
//     GROUP BY name
//     ORDER BY total_minutes DESC, name ASC
//   `;

//   try {
//     const { rows } = await client.query(sql, params);
//     res.status(200).json(rows);
//   } catch (err) {
//     console.error('Error fetching stats:', err);
//     res.status(500).json({ error: 'Error fetching stats' });
//   }
// });

// // ===== Reader history (by month) =====
// app.get('/api/history', async (req, res) => {
//   const { name, month, year } = req.query;
//   if (typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'Missing name' });
//   const mm = toInt(month), yy = toInt(year);
//   if (!(mm>=1 && mm<=12) || !(yy>=1900 && yy<=3000)) return res.status(400).json({ error: 'Missing or invalid month/year' });

//   try {
//     const { rows } = await client.query(
//       `SELECT id, timestamp, name, minutes, date
//        FROM logs
//        WHERE name = $1
//          AND EXTRACT(MONTH FROM date) = $2
//          AND EXTRACT(YEAR  FROM date) = $3
//        ORDER BY date ASC, timestamp ASC`,
//       [name.trim(), mm, yy]
//     );
//     res.status(200).json(rows);
//   } catch (err) {
//     console.error('Error fetching history:', err);
//     res.status(500).json({ error: 'Error fetching history' });
//   }
// });

// // ===== History window (points for strips/charts) =====
// // GET /api/history-window?name=...&days=30&date=YYYY-MM-DD
// app.get('/api/history-window', async (req, res) => {
//   const { name, days=30, date } = req.query;
//   if (typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'Missing name' });
//   const N = Math.max(1, toInt(days, 30));
//   const ref = isISODate(date) ? date : new Date().toISOString().slice(0,10);

//   const range = lastNDaysRangeSQL(N);
//   try {
//     const { rows } = await client.query(
//       `SELECT date::date AS d, SUM(minutes)::int AS minutes
//        FROM logs
//        WHERE name = $2 AND ${range.where}
//        GROUP BY d
//        ORDER BY d ASC`,
//       [ref, name.trim()]
//     );
//     // fill missing days with 0
//     const out = [];
//     const start = new Date(new Date(ref).getTime() - (N-1)*86400000);
//     const map = new Map(rows.map(r => [r.d.toISOString().slice(0,10), r.minutes||0]));
//     for(let i=0;i<N;i++){
//       const d = new Date(start.getTime()+i*86400000).toISOString().slice(0,10);
//       out.push({ date: d, minutes: map.get(d) || 0 });
//     }
//     res.json({ ok:true, points: out });
//   } catch (err) {
//     console.error('Error fetching history-window:', err);
//     res.status(500).json({ error: 'Error fetching history-window' });
//   }
// });

// // ===== Day-of-week averages (overall) =====
// // GET /api/dow?date=YYYY-MM-DD&weeks=12
// app.get('/api/dow', async (req, res) => {
//   const weeks = Math.max(1, toInt(req.query.weeks, 12));
//   const ref = isISODate(req.query.date) ? req.query.date : new Date().toISOString().slice(0,10);

//   try {
//     const { rows } = await client.query(
//       `
//       WITH win AS (
//         SELECT *
//         FROM logs
//         WHERE logs.date >= ${WEEK_SQL_START} - interval '${weeks} weeks'
//           AND logs.date <  ${WEEK_SQL_START}
//       )
//       SELECT EXTRACT(DOW FROM date)::int AS dow,
//              AVG(minutes)::float AS avg_minutes
//       FROM win
//       GROUP BY dow
//       ORDER BY dow
//       `,
//       [ref]
//     );
//     const labels = ['أحد','إثنين','ثلاثاء','أربعاء','خميس','جمعة','سبت'];
//     const items = [];
//     for (let i=0;i<7;i++){
//       const row = rows.find(r=>r.dow===i) || { avg_minutes: 0 };
//       items.push({ dow: i, label: labels[i], avg: Math.round(row.avg_minutes||0) });
//     }
//     res.json({ ok:true, items });
//   } catch (err) {
//     console.error('Error fetching DOW:', err);
//     res.status(500).json({ error: 'Error fetching DOW' });
//   }
// });

// // ===== Streaks (current and longest per reader) =====
// // GET /api/streaks?date=YYYY-MM-DD&threshold=1
// // GET /api/streaks?date=YYYY-MM-DD&threshold=1&lookbackDays=365|all|N
// app.get('/api/streaks', async (req, res) => {
//     const ref = isISODate(req.query.date) ? req.query.date : new Date().toISOString().slice(0,10);
//     const threshold = Math.max(1, toInt(req.query.threshold, 1));
//     const lookbackRaw = (req.query.lookbackDays ?? 'all').toString().toLowerCase();
  
//     try {
//       let rows = [];
//       if (lookbackRaw === 'all') {
//         // all-time up to ref
//         const q = `
//           SELECT name, date::date AS d, SUM(minutes)::int AS minutes
//           FROM logs
//           WHERE date <= $1::date
//           GROUP BY name, d
//           ORDER BY name, d
//         `;
//         rows = (await client.query(q, [ref])).rows;
//       } else {
//         const N = Math.max(1, toInt(lookbackRaw, 365));
//         const q = `
//           SELECT name, date::date AS d, SUM(minutes)::int AS minutes
//           FROM logs
//           WHERE date <= $1::date
//             AND date >= $1::date - ($2::int || ' days')::interval
//           GROUP BY name, d
//           ORDER BY name, d
//         `;
//         rows = (await client.query(q, [ref, N])).rows;
//       }
  
//       // group by user
//       const byUser = new Map();
//       for (const r of rows) {
//         const key = r.name;
//         if (!byUser.has(key)) byUser.set(key, []);
//         byUser.get(key).push({ d: r.d.toISOString().slice(0,10), m: r.minutes || 0 });
//       }
  
//       // compute streaks per user
//       const out = [];
//       const refDate = new Date(ref);
//       for (const [name, arr] of byUser.entries()) {
//         // dense loop from user's first day (or ref-365) to ref
//         const firstDay = new Date(arr[0].d);
//         const start = firstDay; // for 'all' this is truly first; for window it's first in window
//         const map = new Map(arr.map(x => [x.d, x.m]));
  
//         let run = 0, longest = 0, current = 0;
//         for (let d = new Date(start); d <= refDate; d.setDate(d.getDate() + 1)) {
//           const key = d.toISOString().slice(0,10);
//           const hit = (map.get(key) || 0) >= threshold;
//           if (hit) { run += 1; longest = Math.max(longest, run); }
//           else { run = 0; }
//         }
//         // current run is the trailing run at ref
//         current = run;
//         out.push({ name, current, longest });
//       }
  
//       // include users with no rows -> zeros
//       const allNames = await getAllNames();
//       const present = new Set(out.map(o => o.name));
//       for (const n of allNames) if (!present.has(n)) out.push({ name: n, current: 0, longest: 0 });
  
//       // sort
//       out.sort((a,b)=> (b.current-a.current) || (b.longest-a.longest) || a.name.localeCompare(b.name,'ar'));
//       res.json({ ok: true, streaks: out });
//     } catch (err) {
//       console.error('Error fetching streaks:', err);
//       res.status(500).json({ error: 'Error fetching streaks' });
//     }
//   });
  

// // ===== Weekly awards (badges) =====
// // GET /api/awards?date=YYYY-MM-DD
// // Returns: { bestReader:{name, minutes}, mostImproved:{name, diff}, bestCurrentStreak:{name, current} }
// app.get('/api/awards', async (req, res) => {
//   const ref = isISODate(req.query.date) ? req.query.date : new Date().toISOString().slice(0,10);

//   try {
//     // Current week totals
//     const cur = await client.query(
//       `
//       SELECT name, SUM(minutes)::int AS minutes
//       FROM logs
//       WHERE logs.date >= ${WEEK_SQL_START}
//         AND logs.date <  ${WEEK_SQL_END}
//       GROUP BY name
//       `,
//       [ref]
//     );
//     // Previous week totals
//     const prev = await client.query(
//       `
//       SELECT name, SUM(minutes)::int AS minutes
//       FROM logs
//       WHERE logs.date >= ${WEEK_SQL_START} - interval '7 days'
//         AND logs.date <  ${WEEK_SQL_START}
//       GROUP BY name
//       `,
//       [ref]
//     );

//     const curMap = new Map(cur.rows.map(r=>[r.name, r.minutes||0]));
//     const prevMap = new Map(prev.rows.map(r=>[r.name, r.minutes||0]));
//     const names = new Set([...curMap.keys(), ...prevMap.keys()]);

//     // Best reader (max current week)
//     let bestReader = { name:'—', minutes:0 };
//     for (const n of names){
//       const v = curMap.get(n)||0;
//       if (v > bestReader.minutes) bestReader = { name:n, minutes:v };
//     }

//     // Most improved (cur - prev)
//     let mostImproved = { name:'—', diff:0 };
//     for (const n of names){
//       const diff = (curMap.get(n)||0) - (prevMap.get(n)||0);
//       if (diff > mostImproved.diff) mostImproved = { name:n, diff };
//     }

//     // Best current streak
//     const st = await (await fetchStreaksInternal(ref, 1)).sort((a,b)=> (b.current-a.current) || (b.longest-a.longest))[0] || {name:'—', current:0};
//     const bestCurrentStreak = { name: st.name, current: st.current };

//     res.json({ ok:true, bestReader, mostImproved, bestCurrentStreak });
//   } catch (err) {
//     console.error('Error computing awards:', err);
//     res.status(500).json({ error: 'Error computing awards' });
//   }

//   // helper uses the same logic as /api/streaks without HTTP
//   async function fetchStreaksInternal(date, threshold){
//     const { rows } = await client.query(
//       `
//       SELECT name, date::date AS d, SUM(minutes)::int AS minutes
//       FROM logs
//       WHERE date <= $1::date
//         AND date >= $1::date - interval '365 days'
//       GROUP BY name, d
//       ORDER BY name, d
//       `,
//       [date]
//     );
//     const byUser = new Map();
//     for (const r of rows){
//       const key = r.name;
//       if (!byUser.has(key)) byUser.set(key, []);
//       byUser.get(key).push({ d: r.d.toISOString().slice(0,10), m: r.minutes||0 });
//     }
//     const out = [];
//     const thresh = Math.max(1, toInt(threshold, 1));
//     for (const [name, arr] of byUser.entries()){
//       const map = new Map(arr.map(x=>[x.d, x.m]));
//       const daysBack = 365;
//       const refDate = new Date(date);
//       let longest=0, current=0, run=0;
//       for(let i=daysBack;i>=0;i--){
//         const d = new Date(refDate.getTime() - i*86400000).toISOString().slice(0,10);
//         const hit = (map.get(d)||0) >= thresh;
//         if (hit) { run += 1; longest = Math.max(longest, run); }
//         else { run = 0; }
//         if (i===0) current = run;
//       }
//       out.push({ name, current, longest });
//     }
//     const allNames = await getAllNames();
//     const present = new Set(out.map(o=>o.name));
//     for (const n of allNames){
//       if (!present.has(n)) out.push({ name: n, current: 0, longest: 0 });
//     }
//     return out;
//   }
// });

// // ===== Discipline (warnings and removed) =====
// // GET /api/discipline?date=YYYY-MM-DD
// // warning: أسبوع مكتمل سابق < 30 دقيقة
// // removed: مجموع أسبوعين مكتملين سابقين < 60 دقيقة
// app.get('/api/discipline', async (req, res) => {
//     const ref = isISODate(req.query.date) ? req.query.date : new Date().toISOString().slice(0,10);
  
//     try {
//       // اجلب كل الأسماء من settings أو من logs كبديل
//       const names = await getAllNames();
  
//       // إن لم توجد أسماء نهائياً نرجع قوائم فارغة
//       if (!names || names.length === 0) {
//         return res.json({ ok:true, warning:[], removed:[] });
//       }
  
//       // احسب حدود الأسابيع بالاعتماد على ref: أسبوعنا السبت–الجمعة
//       // cur_start = بداية الأسبوع الحاوي لتاريخ المرجع (لن نستخدمه مباشرة، لأننا نريد الأسابيع المكتملة قبلَه)
//       // w1 = الأسبوع المكتمل السابق، w2 = الذي قبله
//       const sql = `
//         WITH bounds AS (
//           SELECT (date_trunc('week', $1::date + interval '2 days') - interval '2 days') AS cur_start
//         ),
//         n AS (
//           SELECT unnest($2::text[]) AS name
//         ),
//         agg AS (
//           SELECT
//             n.name,
//             COALESCE(
//               SUM(l.minutes) FILTER (
//                 WHERE l.date >= b.cur_start - interval '7 days'
//                   AND l.date <  b.cur_start
//               ), 0
//             )::int AS w1,
//             COALESCE(
//               SUM(l.minutes) FILTER (
//                 WHERE l.date >= b.cur_start - interval '14 days'
//                   AND l.date <  b.cur_start - interval '7 days'
//               ), 0
//             )::int AS w2
//           FROM n
//           CROSS JOIN bounds b
//           LEFT JOIN logs l
//                  ON l.name = n.name
//           GROUP BY n.name, b.cur_start
//         )
//         SELECT name, w1, w2
//         FROM agg
//         ORDER BY name;
//       `;
  
//       const { rows } = await client.query(sql, [ref, names]);
  
//       const warning = [];
//       const removed = [];
//       for (const r of rows) {
//         const w1 = r.w1 || 0;
//         const w2 = r.w2 || 0;
//         if (w1 < 30) warning.push({ name: r.name, minutes: w1 });
//         if (w1 + w2 < 60) removed.push({ name: r.name, minutes: w1 + w2 });
//       }
  
//       // ترتيب تصاعدي حسب الدقائق ثم الاسم
//       warning.sort((a,b)=> a.minutes - b.minutes || a.name.localeCompare(b.name,'ar'));
//       removed.sort((a,b)=> a.minutes - b.minutes || a.name.localeCompare(b.name,'ar'));
  
//       res.json({ ok:true, warning, removed });
//     } catch (err) {
//       console.error('Error computing discipline:', err);
//       res.status(500).json({ error: 'Error computing discipline' });
//     }
//   });
  
// // ===== Start =====
// app.listen(port, () => {
//   console.log(`Server running at http://localhost:${port}`);
// });














const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// ---------- DB (use Pool) ----------
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// ping once
pool.query('SELECT 1').then(()=>console.log('Connected to Neon')).catch(e=>console.error('DB connect error', e));

app.use(express.json());
app.use(cors());

// ---------- helpers ----------
const WEEK_SQL_START = `(date_trunc('week', $1::date + interval '2 days') - interval '2 days')`; // Saturday start
const WEEK_SQL_END   = `(${WEEK_SQL_START} + interval '7 days')`;

function weekBoundsSaturday(dateStr){
  const d = new Date(dateStr || new Date().toISOString().slice(0,10));
  const day = d.getUTCDay();                 // 0 Sun … 6 Sat
  const diffToSat = (day + 1) % 7;           // days since Sat
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diffToSat));
  const end   = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + 7));
  const iso = x => x.toISOString().slice(0,10);
  return { start: iso(start), end: iso(end) }; // [start,end)
}

function toInt(v, def=0){
  const n = Number.parseInt(v,10);
  return Number.isFinite(n) ? n : def;
}

function isISODate(s){
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

// use $1 = ref date
function lastNDaysRangeSQL(N){
  const days = Math.max(1, N|0);
  return { where: `date >= $1::date - interval '${days-1} days' AND date <= $1::date` };
}

async function getAllNames(){
  // settings first, fallback logs
  const a = await pool.query(`
    SELECT DISTINCT trim(name) AS name
    FROM settings
    WHERE name IS NOT NULL AND length(trim(name)) > 0
    ORDER BY name
  `);
  if (a.rows.length) return a.rows.map(r=>r.name);

  const b = await pool.query(`
    SELECT DISTINCT trim(name) AS name
    FROM logs
    WHERE name IS NOT NULL AND length(trim(name)) > 0
    ORDER BY name
  `);
  return b.rows.map(r=>r.name);
}

// ---------- logs ----------
app.get('/api/logs', async (req, res) => {
  const page = Number(req.query.page || 1);
  const limit = Number(req.query.limit || 10);
  try {
    const result = await pool.query(
      `SELECT * FROM logs ORDER BY timestamp DESC LIMIT $1 OFFSET $2`,
      [limit, (page - 1) * limit]
    );
    res.status(200).json(result.rows);
  } catch (err) {
    console.error('Error retrieving logs:', err);
    res.status(500).json({ error: 'Error retrieving logs' });
  }
});

// app.post('/api/logs', async (req, res) => {
//   let { timestamp, name, minutes, date } = req.body;
//   if (!timestamp) timestamp = new Date().toISOString();
//   if (typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'name is required' });
//   const mins = Number(minutes);
//   if (!Number.isFinite(mins) || mins <= 0) return res.status(400).json({ error: 'minutes must be a positive number' });
//   if (!isISODate(date)) return res.status(400).json({ error: 'date must be YYYY-MM-DD' });

//   try {
//     await client.query(
//       `INSERT INTO logs (timestamp, name, minutes, date) VALUES ($1, $2, $3, $4)`,
//       [timestamp, name.trim(), mins, date]
//     );
//     res.status(201).json({ message: 'تم الحفظ' });
//   } catch (err) {
//     console.error('Error inserting log:', err);
//     res.status(500).json({ error: 'Error creating log' });
//   }
// });

app.post('/api/logs', async (req, res) => {
  const { timestamp, name, minutes, date, book, finished } = req.body;

  const mins = Number(minutes);
  if (!timestamp || !name || !date || !Number.isFinite(mins) || mins <= 0) {
    return res.status(400).json({ error: 'Missing or invalid fields: timestamp, name, minutes>0, date' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // insert log
    await client.query(
      `INSERT INTO logs (timestamp, name, minutes, date, book)
       VALUES ($1,$2,$3,$4,$5)`,
      [timestamp, name, mins, date, book || null]
    );

    // optional book tracking
    if (book && String(book).trim() !== '') {
      await client.query(
        `INSERT INTO books (name, book, start_date)
         VALUES ($1,$2,$3)
         ON CONFLICT (name, book) DO NOTHING`,
        [name, book, date]
      );

      if (finished === true || finished === 'true' || finished === 1 || finished === '1') {
        await client.query(
          `UPDATE books
             SET end_date = $1
           WHERE name = $2 AND book = $3
             AND (end_date IS NULL OR end_date < $1)`,
          [date, name, book]
        );
      }
    }

    await client.query('COMMIT');
    res.status(201).json({ message: 'تم الحفظ' });
  } catch (err) {
    await client.query('ROLLBACK');
    // console.error('Error inserting log:', err);
    console.error('Error inserting log:', err.message);
    res.status(500).json({ error: 'Error creating log' });
  } finally {
    client.release();
  }
});



  

// ---------- names ----------
app.get('/api/names', async (_req, res) => {
  try {
    const names = await getAllNames();
    res.status(200).json({ names });
  } catch (err) {
    console.error('Error fetching names:', err);
    res.status(500).json({ error: 'Error fetching names' });
  }
});

// ---------- books (suggestions) ----------
// ---------- books (suggestions) ----------
app.get('/api/books', async (req, res) => {
    const { name, q } = req.query;
    const params = [];
    const conds = ["book IS NOT NULL", "length(trim(book)) > 0"];
  
    if (name) { params.push(name); conds.push(`name = $${params.length}`); }
    if (q)    { params.push(q + '%'); conds.push(`book ILIKE $${params.length}`); }
  
    const where = `WHERE ${conds.join(' AND ')}`;
  
    const sql = `
      SELECT book
      FROM books
      ${where}
      GROUP BY book
      ORDER BY LOWER(book)
      LIMIT 200
    `;
  
    try {
    //   const r = await client.query(sql, params);
      const r = await pool.query(sql, params);

      res.status(200).json({ books: r.rows.map(x => x.book) });
    } catch (err) {
      console.error('Error fetching books:', err.message);
      res.status(500).json({ error: 'Error fetching books' });
    }
  });
  

// ---------- reader books ----------
app.get('/api/reader-books', async (req, res) => {
  const { name } = req.query;
  if (!name) return res.status(400).json({ error: 'Missing name' });
  try {
    const result = await pool.query(`
      SELECT b.book,
             b.start_date,
             b.end_date,
             COALESCE(SUM(l.minutes),0)::int AS total_minutes
      FROM books b
      LEFT JOIN logs l
        ON l.name=b.name AND l.book=b.book
      WHERE b.name=$1
      GROUP BY b.book,b.start_date,b.end_date
      ORDER BY b.start_date DESC;
    `, [name]);
    res.status(200).json({ books: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error:'Error fetching reader books' });
  }
});

// ---------- stats ----------
app.get('/api/stats', async (req, res) => {
  const { range, date } = req.query;
  const params = [];
  let where = '';

  if (range && date) {
    if (range === 'day') {
      where = `WHERE date::date = $1::date`;
      params.push(date);
    } else if (range === 'week') {
      const { start, end } = weekBoundsSaturday(date);
      where = `WHERE date >= $1::date AND date < $2::date`;
      params.push(start, end);
    } else if (range === 'month') {
      where = `
        WHERE date >= date_trunc('month', $1::date)
          AND date <  date_trunc('month', $1::date) + interval '1 month'
      `;
      params.push(date);
    }
  }

  const sql = `
    SELECT name,
           SUM(minutes)::int AS total_minutes,
           COUNT(*)::int    AS reading_sessions
    FROM logs
    ${where}
    GROUP BY name
    ORDER BY total_minutes DESC
  `;
  try {
    const result = await pool.query(sql, params);
    res.status(200).json(result.rows);
  } catch (err) {
    console.error('Error fetching stats:', err);
    res.status(500).json({ error: 'Error fetching stats' });
  }
});

// ---------- history ----------
app.get('/api/history', async (req, res) => {
  const { name, month, year } = req.query;
  if (!name || !month || !year) {
    return res.status(400).json({ error: 'Missing required fields: name, month, year' });
  }
  try {
    const result = await pool.query(
      `SELECT * FROM logs
       WHERE name = $1
         AND EXTRACT(MONTH FROM date) = $2
         AND EXTRACT(YEAR  FROM date) = $3
       ORDER BY date ASC, timestamp ASC`,
      [name, month, year]
    );
    res.status(200).json(result.rows);
  } catch (err) {
    console.error('Error fetching history:', err);
    res.status(500).json({ error: 'Error fetching history' });
  }
});

// ---------- history-window (for streak strips) ----------
app.get('/api/history-window', async (req, res) => {
  const { name, days=30, date } = req.query;
  if (typeof name !== 'string' || !name.trim())
    return res.status(400).json({ error: 'Missing name' });

  const N = Math.max(1, toInt(days, 30));
  const ref = isISODate(date) ? date : new Date().toISOString().slice(0,10);
  const range = lastNDaysRangeSQL(N);

  try {
    const { rows } = await pool.query(
      `SELECT date::date AS d, SUM(minutes)::int AS minutes
       FROM logs
       WHERE name = $2 AND ${range.where}
       GROUP BY d
       ORDER BY d ASC`,
      [ref, name.trim()]
    );

    const out = [];
    const start = new Date(new Date(ref).getTime() - (N-1)*86400000);
    const map = new Map(rows.map(r => [r.d.toISOString().slice(0,10), r.minutes||0]));
    for(let i=0;i<N;i++){
      const d = new Date(start.getTime()+i*86400000).toISOString().slice(0,10);
      out.push({ date: d, minutes: map.get(d) || 0 });
    }
    res.json({ ok:true, points: out });
  } catch (err) {
    console.error('Error fetching history-window:', err);
    res.status(500).json({ error: 'Error fetching history-window' });
  }
});

// ---------- DOW (kept, if you still call it) ----------
app.get('/api/dow', async (req, res) => {
  const weeks = Math.max(1, toInt(req.query.weeks, 12));
  const ref = isISODate(req.query.date) ? req.query.date : new Date().toISOString().slice(0,10);

  try {
    const { rows } = await pool.query(
      `
      WITH win AS (
        SELECT *
        FROM logs
        WHERE logs.date >= ${WEEK_SQL_START} - interval '${weeks} weeks'
          AND logs.date <  ${WEEK_SQL_START}
      )
      SELECT EXTRACT(DOW FROM date)::int AS dow,
             AVG(minutes)::float AS avg_minutes
      FROM win
      GROUP BY dow
      ORDER BY dow
      `,
      [ref]
    );
    const labels = ['أحد','إثنين','ثلاثاء','أربعاء','خميس','جمعة','سبت'];
    const items = [];
    for (let i=0;i<7;i++){
      const row = rows.find(r=>r.dow===i) || { avg_minutes: 0 };
      items.push({ dow: i, label: labels[i], avg: Math.round(row.avg_minutes||0) });
    }
    res.json({ ok:true, items });
  } catch (err) {
    console.error('Error fetching DOW:', err);
    res.status(500).json({ error: 'Error fetching DOW' });
  }
});

// ---------- streaks ----------
app.get('/api/streaks', async (req, res) => {
  const ref = isISODate(req.query.date) ? req.query.date : new Date().toISOString().slice(0,10);
  const threshold = Math.max(1, toInt(req.query.threshold, 1));
  const lookbackRaw = (req.query.lookbackDays ?? 'all').toString().toLowerCase();

  try {
    let rows = [];
    if (lookbackRaw === 'all') {
      rows = (await pool.query(
        `SELECT name, date::date AS d, SUM(minutes)::int AS minutes
         FROM logs
         WHERE date <= $1::date
         GROUP BY name, d
         ORDER BY name, d`,
        [ref]
      )).rows;
    } else {
      const N = Math.max(1, toInt(lookbackRaw, 365));
      rows = (await pool.query(
        `SELECT name, date::date AS d, SUM(minutes)::int AS minutes
         FROM logs
         WHERE date <= $1::date
           AND date >= $1::date - ($2::int || ' days')::interval
         GROUP BY name, d
         ORDER BY name, d`,
        [ref, N]
      )).rows;
    }

    const byUser = new Map();
    for (const r of rows) {
      if (!byUser.has(r.name)) byUser.set(r.name, []);
      byUser.get(r.name).push({ d: r.d.toISOString().slice(0,10), m: r.minutes || 0 });
    }

    const out = [];
    const refDate = new Date(ref);
    for (const [name, arr] of byUser.entries()) {
      const map = new Map(arr.map(x => [x.d, x.m]));
      const first = new Date(arr[0].d);
      let run=0, longest=0;
      for (let d = new Date(first); d <= refDate; d.setDate(d.getDate()+1)){
        const key = d.toISOString().slice(0,10);
        const hit = (map.get(key) || 0) >= threshold;
        if (hit){ run++; if (run>longest) longest=run; } else { run=0; }
      }
      const current = run; // trailing run
      out.push({ name, current, longest });
    }

    // add users with zero rows
    const allNames = await getAllNames();
    const present = new Set(out.map(o => o.name));
    for (const n of allNames) if (!present.has(n)) out.push({ name:n, current:0, longest:0 });

    out.sort((a,b)=> (b.current-a.current) || (b.longest-a.longest) || a.name.localeCompare(b.name,'ar'));
    res.json({ ok: true, streaks: out });
  } catch (err) {
    console.error('Error fetching streaks:', err);
    res.status(500).json({ error: 'Error fetching streaks' });
  }
});

// ---------- awards ----------
app.get('/api/awards', async (req, res) => {
  const ref = isISODate(req.query.date) ? req.query.date : new Date().toISOString().slice(0,10);
  try {
    const cur = await pool.query(
      `SELECT name, SUM(minutes)::int AS minutes
       FROM logs
       WHERE logs.date >= ${WEEK_SQL_START}
         AND logs.date <  ${WEEK_SQL_END}
       GROUP BY name`,
      [ref]
    );
    const prev = await pool.query(
      `SELECT name, SUM(minutes)::int AS minutes
       FROM logs
       WHERE logs.date >= ${WEEK_SQL_START} - interval '7 days'
         AND logs.date <  ${WEEK_SQL_START}
       GROUP BY name`,
      [ref]
    );

    const curMap = new Map(cur.rows.map(r=>[r.name, r.minutes||0]));
    const prevMap = new Map(prev.rows.map(r=>[r.name, r.minutes||0]));
    const names = new Set([...curMap.keys(), ...prevMap.keys()]);

    let bestReader = { name:'—', minutes:0 };
    for (const n of names){
      const v = curMap.get(n)||0;
      if (v > bestReader.minutes) bestReader = { name:n, minutes:v };
    }

    let mostImproved = { name:'—', diff:0 };
    for (const n of names){
      const diff = (curMap.get(n)||0) - (prevMap.get(n)||0);
      if (diff > mostImproved.diff) mostImproved = { name:n, diff };
    }

    // reuse streaks logic over last year
    const stRows = (await pool.query(
      `SELECT name, date::date AS d, SUM(minutes)::int AS minutes
       FROM logs
       WHERE date <= $1::date
         AND date >= $1::date - interval '365 days'
       GROUP BY name, d
       ORDER BY name, d`,
      [ref]
    )).rows;

    const byUser = new Map();
    for (const r of stRows){
      if (!byUser.has(r.name)) byUser.set(r.name, []);
      byUser.get(r.name).push({ d: r.d.toISOString().slice(0,10), m: r.minutes||0 });
    }
    let best = { name:'—', current:0, longest:0 };
    for (const [name, arr] of byUser.entries()){
      const map = new Map(arr.map(x=>[x.d, x.m]));
      let run=0, longest=0; const refDate = new Date(ref);
      // walk last 365 days
      for(let i=365;i>=0;i--){
        const k = new Date(refDate.getTime()-i*86400000).toISOString().slice(0,10);
        const hit = (map.get(k)||0) >= 1;
        if (hit){ run++; if (run>longest) longest=run; } else { run=0; }
      }
      const current = run;
      if ((current > best.current) || (current===best.current && longest>best.longest)){
        best = { name, current, longest };
      }
    }

    res.json({ ok:true, bestReader, mostImproved, bestCurrentStreak: { name: best.name, current: best.current } });
  } catch (err) {
    console.error('Error computing awards:', err);
    res.status(500).json({ error: 'Error computing awards' });
  }
});

// ---------- discipline ----------
app.get('/api/discipline', async (req, res) => {
  const ref = isISODate(req.query.date) ? req.query.date : new Date().toISOString().slice(0,10);

  try {
    const names = await getAllNames();
    if (!names.length) return res.json({ ok:true, warning:[], removed:[] });

    const sql = `
      WITH bounds AS (
        SELECT (date_trunc('week', $1::date + interval '2 days') - interval '2 days') AS cur_start
      ),
      n AS ( SELECT unnest($2::text[]) AS name ),
      agg AS (
        SELECT
          n.name,
          COALESCE(
            SUM(l.minutes) FILTER (
              WHERE l.date >= b.cur_start - interval '7 days'
                AND l.date <  b.cur_start
            ), 0
          )::int AS w1,
          COALESCE(
            SUM(l.minutes) FILTER (
              WHERE l.date >= b.cur_start - interval '14 days'
                AND l.date <  b.cur_start - interval '7 days'
            ), 0
          )::int AS w2
        FROM n
        CROSS JOIN bounds b
        LEFT JOIN logs l ON l.name = n.name
        GROUP BY n.name, b.cur_start
      )
      SELECT name, w1, w2
      FROM agg
      ORDER BY name;
    `;
    const { rows } = await pool.query(sql, [ref, names]);

    const warning = [];
    const removed = [];
    for (const r of rows) {
      const w1 = r.w1 || 0;
      const w2 = r.w2 || 0;
      if (w1 < 30) warning.push({ name: r.name, minutes: w1 });
      if (w1 + w2 < 60) removed.push({ name: r.name, minutes: w1 + w2 });
    }
    warning.sort((a,b)=> a.minutes - b.minutes || a.name.localeCompare(b.name,'ar'));
    removed.sort((a,b)=> a.minutes - b.minutes || a.name.localeCompare(b.name,'ar'));

    res.json({ ok:true, warning, removed });
  } catch (err) {
    console.error('Error computing discipline:', err);
    res.status(500).json({ error: 'Error computing discipline' });
  }
});


// GET /api/current-week-books?date=YYYY-MM-DD
app.get('/api/current-week-books', async (req, res) => {
    const ref = req.query.date || new Date().toISOString().slice(0,10);
    try {
      const { rows } = await pool.query(`
        WITH bounds AS (
          SELECT (date_trunc('week', $1::date + interval '2 days') - interval '2 days') AS wstart
        )
        SELECT book FROM (
          SELECT DISTINCT trim(l.book) AS book
          FROM logs l
          CROSS JOIN bounds b
          WHERE l.book IS NOT NULL
            AND length(trim(l.book)) > 0
            AND l.date >= b.wstart
            AND l.date <  b.wstart + interval '7 days'
        ) t
        ORDER BY lower(book)
      `, [ref]);
  
      res.json({ books: rows.map(r => r.book) });
    } catch (e) {
      console.error('current-week-books error:', e.message);
      res.status(500).json({ error: 'Error fetching week books' });
    }
  });
  
  
  
  
  
  
  
  

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
