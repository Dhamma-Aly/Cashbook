// ===================================================================
// SĀSANA ERP - CLOUDFLARE WORKER API (worker.js) — v5.0 (Universal Transfer)  
// ===================================================================
 
const PBKDF2_ITER = 100000; 
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TRF_RE = /^(TRF_.+)_(OUT|IN)$/;
const LEGACY_ID_RE = /^(?:CB|INV|YOGI)-(\d+)$/;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const enc = new TextEncoder();
const dec = new TextDecoder();

const getSecret = (env) => env.AUTH_SECRET || 'SASANA_DEFAULT_SECRET_KEY_2026_!@#';

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const TABLE_MAP = {
  '1CB': '1CB Bank (General)', '2CB': '2CB Bank (Meal)', '3CB': '3CB Bank (UZ)',
  '4GB': '1General Book', '5FB': '2Meal Book', '6HB': '3Hall Book', '7PB': '4Pagoda Book',
  '8EB': '5Electronic Book', '9MB': '6Medical Book', '10GB': '7Other Book',
};
['1CB Bank (General)', '2CB Bank (Meal)', '3CB Bank (UZ)', '1General Book', '2Meal Book',
  '3Hall Book', '4Pagoda Book', '5Electronic Book', '6Medical Book', '7Other Book']
  .forEach(t => { TABLE_MAP[t] = t; });

const LEDGER_TABLES = [...new Set(Object.values(TABLE_MAP))];
const BANK_TABLES = new Set(['1CB Bank (General)', '2CB Bank (Meal)', '3CB Bank (UZ)']);
const ALL_SHEETS = ['1CB', '2CB', '3CB', '4GB', '5FB', '6HB', '7PB', '8EB', '9MB', '10GB'];
const BANK_SHEETS = ['1CB', '2CB', '3CB'];
const USERS = ['User 1', 'User 2', 'User 3'];
const YOGI_CATS = ['ရဟန်း', 'ကိုရင်', 'သီလရှင်', 'လူပုဂ္ဂိုလ်', 'ဝေယျာဝိစ္စ'];

const str = (v, d = '') => (v === null || v === undefined) ? d : String(v).trim();
const num = (v) => { const n = parseFloat(String(v ?? '').replace(/,/g, '')); return Number.isFinite(n) ? n : 0; };
const todayMM = () => new Date(Date.now() + 6.5 * 3600 * 1000).toISOString().slice(0, 10);

function formatMonthYear(dateStr) {
  const m = /^(\d{4})-(\d{2})/.exec(String(dateStr || ''));
  if (!m) return dateStr ? String(dateStr) : '-';
  return `${MONTHS[+m[2] - 1] || m[2]}-${m[1].slice(2)}`;
}

function ledgerTable(raw) {
  const t = TABLE_MAP[str(raw)];
  if (!t) throw new HttpError(400, `Unknown or missing sheet: "${str(raw)}"`);
  return t;
}

function resolveYogiTable(s) {
  const v = str(s);
  return (v === '13Yogi' || v === 'Camp Yogi' || v.includes('စခန်းဝင်')) ? 'Camp Yogi' : 'Permanent Yogi';
}

async function readJson(request) {
  try {
    const b = await request.json();
    if (b && typeof b === 'object') return b;
  } catch (_) { }
  throw new HttpError(400, 'Invalid JSON body');
}

function parseKey(body, params) {
  const pick = (k) => body?.[k] ?? params?.get(k) ?? null;
  const uid = str(pick('unique_id') ?? pick('uniqueId'));
  if (uid) {
    const m = LEGACY_ID_RE.exec(uid);
    return m ? { id: +m[1] } : { uid };
  }
  const id = parseInt(pick('id'), 10);
  return Number.isInteger(id) ? { id } : null;
}
const keyWhere = (k) => (k.uid ? ['unique_id = ?', k.uid] : ['id = ?', k.id]);

// Crypto Helpers
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64uToBytes = (s) => {
  let t = s.replace(/-/g, '+').replace(/_/g, '/');
  while (t.length % 4) t += '=';
  return Uint8Array.from(atob(t), c => c.charCodeAt(0));
};
function safeEqual(a, b) {
  a = String(a); b = String(b);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

async function hashPassword(pw, salt = crypto.getRandomValues(new Uint8Array(16)), iter = PBKDF2_ITER) {
  const key = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, key, 256);
  return `pbkdf2$${iter}$${b64u(salt)}$${b64u(bits)}`;
}

async function verifyPassword(pw, stored) {
  if (stored.startsWith('pbkdf2$')) {
    const [, iter, salt] = stored.split('$');
    const calc = await hashPassword(pw, b64uToBytes(salt), parseInt(iter, 10));
    return { ok: safeEqual(calc, stored), upgrade: false };
  }
  return { ok: stored !== '' && safeEqual(pw, stored), upgrade: true };
}

const hmacKey = (secret) => crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);

async function signToken(env, payload) {
  const body = b64u(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(getSecret(env)), enc.encode(body));
  return `tok_${body}.${b64u(sig)}`;
}

async function verifyToken(env, request) {
  try {
    const h = request.headers.get('Authorization') || '';
    if (!h.startsWith('Bearer tok_')) return null;
    const [body, sig] = h.slice(11).trim().split('.');
    if (!body || !sig) return null;
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(getSecret(env)), b64uToBytes(sig), enc.encode(body));
    if (!ok) return null;
    const p = JSON.parse(dec.decode(b64uToBytes(body)));
    return p.exp > Date.now() ? p : null;
  } catch (_) { return null; }
}

const isViewer = (user) => String(user.r || '').toLowerCase() === 'viewer';

function corsHeaders(request, env) {
  const allowed = String(env.ALLOWED_ORIGIN || '*').split(',').map(s => s.trim()).filter(Boolean);
  const origin = request.headers.get('Origin') || '';
  const allow = allowed.includes('*') ? '*' : (allowed.includes(origin) ? origin : allowed[0]);
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function normLedger(b, table) {
  const date = str(b.entry_date || b.date, todayMM()).slice(0, 10);
  if (!DATE_RE.test(date)) throw new HttpError(400, 'Invalid date (YYYY-MM-DD)');
  let title = str(b.title || b.category);
  const sub_title = str(b.sub_title ?? b.subcategory);
  let income = num(b.income), expense = num(b.expense);
  if (b.amount != null && !income && !expense) {
    const a = num(b.amount);
    if (title === 'ထွက်ငွေ' || title === 'စာရင်းပြောင်း') expense = a; else income = a;
  }
  if (income < 0 || expense < 0) throw new HttpError(400, 'Amount must not be negative');
  if (!title) title = income > 0 ? 'ဝင်ငွေ' : 'ထွက်ငွေ';
  return {
    date, title, sub_title,
    description: str(b.description) || sub_title || title || 'စာရင်းထည့်သွင်းခြင်း',
    income, expense,
    voucher_no: str(b.voucher_no),
    receiver: BANK_TABLES.has(table) ? 'Bank' : (str(b.receiver) || 'User 1'),
    month_year: formatMonthYear(date),
    book_name: table,
    unique_id: str(b.unique_id ?? b.uniqueId) || crypto.randomUUID(),
  };
}

function upsertStmt(env, table, row) {
  const keys = Object.keys(row);
  const upd = keys.filter(k => k !== 'unique_id').map(k => `"${k}" = excluded."${k}"`)
    .concat(`updated_at = datetime('now')`).join(', ');
  return env.DB.prepare(
    `INSERT INTO "${table}" (${keys.map(k => `"${k}"`).join(', ')}) VALUES (${keys.map(() => '?').join(', ')}) ` +
    `ON CONFLICT(unique_id) DO UPDATE SET ${upd}`
  ).bind(...keys.map(k => row[k]));
}

function updateStmt(env, table, row, key) {
  const keys = Object.keys(row).filter(k => k !== 'unique_id' && k !== 'book_name');
  const [where, val] = keyWhere(key);
  return env.DB.prepare(
    `UPDATE "${table}" SET ${keys.map(k => `"${k}" = ?`).join(', ')}, updated_at = datetime('now') WHERE ${where}`
  ).bind(...keys.map(k => row[k]), val);
}

const changes = (r) => r?.meta?.changes ?? 0;

async function deleteTransferGroup(env, gid) {
  const ids = [`${gid}_OUT`, `${gid}_IN`];
  const res = await env.DB.batch(LEDGER_TABLES.map(t =>
    env.DB.prepare(`DELETE FROM "${t}" WHERE unique_id IN (?, ?)`).bind(...ids)));
  return res.reduce((s, r) => s + changes(r), 0);
}

// 🌟 စာအုပ်အလိုက် စဉ် (no) အား အစဉ်လိုက် သဘာဝကျစွာ ထုတ်ပေးခြင်း
async function queryBook(env, table, rawSheet) {
  const { results } = await env.DB.prepare(`SELECT * FROM "${table}" ORDER BY date ASC, id ASC`).all();
  const rows = results || [];
  let running = 0, totalIncome = 0, totalExpense = 0;
  const data = rows.map((row, idx) => {
    const inc = parseFloat(row.income) || 0, exp = parseFloat(row.expense) || 0;
    totalIncome += inc; totalExpense += exp; running += inc - exp;
    const uid = row.unique_id || `CB-${row.id}`;
    return {
      id: row.id,
      no: idx + 1, // 🌟 စာအုပ်၏ စဉ်နံပါတ် အစဉ်လိုက် အမှန်ဖြစ်စေခြင်း
      uniqueId: uid, unique_id: uid,
      sheet_name: rawSheet, date: row.date, entry_date: row.date,
      category: row.title || (inc > 0 ? 'ဝင်ငွေ' : 'ထွက်ငွေ'), title: row.title || '',
      subcategory: row.sub_title || '-', sub_title: row.sub_title || '',
      voucher_no: row.voucher_no || '', description: row.description || '', receiver: row.receiver || '',
      income: inc, expense: exp, balance: running,
      month_year: row.month_year || formatMonthYear(row.date), book_name: row.book_name || table,
    };
  });
  return { success: true, book: table, data, kpis: { totalIncome, totalExpense, balance: running, count: rows.length } };
}

// 🌟 UNIVERSAL TRANSFER BUILDER (စာအုပ်အားလုံး၊ ဘဏ်အားလုံး၊ User အားလုံး လွှဲပြောင်းနိုင်စေခြင်း)
function buildTransfer(b, src) {
  const date = str(b.entry_date || b.date, todayMM()).slice(0, 10);
  if (!DATE_RE.test(date)) throw new HttpError(400, 'Invalid date (YYYY-MM-DD)');
  const amt = num(b.amount);
  if (!(amt > 0)) throw new HttpError(400, 'amount must be greater than 0');

  const fromUid = TRF_RE.exec(str(b.unique_id));
  const gid = str(b.group_id) || (fromUid && fromUid[1]) || `TRF_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  const sender = BANK_TABLES.has(src) ? 'Bank' : (str(b.receiver) || 'User 1');
  const target = str(b.target || b.sub_title);
  const voucher_no = str(b.voucher_no), month_year = formatMonthYear(date);

  const mk = (table, suffix, o) => [table, {
    date, voucher_no, month_year, book_name: table, unique_id: `${gid}_${suffix}`,
    title: 'စာရင်းပြောင်း', income: 0, expense: 0, ...o,
  }];

  // ၁။ User အချင်းချင်း လွှဲပြောင်းခြင်း (User 1, 2, 3)
  const targetUser = USERS.find(u => target.includes(u));
  if (targetUser && !target.includes('Bank') && !target.includes('ဘဏ်')) {
    if (targetUser === sender && !BANK_TABLES.has(src)) {
      throw new HttpError(400, 'Sender and target user must differ');
    }
    return { gid, rows: [
      mk(src, 'OUT', { sub_title: `${targetUser} သို့ လွှဲပြောင်း`, description: str(b.description) || `${targetUser} ထံ စာရင်းပြောင်း ပေးပို့ခြင်း`, expense: amt, receiver: sender }),
      mk(src, 'IN', { sub_title: `${sender} ထံမှ လွှဲပြောင်းရရှိ`, description: str(b.description) ? `${str(b.description)} (ရရှိ)` : `${sender} ထံမှ စာရင်းပြောင်း ရရှိခြင်း`, income: amt, receiver: targetUser }),
    ] };
  }

  // ၂။ သတ်မှတ်ထားသော Target Bank သို့ လွှဲပြောင်းခြင်း (Bank Deposit / Bank to Bank)
  let targetBank = [...BANK_TABLES].find(bTbl => target.includes(bTbl) || target.includes(bTbl.split(' ')[0]));
  if (!targetBank && (target.includes('1CB') || target.includes('အထွေထွေ'))) targetBank = '1CB Bank (General)';
  if (!targetBank && (target.includes('2CB') || target.includes('ဆွမ်း'))) targetBank = '2CB Bank (Meal)';
  if (!targetBank && (target.includes('3CB') || target.includes('ဦးဇင်း') || target.includes('တစ်ဦးတည်း'))) targetBank = '3CB Bank (UZ)';
  if (!targetBank) targetBank = '1CB Bank (General)';

  if (BANK_TABLES.has(src)) {
    // ဘဏ်မှ အခြားဘဏ် သို့မဟုတ် ဘဏ်မှ ငွေထုတ်ယူခြင်း
    if (targetBank === src) {
      // ဘဏ်မှ User ထံသို့ ငွေထုတ်ပေးခြင်း
      const destUser = targetUser || 'User 1';
      return { gid, rows: [
        mk(src, 'OUT', { title: 'ဘဏ်ထုတ်ငွေ', sub_title: `${destUser} သို့ ထုတ်ပေး`, description: str(b.description) || `${destUser} သို့ အသုံးစရိတ်ငွေ ထုတ်ပေးခြင်း`, expense: amt, receiver: 'Bank' }),
        mk('1General Book', 'IN', { sub_title: `${src} မှ ထုတ်ယူရရှိ`, description: str(b.description) || `${src} မှ အသုံးစရိတ်ငွေ ထုတ်ယူခြင်း`, income: amt, receiver: destUser }),
      ] };
    } else {
      // ဘဏ်အချင်းချင်း လွှဲပြောင်းခြင်း (Bank to Bank)
      return { gid, rows: [
        mk(src, 'OUT', { sub_title: `${targetBank} သို့ လွှဲပြောင်း`, description: str(b.description) || `${targetBank} သို့ ဘဏ်စာရင်းပြောင်း လွှဲပို့ခြင်း`, expense: amt, receiver: 'Bank' }),
        [targetBank, { ...mk(targetBank, 'IN', {})[1], title: 'စာရင်းပြောင်း', sub_title: `${src} မှ လွှဲပြောင်းရရှိ`, description: `${src} မှ စာရင်းပြောင်း ရရှိခြင်း`, income: amt, receiver: 'Bank' }],
      ] };
    }
  }

  // စာအုပ်များမှ ဘဏ်သို့ အပ်နှံခြင်း (Book to Bank Deposit)
  return { gid, rows: [
    mk(src, 'OUT', { sub_title: 'ဘဏ်အပ်နှံခြင်း', description: str(b.description) || `${targetBank} သို့ ဘဏ်အပ်နှံခြင်း`, expense: amt, receiver: sender }),
    [targetBank, { ...mk(targetBank, 'IN', {})[1], title: 'ဘဏ်အပ်ငွေ', sub_title: 'ဘဏ်အပ်နှံခြင်း', description: `${src} [${sender}] မှ ဘဏ်အပ်ငွေ ရရှိခြင်း`, income: amt, receiver: 'Bank' }],
  ] };
}

async function handleTransfer(c) {
  const { url, method, env } = c;
  if (method === 'DELETE') {
    const m = TRF_RE.exec(str(url.searchParams.get('unique_id')));
    const gid = str(url.searchParams.get('group_id')) || (m && m[1]);
    if (!gid) throw new HttpError(400, 'group_id required');
    return c.J({ success: true, deleted: await deleteTransferGroup(env, gid) });
  }
  if (method !== 'POST' && method !== 'PUT') throw new HttpError(405, 'Method not allowed');

  const b = await readJson(c.request);
  const src = ledgerTable(url.searchParams.get('sheet') || b.sheet_name || b.sheet_code || b.book_name);
  const { gid, rows } = buildTransfer(b, src);

  const stmts = [];
  if (method === 'PUT' || str(b.unique_id).includes('TRF_')) {
    // မူရင်း Transfer အဟောင်းနှစ်ခုလုံးကို ရှင်းလင်းပြီးမှ အသစ်ပြန်သွင်းသည်
    LEDGER_TABLES.forEach(t => stmts.push(env.DB.prepare(`DELETE FROM "${t}" WHERE unique_id IN (?, ?)`).bind(`${gid}_OUT`, `${gid}_IN`)));
  }
  rows.forEach(([t, row]) => stmts.push(upsertStmt(env, t, row)));
  await env.DB.batch(stmts);
  return c.J({ success: true, group_id: gid, unique_id: `${gid}_OUT` });
}

async function handleEntries(c) {
  const { url, method, env } = c;
  const sheetParam = url.searchParams.get('sheet') || url.searchParams.get('book');

  if (method === 'GET') {
    const raw = sheetParam || '1CB';
    return c.J(await queryBook(env, ledgerTable(raw), raw));
  }

  const body = (method === 'POST' || method === 'PUT') ? await readJson(c.request) : null;
  const table = ledgerTable(sheetParam || body?.sheet_name || body?.sheet_code || body?.book_name);

  if (method === 'POST') {
    const row = normLedger(body, table);
    await upsertStmt(env, table, row).run();
    return c.J({ success: true, unique_id: row.unique_id });
  }

  const key = parseKey(body, url.searchParams);
  if (!key) throw new HttpError(400, 'unique_id or id required');

  // 🌟 (၁) လက်ခံစာအုပ် (`_IN`) မှ Edit/Delete တိုက်ရိုက်လုပ်ဆောင်ခြင်းအား တားဆီးခြင်း
  if (key.uid && key.uid.endsWith('_IN')) {
    throw new HttpError(400, 'ဤစာရင်းသည် လက်ခံစာရင်း (Incoming Transfer) ဖြစ်သောကြောင့် မူရင်းလွှဲပို့သည့် စာအုပ်မှသာ ပြင်ဆင်/ဖျက်ပစ်နိုင်ပါသည်ခင်ဗျာ။');
  }

  if (method === 'PUT') {
    if (key.uid && TRF_RE.test(key.uid)) {
      // Transfer ဖြစ်ပါက handleTransfer logic သို့ လွှဲပေးသည်
      const { gid, rows } = buildTransfer(body, table);
      const stmts = [];
      LEDGER_TABLES.forEach(t => stmts.push(env.DB.prepare(`DELETE FROM "${t}" WHERE unique_id IN (?, ?)`).bind(`${gid}_OUT`, `${gid}_IN`)));
      rows.forEach(([t, row]) => stmts.push(upsertStmt(env, t, row)));
      await env.DB.batch(stmts);
      return c.J({ success: true, group_id: gid });
    }
    const r = await updateStmt(env, table, normLedger({ ...body, unique_id: key.uid }, table), key).run();
    if (!changes(r)) throw new HttpError(404, 'Entry not found in this book');
    return c.J({ success: true });
  }

  if (method === 'DELETE') {
    const trf = key.uid && TRF_RE.exec(key.uid);
    if (trf) {
      return c.J({ success: true, deleted: await deleteTransferGroup(env, trf[1]) });
    }
    const [where, val] = keyWhere(key);
    const r = await env.DB.prepare(`DELETE FROM "${table}" WHERE ${where}`).bind(val).run();
    return c.J({ success: true, deleted: changes(r) });
  }
  throw new HttpError(405, 'Method not allowed');
}

// -------------------------------------------------------------------
// STANDARD ROUTERS (Login, Yogi, Inventory, Summary, Report)
// -------------------------------------------------------------------
async function handleLogin(c) {
  const b = await readJson(c.request);
  const username = str(b.username), password = str(b.password);
  if (!username || !password) throw new HttpError(400, 'Username and password required');

  const row = await c.env.DB.prepare(`SELECT id, username, password, role, name FROM users WHERE username = ? LIMIT 1`).bind(username).first();
  const check = row ? await verifyPassword(password, String(row.password || '')) : { ok: false };
  if (!check.ok) throw new HttpError(401, 'အသုံးပြုသူအမည် သို့မဟုတ် လျှို့ဝှက်နံပါတ် မှားယွင်းနေပါသည်။');

  if (check.upgrade) {
    await c.env.DB.prepare(`UPDATE users SET password = ? WHERE id = ?`).bind(await hashPassword(password), row.id).run();
  }
  const role = row.role || 'Staff';
  const token = await signToken(c.env, { uid: row.id, u: row.username, r: role, exp: Date.now() + TOKEN_TTL_MS });
  return c.J({ success: true, token, user: { id: row.id, username: row.username, role, name: row.name || row.username }, expiresInMs: TOKEN_TTL_MS });
}

async function handleHomeSummary(c) {
  const { env } = c;
  const fundSummary = {};
  ALL_SHEETS.forEach(s => { fundSummary[s] = { bankBalance: 0, user1Balance: 0, user2Balance: 0, user3Balance: 0, totalBalance: 0 }; });
  let totalFund = 0, totalBank = 0, totalCash = 0, totalCount = 0;

  try {
    const batch = await env.DB.batch(ALL_SHEETS.map(sheet => {
      const tbl = TABLE_MAP[sheet];
      return BANK_SHEETS.includes(sheet)
        ? env.DB.prepare(`SELECT '' as receiver, COALESCE(SUM(COALESCE(income,0) - COALESCE(expense,0)), 0) as net_amount, COUNT(*) as row_count FROM "${tbl}"`)
        : env.DB.prepare(`SELECT COALESCE(receiver, 'User 1') as receiver, COALESCE(SUM(COALESCE(income,0) - COALESCE(expense,0)), 0) as net_amount, COUNT(*) as row_count FROM "${tbl}" GROUP BY COALESCE(receiver, 'User 1')`);
    }));
    batch.forEach((res, idx) => {
      const sheet = ALL_SHEETS[idx];
      (res.results || []).forEach(row => {
        const receiver = str(row.receiver);
        const amount = parseFloat(row.net_amount) || 0;
        totalCount += parseInt(row.row_count, 10) || 0;
        if (BANK_SHEETS.includes(sheet)) { fundSummary[sheet].bankBalance += amount; totalBank += amount; }
        else {
          if (receiver.includes('User 2') || receiver.includes('User2')) fundSummary[sheet].user2Balance += amount;
          else if (receiver.includes('User 3') || receiver.includes('User3')) fundSummary[sheet].user3Balance += amount;
          else fundSummary[sheet].user1Balance += amount;
          totalCash += amount;
        }
        fundSummary[sheet].totalBalance += amount;
        totalFund += amount;
      });
    });
  } catch (e) { console.error('[Dashboard Fund]', e); }

  let padethaSummary = [];
  try {
    const defs = [
      ['2Meal Book', 'ဆွမ်းပဒေသာပင် စာအုပ်'], ['5Electronic Book', 'လျှပ်စစ်ပဒေသာပင် စာအုပ်'],
      ['6Medical Book', 'ဆေးပဒေသာပင် စာအုပ်'], ['7Other Book', 'အထွေထွေရန်ပုံငွေစာအုပ်'],
    ];
    const res = await env.DB.batch(defs.map(([t]) => env.DB.prepare(`SELECT COALESCE(SUM(COALESCE(income,0)),0) as income, COALESCE(SUM(COALESCE(expense,0)),0) as expense FROM "${t}"`)));
    padethaSummary = defs.map(([table_name, title], i) => {
      const r = res[i].results?.[0] || {};
      const income = parseFloat(r.income) || 0, expense = parseFloat(r.expense) || 0;
      return { table_name, title, income, expense, balance: income - expense };
    });
  } catch (e) { console.error('[Dashboard Padetha]', e); }

  const resident = {}, retreat = {};
  YOGI_CATS.forEach(k => { resident[k] = { male: 0, female: 0, total: 0 }; retreat[k] = { male: 0, female: 0, total: 0 }; });
  try {
    const [p, k] = await env.DB.batch([
      env.DB.prepare(`SELECT yogi_type, name, gender FROM "Permanent Yogi" WHERE (end_date IS NULL OR end_date = '' OR end_date = '-')`),
      env.DB.prepare(`SELECT yogi_type, name, gender FROM "Camp Yogi" WHERE (end_date IS NULL OR end_date = '' OR end_date = '-')`),
    ]);
    const add = (rows, target) => (rows || []).forEach(row => {
      let type = str(row.yogi_type);
      if (!YOGI_CATS.includes(type)) type = 'လူပုဂ္ဂိုလ်';
      const t = target[type];
      if (str(row.gender) === 'မ') t.female++; else t.male++;
      t.total++;
    });
    add(p.results, resident); add(k.results, retreat);
  } catch (e) { console.error('[Dashboard Yogi]', e); }

  return c.J({ success: true, kpis: { totalFund, totalBank, totalCash, totalCount }, fundSummary, padethaSummary, yogiSummary: { resident, retreat } });
}

// -------------------------------------------------------------------
// ROUTE HANDLER
// -------------------------------------------------------------------
async function route(c) {
  const { env, path, method } = c;

  if (path === '/api/login' && method === 'POST') return handleLogin(c);

  c.user = await verifyToken(env, c.request);
  if (!c.user) throw new HttpError(401, 'Unauthorized: Login ပြန်လည်ဝင်ရောက်ပေးပါခင်ဗျာ။');

  if (method !== 'GET' && isViewer(c.user)) throw new HttpError(403, 'ကြည့်ရှုခွင့်သာ ရှိသောကြောင့် ပြင်ဆင်ခွင့် မရှိပါ။');

  if (path === '/api/home-summary' && method === 'GET') return handleHomeSummary(c);
  if (path === '/api/entries') return handleEntries(c);
  if (path === '/api/transfer') return handleTransfer(c);

  // Fallback forwarders to previous module functions (Inventory, Yogi, Report)
  if (path === '/api/inventory') {
    const { results } = await env.DB.prepare(`SELECT * FROM "Inventory" ORDER BY date ASC, id ASC`).all();
    return c.J({ success: true, data: results || [] });
  }
  if (path.startsWith('/api/yogi')) {
    const raw = c.url.searchParams.get('sheet') || '12Yogi';
    const table = resolveYogiTable(raw);
    const { results } = await env.DB.prepare(`SELECT * FROM "${table}" ORDER BY start_date ASC, id ASC`).all();
    return c.J({ success: true, data: results || [] });
  }

  throw new HttpError(404, 'Endpoint not found');
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const J = (data, status = 200) => new Response(JSON.stringify(data), {
      status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' },
    });
    const url = new URL(request.url);
    try {
      return await route({ request, env, url, path: url.pathname, method: request.method, J, user: null });
    } catch (err) {
      if (err instanceof HttpError) return J({ success: false, error: err.message }, err.status);
      return J({ success: false, error: err.message || 'Internal server error' }, 500);
    }
  },
};// ===================================================================
// SĀSANA ERP - CLOUDFLARE WORKER API (worker.js) — v5.0 (Universal Transfer)
// ===================================================================

const PBKDF2_ITER = 100000;
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TRF_RE = /^(TRF_.+)_(OUT|IN)$/;
const LEGACY_ID_RE = /^(?:CB|INV|YOGI)-(\d+)$/;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const enc = new TextEncoder();
const dec = new TextDecoder();

const getSecret = (env) => env.AUTH_SECRET || 'SASANA_DEFAULT_SECRET_KEY_2026_!@#';

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const TABLE_MAP = {
  '1CB': '1CB Bank (General)', '2CB': '2CB Bank (Meal)', '3CB': '3CB Bank (UZ)',
  '4GB': '1General Book', '5FB': '2Meal Book', '6HB': '3Hall Book', '7PB': '4Pagoda Book',
  '8EB': '5Electronic Book', '9MB': '6Medical Book', '10GB': '7Other Book',
};
['1CB Bank (General)', '2CB Bank (Meal)', '3CB Bank (UZ)', '1General Book', '2Meal Book',
  '3Hall Book', '4Pagoda Book', '5Electronic Book', '6Medical Book', '7Other Book']
  .forEach(t => { TABLE_MAP[t] = t; });

const LEDGER_TABLES = [...new Set(Object.values(TABLE_MAP))];
const BANK_TABLES = new Set(['1CB Bank (General)', '2CB Bank (Meal)', '3CB Bank (UZ)']);
const ALL_SHEETS = ['1CB', '2CB', '3CB', '4GB', '5FB', '6HB', '7PB', '8EB', '9MB', '10GB'];
const BANK_SHEETS = ['1CB', '2CB', '3CB'];
const USERS = ['User 1', 'User 2', 'User 3'];
const YOGI_CATS = ['ရဟန်း', 'ကိုရင်', 'သီလရှင်', 'လူပုဂ္ဂိုလ်', 'ဝေယျာဝိစ္စ'];

const str = (v, d = '') => (v === null || v === undefined) ? d : String(v).trim();
const num = (v) => { const n = parseFloat(String(v ?? '').replace(/,/g, '')); return Number.isFinite(n) ? n : 0; };
const todayMM = () => new Date(Date.now() + 6.5 * 3600 * 1000).toISOString().slice(0, 10);

function formatMonthYear(dateStr) {
  const m = /^(\d{4})-(\d{2})/.exec(String(dateStr || ''));
  if (!m) return dateStr ? String(dateStr) : '-';
  return `${MONTHS[+m[2] - 1] || m[2]}-${m[1].slice(2)}`;
}

function ledgerTable(raw) {
  const t = TABLE_MAP[str(raw)];
  if (!t) throw new HttpError(400, `Unknown or missing sheet: "${str(raw)}"`);
  return t;
}

function resolveYogiTable(s) {
  const v = str(s);
  return (v === '13Yogi' || v === 'Camp Yogi' || v.includes('စခန်းဝင်')) ? 'Camp Yogi' : 'Permanent Yogi';
}

async function readJson(request) {
  try {
    const b = await request.json();
    if (b && typeof b === 'object') return b;
  } catch (_) { }
  throw new HttpError(400, 'Invalid JSON body');
}

function parseKey(body, params) {
  const pick = (k) => body?.[k] ?? params?.get(k) ?? null;
  const uid = str(pick('unique_id') ?? pick('uniqueId'));
  if (uid) {
    const m = LEGACY_ID_RE.exec(uid);
    return m ? { id: +m[1] } : { uid };
  }
  const id = parseInt(pick('id'), 10);
  return Number.isInteger(id) ? { id } : null;
}
const keyWhere = (k) => (k.uid ? ['unique_id = ?', k.uid] : ['id = ?', k.id]);

// Crypto Helpers
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64uToBytes = (s) => {
  let t = s.replace(/-/g, '+').replace(/_/g, '/');
  while (t.length % 4) t += '=';
  return Uint8Array.from(atob(t), c => c.charCodeAt(0));
};
function safeEqual(a, b) {
  a = String(a); b = String(b);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

async function hashPassword(pw, salt = crypto.getRandomValues(new Uint8Array(16)), iter = PBKDF2_ITER) {
  const key = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, key, 256);
  return `pbkdf2$${iter}$${b64u(salt)}$${b64u(bits)}`;
}

async function verifyPassword(pw, stored) {
  if (stored.startsWith('pbkdf2$')) {
    const [, iter, salt] = stored.split('$');
    const calc = await hashPassword(pw, b64uToBytes(salt), parseInt(iter, 10));
    return { ok: safeEqual(calc, stored), upgrade: false };
  }
  return { ok: stored !== '' && safeEqual(pw, stored), upgrade: true };
}

const hmacKey = (secret) => crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);

async function signToken(env, payload) {
  const body = b64u(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(getSecret(env)), enc.encode(body));
  return `tok_${body}.${b64u(sig)}`;
}

async function verifyToken(env, request) {
  try {
    const h = request.headers.get('Authorization') || '';
    if (!h.startsWith('Bearer tok_')) return null;
    const [body, sig] = h.slice(11).trim().split('.');
    if (!body || !sig) return null;
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(getSecret(env)), b64uToBytes(sig), enc.encode(body));
    if (!ok) return null;
    const p = JSON.parse(dec.decode(b64uToBytes(body)));
    return p.exp > Date.now() ? p : null;
  } catch (_) { return null; }
}

const isViewer = (user) => String(user.r || '').toLowerCase() === 'viewer';

function corsHeaders(request, env) {
  const allowed = String(env.ALLOWED_ORIGIN || '*').split(',').map(s => s.trim()).filter(Boolean);
  const origin = request.headers.get('Origin') || '';
  const allow = allowed.includes('*') ? '*' : (allowed.includes(origin) ? origin : allowed[0]);
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function normLedger(b, table) {
  const date = str(b.entry_date || b.date, todayMM()).slice(0, 10);
  if (!DATE_RE.test(date)) throw new HttpError(400, 'Invalid date (YYYY-MM-DD)');
  let title = str(b.title || b.category);
  const sub_title = str(b.sub_title ?? b.subcategory);
  let income = num(b.income), expense = num(b.expense);
  if (b.amount != null && !income && !expense) {
    const a = num(b.amount);
    if (title === 'ထွက်ငွေ' || title === 'စာရင်းပြောင်း') expense = a; else income = a;
  }
  if (income < 0 || expense < 0) throw new HttpError(400, 'Amount must not be negative');
  if (!title) title = income > 0 ? 'ဝင်ငွေ' : 'ထွက်ငွေ';
  return {
    date, title, sub_title,
    description: str(b.description) || sub_title || title || 'စာရင်းထည့်သွင်းခြင်း',
    income, expense,
    voucher_no: str(b.voucher_no),
    receiver: BANK_TABLES.has(table) ? 'Bank' : (str(b.receiver) || 'User 1'),
    month_year: formatMonthYear(date),
    book_name: table,
    unique_id: str(b.unique_id ?? b.uniqueId) || crypto.randomUUID(),
  };
}

function upsertStmt(env, table, row) {
  const keys = Object.keys(row);
  const upd = keys.filter(k => k !== 'unique_id').map(k => `"${k}" = excluded."${k}"`)
    .concat(`updated_at = datetime('now')`).join(', ');
  return env.DB.prepare(
    `INSERT INTO "${table}" (${keys.map(k => `"${k}"`).join(', ')}) VALUES (${keys.map(() => '?').join(', ')}) ` +
    `ON CONFLICT(unique_id) DO UPDATE SET ${upd}`
  ).bind(...keys.map(k => row[k]));
}

function updateStmt(env, table, row, key) {
  const keys = Object.keys(row).filter(k => k !== 'unique_id' && k !== 'book_name');
  const [where, val] = keyWhere(key);
  return env.DB.prepare(
    `UPDATE "${table}" SET ${keys.map(k => `"${k}" = ?`).join(', ')}, updated_at = datetime('now') WHERE ${where}`
  ).bind(...keys.map(k => row[k]), val);
}

const changes = (r) => r?.meta?.changes ?? 0;

async function deleteTransferGroup(env, gid) {
  const ids = [`${gid}_OUT`, `${gid}_IN`];
  const res = await env.DB.batch(LEDGER_TABLES.map(t =>
    env.DB.prepare(`DELETE FROM "${t}" WHERE unique_id IN (?, ?)`).bind(...ids)));
  return res.reduce((s, r) => s + changes(r), 0);
}

// 🌟 စာအုပ်အလိုက် စဉ် (no) အား အစဉ်လိုက် သဘာဝကျစွာ ထုတ်ပေးခြင်း
async function queryBook(env, table, rawSheet) {
  const { results } = await env.DB.prepare(`SELECT * FROM "${table}" ORDER BY date ASC, id ASC`).all();
  const rows = results || [];
  let running = 0, totalIncome = 0, totalExpense = 0;
  const data = rows.map((row, idx) => {
    const inc = parseFloat(row.income) || 0, exp = parseFloat(row.expense) || 0;
    totalIncome += inc; totalExpense += exp; running += inc - exp;
    const uid = row.unique_id || `CB-${row.id}`;
    return {
      id: row.id,
      no: idx + 1, // 🌟 စာအုပ်၏ စဉ်နံပါတ် အစဉ်လိုက် အမှန်ဖြစ်စေခြင်း
      uniqueId: uid, unique_id: uid,
      sheet_name: rawSheet, date: row.date, entry_date: row.date,
      category: row.title || (inc > 0 ? 'ဝင်ငွေ' : 'ထွက်ငွေ'), title: row.title || '',
      subcategory: row.sub_title || '-', sub_title: row.sub_title || '',
      voucher_no: row.voucher_no || '', description: row.description || '', receiver: row.receiver || '',
      income: inc, expense: exp, balance: running,
      month_year: row.month_year || formatMonthYear(row.date), book_name: row.book_name || table,
    };
  });
  return { success: true, book: table, data, kpis: { totalIncome, totalExpense, balance: running, count: rows.length } };
}

// 🌟 UNIVERSAL TRANSFER BUILDER (စာအုပ်အားလုံး၊ ဘဏ်အားလုံး၊ User အားလုံး လွှဲပြောင်းနိုင်စေခြင်း)
function buildTransfer(b, src) {
  const date = str(b.entry_date || b.date, todayMM()).slice(0, 10);
  if (!DATE_RE.test(date)) throw new HttpError(400, 'Invalid date (YYYY-MM-DD)');
  const amt = num(b.amount);
  if (!(amt > 0)) throw new HttpError(400, 'amount must be greater than 0');

  const fromUid = TRF_RE.exec(str(b.unique_id));
  const gid = str(b.group_id) || (fromUid && fromUid[1]) || `TRF_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  const sender = BANK_TABLES.has(src) ? 'Bank' : (str(b.receiver) || 'User 1');
  const target = str(b.target || b.sub_title);
  const voucher_no = str(b.voucher_no), month_year = formatMonthYear(date);

  const mk = (table, suffix, o) => [table, {
    date, voucher_no, month_year, book_name: table, unique_id: `${gid}_${suffix}`,
    title: 'စာရင်းပြောင်း', income: 0, expense: 0, ...o,
  }];

  // ၁။ User အချင်းချင်း လွှဲပြောင်းခြင်း (User 1, 2, 3)
  const targetUser = USERS.find(u => target.includes(u));
  if (targetUser && !target.includes('Bank') && !target.includes('ဘဏ်')) {
    if (targetUser === sender && !BANK_TABLES.has(src)) {
      throw new HttpError(400, 'Sender and target user must differ');
    }
    return { gid, rows: [
      mk(src, 'OUT', { sub_title: `${targetUser} သို့ လွှဲပြောင်း`, description: str(b.description) || `${targetUser} ထံ စာရင်းပြောင်း ပေးပို့ခြင်း`, expense: amt, receiver: sender }),
      mk(src, 'IN', { sub_title: `${sender} ထံမှ လွှဲပြောင်းရရှိ`, description: str(b.description) ? `${str(b.description)} (ရရှိ)` : `${sender} ထံမှ စာရင်းပြောင်း ရရှိခြင်း`, income: amt, receiver: targetUser }),
    ] };
  }

  // ၂။ သတ်မှတ်ထားသော Target Bank သို့ လွှဲပြောင်းခြင်း (Bank Deposit / Bank to Bank)
  let targetBank = [...BANK_TABLES].find(bTbl => target.includes(bTbl) || target.includes(bTbl.split(' ')[0]));
  if (!targetBank && (target.includes('1CB') || target.includes('အထွေထွေ'))) targetBank = '1CB Bank (General)';
  if (!targetBank && (target.includes('2CB') || target.includes('ဆွမ်း'))) targetBank = '2CB Bank (Meal)';
  if (!targetBank && (target.includes('3CB') || target.includes('ဦးဇင်း') || target.includes('တစ်ဦးတည်း'))) targetBank = '3CB Bank (UZ)';
  if (!targetBank) targetBank = '1CB Bank (General)';

  if (BANK_TABLES.has(src)) {
    // ဘဏ်မှ အခြားဘဏ် သို့မဟုတ် ဘဏ်မှ ငွေထုတ်ယူခြင်း
    if (targetBank === src) {
      // ဘဏ်မှ User ထံသို့ ငွေထုတ်ပေးခြင်း
      const destUser = targetUser || 'User 1';
      return { gid, rows: [
        mk(src, 'OUT', { title: 'ဘဏ်ထုတ်ငွေ', sub_title: `${destUser} သို့ ထုတ်ပေး`, description: str(b.description) || `${destUser} သို့ အသုံးစရိတ်ငွေ ထုတ်ပေးခြင်း`, expense: amt, receiver: 'Bank' }),
        mk('1General Book', 'IN', { sub_title: `${src} မှ ထုတ်ယူရရှိ`, description: str(b.description) || `${src} မှ အသုံးစရိတ်ငွေ ထုတ်ယူခြင်း`, income: amt, receiver: destUser }),
      ] };
    } else {
      // ဘဏ်အချင်းချင်း လွှဲပြောင်းခြင်း (Bank to Bank)
      return { gid, rows: [
        mk(src, 'OUT', { sub_title: `${targetBank} သို့ လွှဲပြောင်း`, description: str(b.description) || `${targetBank} သို့ ဘဏ်စာရင်းပြောင်း လွှဲပို့ခြင်း`, expense: amt, receiver: 'Bank' }),
        [targetBank, { ...mk(targetBank, 'IN', {})[1], title: 'စာရင်းပြောင်း', sub_title: `${src} မှ လွှဲပြောင်းရရှိ`, description: `${src} မှ စာရင်းပြောင်း ရရှိခြင်း`, income: amt, receiver: 'Bank' }],
      ] };
    }
  }

  // စာအုပ်များမှ ဘဏ်သို့ အပ်နှံခြင်း (Book to Bank Deposit)
  return { gid, rows: [
    mk(src, 'OUT', { sub_title: 'ဘဏ်အပ်နှံခြင်း', description: str(b.description) || `${targetBank} သို့ ဘဏ်အပ်နှံခြင်း`, expense: amt, receiver: sender }),
    [targetBank, { ...mk(targetBank, 'IN', {})[1], title: 'ဘဏ်အပ်ငွေ', sub_title: 'ဘဏ်အပ်နှံခြင်း', description: `${src} [${sender}] မှ ဘဏ်အပ်ငွေ ရရှိခြင်း`, income: amt, receiver: 'Bank' }],
  ] };
}

async function handleTransfer(c) {
  const { url, method, env } = c;
  if (method === 'DELETE') {
    const m = TRF_RE.exec(str(url.searchParams.get('unique_id')));
    const gid = str(url.searchParams.get('group_id')) || (m && m[1]);
    if (!gid) throw new HttpError(400, 'group_id required');
    return c.J({ success: true, deleted: await deleteTransferGroup(env, gid) });
  }
  if (method !== 'POST' && method !== 'PUT') throw new HttpError(405, 'Method not allowed');

  const b = await readJson(c.request);
  const src = ledgerTable(url.searchParams.get('sheet') || b.sheet_name || b.sheet_code || b.book_name);
  const { gid, rows } = buildTransfer(b, src);

  const stmts = [];
  if (method === 'PUT' || str(b.unique_id).includes('TRF_')) {
    // မူရင်း Transfer အဟောင်းနှစ်ခုလုံးကို ရှင်းလင်းပြီးမှ အသစ်ပြန်သွင်းသည်
    LEDGER_TABLES.forEach(t => stmts.push(env.DB.prepare(`DELETE FROM "${t}" WHERE unique_id IN (?, ?)`).bind(`${gid}_OUT`, `${gid}_IN`)));
  }
  rows.forEach(([t, row]) => stmts.push(upsertStmt(env, t, row)));
  await env.DB.batch(stmts);
  return c.J({ success: true, group_id: gid, unique_id: `${gid}_OUT` });
}

async function handleEntries(c) {
  const { url, method, env } = c;
  const sheetParam = url.searchParams.get('sheet') || url.searchParams.get('book');

  if (method === 'GET') {
    const raw = sheetParam || '1CB';
    return c.J(await queryBook(env, ledgerTable(raw), raw));
  }

  const body = (method === 'POST' || method === 'PUT') ? await readJson(c.request) : null;
  const table = ledgerTable(sheetParam || body?.sheet_name || body?.sheet_code || body?.book_name);

  if (method === 'POST') {
    const row = normLedger(body, table);
    await upsertStmt(env, table, row).run();
    return c.J({ success: true, unique_id: row.unique_id });
  }

  const key = parseKey(body, url.searchParams);
  if (!key) throw new HttpError(400, 'unique_id or id required');

  // 🌟 (၁) လက်ခံစာအုပ် (`_IN`) မှ Edit/Delete တိုက်ရိုက်လုပ်ဆောင်ခြင်းအား တားဆီးခြင်း
  if (key.uid && key.uid.endsWith('_IN')) {
    throw new HttpError(400, 'ဤစာရင်းသည် လက်ခံစာရင်း (Incoming Transfer) ဖြစ်သောကြောင့် မူရင်းလွှဲပို့သည့် စာအုပ်မှသာ ပြင်ဆင်/ဖျက်ပစ်နိုင်ပါသည်ခင်ဗျာ။');
  }

  if (method === 'PUT') {
    if (key.uid && TRF_RE.test(key.uid)) {
      // Transfer ဖြစ်ပါက handleTransfer logic သို့ လွှဲပေးသည်
      const { gid, rows } = buildTransfer(body, table);
      const stmts = [];
      LEDGER_TABLES.forEach(t => stmts.push(env.DB.prepare(`DELETE FROM "${t}" WHERE unique_id IN (?, ?)`).bind(`${gid}_OUT`, `${gid}_IN`)));
      rows.forEach(([t, row]) => stmts.push(upsertStmt(env, t, row)));
      await env.DB.batch(stmts);
      return c.J({ success: true, group_id: gid });
    }
    const r = await updateStmt(env, table, normLedger({ ...body, unique_id: key.uid }, table), key).run();
    if (!changes(r)) throw new HttpError(404, 'Entry not found in this book');
    return c.J({ success: true });
  }

  if (method === 'DELETE') {
    const trf = key.uid && TRF_RE.exec(key.uid);
    if (trf) {
      return c.J({ success: true, deleted: await deleteTransferGroup(env, trf[1]) });
    }
    const [where, val] = keyWhere(key);
    const r = await env.DB.prepare(`DELETE FROM "${table}" WHERE ${where}`).bind(val).run();
    return c.J({ success: true, deleted: changes(r) });
  }
  throw new HttpError(405, 'Method not allowed');
}

// -------------------------------------------------------------------
// STANDARD ROUTERS (Login, Yogi, Inventory, Summary, Report)
// -------------------------------------------------------------------
async function handleLogin(c) {
  const b = await readJson(c.request);
  const username = str(b.username), password = str(b.password);
  if (!username || !password) throw new HttpError(400, 'Username and password required');

  const row = await c.env.DB.prepare(`SELECT id, username, password, role, name FROM users WHERE username = ? LIMIT 1`).bind(username).first();
  const check = row ? await verifyPassword(password, String(row.password || '')) : { ok: false };
  if (!check.ok) throw new HttpError(401, 'အသုံးပြုသူအမည် သို့မဟုတ် လျှို့ဝှက်နံပါတ် မှားယွင်းနေပါသည်။');

  if (check.upgrade) {
    await c.env.DB.prepare(`UPDATE users SET password = ? WHERE id = ?`).bind(await hashPassword(password), row.id).run();
  }
  const role = row.role || 'Staff';
  const token = await signToken(c.env, { uid: row.id, u: row.username, r: role, exp: Date.now() + TOKEN_TTL_MS });
  return c.J({ success: true, token, user: { id: row.id, username: row.username, role, name: row.name || row.username }, expiresInMs: TOKEN_TTL_MS });
}

async function handleHomeSummary(c) {
  const { env } = c;
  const fundSummary = {};
  ALL_SHEETS.forEach(s => { fundSummary[s] = { bankBalance: 0, user1Balance: 0, user2Balance: 0, user3Balance: 0, totalBalance: 0 }; });
  let totalFund = 0, totalBank = 0, totalCash = 0, totalCount = 0;

  try {
    const batch = await env.DB.batch(ALL_SHEETS.map(sheet => {
      const tbl = TABLE_MAP[sheet];
      return BANK_SHEETS.includes(sheet)
        ? env.DB.prepare(`SELECT '' as receiver, COALESCE(SUM(COALESCE(income,0) - COALESCE(expense,0)), 0) as net_amount, COUNT(*) as row_count FROM "${tbl}"`)
        : env.DB.prepare(`SELECT COALESCE(receiver, 'User 1') as receiver, COALESCE(SUM(COALESCE(income,0) - COALESCE(expense,0)), 0) as net_amount, COUNT(*) as row_count FROM "${tbl}" GROUP BY COALESCE(receiver, 'User 1')`);
    }));
    batch.forEach((res, idx) => {
      const sheet = ALL_SHEETS[idx];
      (res.results || []).forEach(row => {
        const receiver = str(row.receiver);
        const amount = parseFloat(row.net_amount) || 0;
        totalCount += parseInt(row.row_count, 10) || 0;
        if (BANK_SHEETS.includes(sheet)) { fundSummary[sheet].bankBalance += amount; totalBank += amount; }
        else {
          if (receiver.includes('User 2') || receiver.includes('User2')) fundSummary[sheet].user2Balance += amount;
          else if (receiver.includes('User 3') || receiver.includes('User3')) fundSummary[sheet].user3Balance += amount;
          else fundSummary[sheet].user1Balance += amount;
          totalCash += amount;
        }
        fundSummary[sheet].totalBalance += amount;
        totalFund += amount;
      });
    });
  } catch (e) { console.error('[Dashboard Fund]', e); }

  let padethaSummary = [];
  try {
    const defs = [
      ['2Meal Book', 'ဆွမ်းပဒေသာပင် စာအုပ်'], ['5Electronic Book', 'လျှပ်စစ်ပဒေသာပင် စာအုပ်'],
      ['6Medical Book', 'ဆေးပဒေသာပင် စာအုပ်'], ['7Other Book', 'အထွေထွေရန်ပုံငွေစာအုပ်'],
    ];
    const res = await env.DB.batch(defs.map(([t]) => env.DB.prepare(`SELECT COALESCE(SUM(COALESCE(income,0)),0) as income, COALESCE(SUM(COALESCE(expense,0)),0) as expense FROM "${t}"`)));
    padethaSummary = defs.map(([table_name, title], i) => {
      const r = res[i].results?.[0] || {};
      const income = parseFloat(r.income) || 0, expense = parseFloat(r.expense) || 0;
      return { table_name, title, income, expense, balance: income - expense };
    });
  } catch (e) { console.error('[Dashboard Padetha]', e); }

  const resident = {}, retreat = {};
  YOGI_CATS.forEach(k => { resident[k] = { male: 0, female: 0, total: 0 }; retreat[k] = { male: 0, female: 0, total: 0 }; });
  try {
    const [p, k] = await env.DB.batch([
      env.DB.prepare(`SELECT yogi_type, name, gender FROM "Permanent Yogi" WHERE (end_date IS NULL OR end_date = '' OR end_date = '-')`),
      env.DB.prepare(`SELECT yogi_type, name, gender FROM "Camp Yogi" WHERE (end_date IS NULL OR end_date = '' OR end_date = '-')`),
    ]);
    const add = (rows, target) => (rows || []).forEach(row => {
      let type = str(row.yogi_type);
      if (!YOGI_CATS.includes(type)) type = 'လူပုဂ္ဂိုလ်';
      const t = target[type];
      if (str(row.gender) === 'မ') t.female++; else t.male++;
      t.total++;
    });
    add(p.results, resident); add(k.results, retreat);
  } catch (e) { console.error('[Dashboard Yogi]', e); }

  return c.J({ success: true, kpis: { totalFund, totalBank, totalCash, totalCount }, fundSummary, padethaSummary, yogiSummary: { resident, retreat } });
}

// -------------------------------------------------------------------
// ROUTE HANDLER
// -------------------------------------------------------------------
async function route(c) {
  const { env, path, method } = c;

  if (path === '/api/login' && method === 'POST') return handleLogin(c);

  c.user = await verifyToken(env, c.request);
  if (!c.user) throw new HttpError(401, 'Unauthorized: Login ပြန်လည်ဝင်ရောက်ပေးပါခင်ဗျာ။');

  if (method !== 'GET' && isViewer(c.user)) throw new HttpError(403, 'ကြည့်ရှုခွင့်သာ ရှိသောကြောင့် ပြင်ဆင်ခွင့် မရှိပါ။');

  if (path === '/api/home-summary' && method === 'GET') return handleHomeSummary(c);
  if (path === '/api/entries') return handleEntries(c);
  if (path === '/api/transfer') return handleTransfer(c);

  // Fallback forwarders to previous module functions (Inventory, Yogi, Report)
  if (path === '/api/inventory') {
    const { results } = await env.DB.prepare(`SELECT * FROM "Inventory" ORDER BY date ASC, id ASC`).all();
    return c.J({ success: true, data: results || [] });
  }
  if (path.startsWith('/api/yogi')) {
    const raw = c.url.searchParams.get('sheet') || '12Yogi';
    const table = resolveYogiTable(raw);
    const { results } = await env.DB.prepare(`SELECT * FROM "${table}" ORDER BY start_date ASC, id ASC`).all();
    return c.J({ success: true, data: results || [] });
  }

  throw new HttpError(404, 'Endpoint not found');
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const J = (data, status = 200) => new Response(JSON.stringify(data), {
      status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' },
    });
    const url = new URL(request.url);
    try {
      return await route({ request, env, url, path: url.pathname, method: request.method, J, user: null });
    } catch (err) {
      if (err instanceof HttpError) return J({ success: false, error: err.message }, err.status);
      return J({ success: false, error: err.message || 'Internal server error' }, 500);
    }
  },
};

