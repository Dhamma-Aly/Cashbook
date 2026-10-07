// ===================================================================
// SĀSANA ERP - CLOUDFLARE WORKER API (worker.js) — v5.3 (Report Bank Deposit Fix)
// ===================================================================

const PBKDF2_ITER = 100000;
const TOKEN_TTL_MS = 365 * 24 * 60 * 60 * 1000;
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

// -------------------------------------------------------------------
// Row normalizers
// -------------------------------------------------------------------
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
  const no = parseInt(b.no, 10);
  const balance = b.balance !== undefined ? num(b.balance) : 0;

  return {
    ...(Number.isInteger(no) ? { no } : {}),
    date, title, sub_title,
    description: str(b.description) || sub_title || title || 'စာရင်းထည့်သွင်းခြင်း',
    income, expense,
    balance,
    voucher_no: str(b.voucher_no),
    receiver: BANK_TABLES.has(table) ? 'Bank' : (str(b.receiver) || 'User 1'),
    month_year: formatMonthYear(date),
    book_name: table,
    unique_id: str(b.unique_id ?? b.uniqueId) || crypto.randomUUID(),
  };
}

function normInventory(b) {
  const description = str(b.description || b.item_name || b.item_desc);
  if (!description) throw new HttpError(400, 'description is required');
  const date = str(b.entry_date || b.date, todayMM()).slice(0, 10);
  if (!DATE_RE.test(date)) throw new HttpError(400, 'Invalid date (YYYY-MM-DD)');
  const no = parseInt(b.no, 10);

  return {
    ...(Number.isInteger(no) ? { no } : {}),
    date, description,
    location: str(b.location) || 'စတို',
    category: str(b.category) || 'အထွေထွေ',
    unit: str(b.unit) || 'ခု',
    qty: num(b.qty),
    remark: str(b.remark ?? b.note),
    month_year: date.slice(0, 7),
    book_name: 'Inventory',
    unique_id: str(b.unique_id ?? b.uniqueId) || `INV-${crypto.randomUUID()}`,
  };
}

function normYogi(b, table) {
  const name = str(b.name);
  if (!name) throw new HttpError(400, 'name is required');
  const no = parseInt(b.no, 10);

  return {
    ...(Number.isInteger(no) ? { no } : {}),
    start_date: str(b.start_date) || todayMM(),
    end_date: str(b.end_date),
    yogi_type: str(b.yogi_type || b.category) || (table === 'Camp Yogi' ? 'စခန်းဝင်' : 'အမြဲနေ'),
    name,
    father_name: str(b.father_name),
    nrc: str(b.nrc || b.full_nrc),
    dob: str(b.dob),
    age: parseInt(b.age, 10) || 0,
    gender: str(b.gender) || 'ကျား',
    yogi_phone: str(b.yogi_phone || b.phone),
    home_phone: str(b.home_phone),
    address: str(b.address),
    unique_id: str(b.unique_id ?? b.uniqueId) || `YOGI-${crypto.randomUUID()}`,
  };
}
const NORM = { ledger: normLedger, inventory: normInventory, yogi: normYogi };

// -------------------------------------------------------------------
// SQL builders
// -------------------------------------------------------------------
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

// -------------------------------------------------------------------
// Query Book
// -------------------------------------------------------------------
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
      no: idx + 1,
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

// -------------------------------------------------------------------
// Universal Transfer Builder
// -------------------------------------------------------------------
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

  let targetBank = [...BANK_TABLES].find(bTbl => target.includes(bTbl) || target.includes(bTbl.split(' ')[0]));
  if (!targetBank && (target.includes('1CB') || target.includes('အထွေထွေ'))) targetBank = '1CB Bank (General)';
  if (!targetBank && (target.includes('2CB') || target.includes('ဆွမ်း'))) targetBank = '2CB Bank (Meal)';
  if (!targetBank && (target.includes('3CB') || target.includes('ဦးဇင်း') || target.includes('တစ်ဦးတည်း'))) targetBank = '3CB Bank (UZ)';
  if (!targetBank) targetBank = '1CB Bank (General)';

  if (BANK_TABLES.has(src)) {
    if (targetBank === src) {
      const destUser = targetUser || 'User 1';
      return { gid, rows: [
        mk(src, 'OUT', { title: 'ဘဏ်ထုတ်ငွေ', sub_title: `${destUser} သို့ ထုတ်ပေး`, description: str(b.description) || `${destUser} သို့ အသုံးစရိတ်ငွေ ထုတ်ပေးခြင်း`, expense: amt, receiver: 'Bank' }),
        mk('1General Book', 'IN', { sub_title: `${src} မှ ထုတ်ယူရရှိ`, description: str(b.description) || `${src} မှ အသုံးစရိတ်ငွေ ထုတ်ယူခြင်း`, income: amt, receiver: destUser }),
      ] };
    } else {
      return { gid, rows: [
        mk(src, 'OUT', { sub_title: `${targetBank} သို့ လွှဲပြောင်း`, description: str(b.description) || `${targetBank} သို့ ဘဏ်စာရင်းပြောင်း လွှဲပို့ခြင်း`, expense: amt, receiver: 'Bank' }),
        [targetBank, { ...mk(targetBank, 'IN', {})[1], title: 'စာရင်းပြောင်း', sub_title: `${src} မှ လွှဲပြောင်းရရှိ`, description: `${src} မှ စာရင်းပြောင်း ရရှိခြင်း`, income: amt, receiver: 'Bank' }],
      ] };
    }
  }

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

  if (key.uid && key.uid.endsWith('_IN')) {
    throw new HttpError(400, 'ဤစာရင်းသည် လက်ခံစာရင်း (Incoming Transfer) ဖြစ်သောကြောင့် မူရင်းလွှဲပို့သည့် စာအုပ်မှသာ ပြင်ဆင်/ဖျက်ပစ်နိုင်ပါသည်ခင်ဗျာ။');
  }

  if (method === 'PUT') {
    if (key.uid && TRF_RE.test(key.uid)) {
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
// GOOGLE SHEETS BULK IMPORT (Clean & Batch Overwrite)
// -------------------------------------------------------------------
async function handleBulkImport(c) {
  const { env } = c;
  const b = await readJson(c.request);
  const rawTable = str(b.table);
  const clearExisting = b.clearExisting === true;
  const rawRows = Array.isArray(b.rows) ? b.rows : [];

  let table, kind;
  if (TABLE_MAP[rawTable]) {
    table = TABLE_MAP[rawTable];
    kind = 'ledger';
  } else if (rawTable === 'Inventory') {
    table = 'Inventory';
    kind = 'inventory';
  } else if (['Permanent Yogi', 'Camp Yogi', '12Yogi', '13Yogi'].includes(rawTable)) {
    table = resolveYogiTable(rawTable);
    kind = 'yogi';
  } else {
    throw new HttpError(400, `Unknown or invalid table: "${rawTable}"`);
  }

  if (clearExisting) {
    await env.DB.prepare(`DELETE FROM "${table}"`).run();
  }

  if (rawRows.length === 0) {
    return c.J({ success: true, count: 0, table, message: 'Table cleared successfully' });
  }

  const CHUNK_SIZE = 80;
  let insertedCount = 0;

  for (let i = 0; i < rawRows.length; i += CHUNK_SIZE) {
    const slice = rawRows.slice(i, i + CHUNK_SIZE);
    const stmts = slice.map((item, idx) => {
      const rowData = { ...item };
      if (rowData.no === undefined) {
        rowData.no = i + idx + 1;
      }
      const normalized = NORM[kind](rowData, table);
      return upsertStmt(env, table, normalized);
    });

    await env.DB.batch(stmts);
    insertedCount += slice.length;
  }

  return c.J({ success: true, count: insertedCount, table });
}

// -------------------------------------------------------------------
// Formatters & Handlers
// -------------------------------------------------------------------
function formatInventory(rows) {
  let kitchen = 0, dhammaHall = 0, sim = 0, store = 0, totalQty = 0;
  const data = rows.map((row, idx) => {
    const q = parseFloat(row.qty) || 0, loc = str(row.location);
    totalQty += q;
    if (loc.includes('မီးဖို')) kitchen += q;
    else if (loc.includes('ဓမ္မာရုံ')) dhammaHall += q;
    else if (loc.includes('သိမ်')) sim += q;
    else if (loc.includes('စတို')) store += q;
    const uid = row.unique_id || `INV-${row.id}`;
    return {
      id: row.id, no: idx + 1, uniqueId: uid, unique_id: uid,
      entry_date: row.date || '', date: row.date || '', location: row.location || 'စတို',
      category: row.category || 'အထွေထွေ', description: row.description || '',
      item_name: row.description || '', item_desc: row.description || '',
      unit: row.unit || 'ခု', qty: q, remark: row.remark || '', note: row.remark || '',
      month_year: row.month_year || '', book_name: 'Inventory',
    };
  });
  return { success: true, data, kpis: { kitchen, dhammaHall, sim, store, totalQty, totalItems: rows.length } };
}

function classifyYogi(row) {
  const type = str(row.yogi_type), name = str(row.name);
  if (YOGI_CATS.includes(type)) return type;
  if (type.includes('ကိုရင်') || name.includes('ကိုရင်')) return 'ကိုရင်';
  if (type.includes('ရဟန်း') || type.includes('သံဃာ') || /အရှင်|ဆရာတော်|ဦးဇင်း|ဦးပဉ္ဇင်း/.test(name)) return 'ရဟန်း';
  if (type.includes('သီလရှင်') || /ဒေါ်လေး|ဆရာလေး/.test(name)) return 'သီလရှင်';
  if (type.includes('ဝေယျာဝိစ္စ')) return 'ဝေယျာဝိစ္စ';
  return 'လူပုဂ္ဂိုလ်';
}
const yogiActive = (row) => { const e = str(row.end_date); return e === '' || e === '-'; };

function formatYogi(rows, rawSheet, table) {
  let monks = 0, nuns = 0, males = 0, females = 0, active = 0, inactive = 0;
  const data = rows.map((row, idx) => {
    const isActive = yogiActive(row);
    const gender = str(row.gender) || 'ကျား';
    if (isActive) {
      active++;
      const cat = classifyYogi(row);
      if (cat === 'ရဟန်း' || cat === 'ကိုရင်') monks++;
      else if (cat === 'သီလရှင်') nuns++;
      else if (gender === 'မ') females++;
      else males++;
    } else inactive++;
    const uid = row.unique_id || `YOGI-${row.id}`;
    return {
      id: row.id, no: idx + 1, uniqueId: uid, unique_id: uid, sheet_type: rawSheet,
      start_date: row.start_date || '', end_date: row.end_date || '',
      yogi_type: row.yogi_type || '', category: row.yogi_type || 'လူပုဂ္ဂိုလ်',
      name: row.name, father_name: row.father_name || '', nrc: row.nrc || '', full_nrc: row.nrc || '',
      dob: row.dob || '', age: row.age || 0, gender,
      yogi_phone: row.yogi_phone || '', phone: row.yogi_phone || '',
      home_phone: row.home_phone || '', address: row.address || '',
      status: isActive ? 'Active' : 'Inactive', book_name: table,
    };
  });
  return {
    success: true, sheet: rawSheet, book: table, data,
    kpis: { totalMonks: monks, totalNuns: nuns, totalMales: males, totalFemales: females,
      totalActiveYogis: active, totalInactiveYogis: inactive, totalCount: rows.length },
  };
}

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

async function handleChangePassword(c) {
  const b = await readJson(c.request);
  const oldPw = str(b.old_password), newPw = str(b.new_password);
  if (newPw.length < 8) throw new HttpError(400, 'လျှို့ဝှက်နံပါတ်အသစ်သည် အနည်းဆုံး ၈ လုံး ရှိရမည်');
  const row = await c.env.DB.prepare(`SELECT id, password FROM users WHERE id = ?`).bind(c.user.uid).first();
  const check = row ? await verifyPassword(oldPw, String(row.password || '')) : { ok: false };
  if (!check.ok) throw new HttpError(401, 'လက်ရှိ လျှို့ဝှက်နံပါတ် မှားနေပါသည်');
  await c.env.DB.prepare(`UPDATE users SET password = ? WHERE id = ?`).bind(await hashPassword(newPw), row.id).run();
  return c.J({ success: true });
}

async function handleBootstrap(c) {
  const { env } = c;
  const [books, inv, perm, camp] = await Promise.all([
    Promise.all(ALL_SHEETS.map(code => queryBook(env, TABLE_MAP[code], code))),
    env.DB.prepare(`SELECT * FROM "Inventory" ORDER BY date ASC, id ASC`).all(),
    env.DB.prepare(`SELECT * FROM "Permanent Yogi" ORDER BY start_date ASC, id ASC`).all(),
    env.DB.prepare(`SELECT * FROM "Camp Yogi" ORDER BY start_date ASC, id ASC`).all(),
  ]);
  const booksPayload = {};
  ALL_SHEETS.forEach((code, i) => { booksPayload[code] = books[i]; });
  const invF = formatInventory(inv.results || []);
  const permF = formatYogi(perm.results || [], '12Yogi', 'Permanent Yogi');
  const campF = formatYogi(camp.results || [], '13Yogi', 'Camp Yogi');
  return c.J({
    success: true, timestamp: Date.now(), books: booksPayload,
    inventory: invF.data, inventoryKpis: invF.kpis,
    yogi: { '12Yogi': permF.data, '13Yogi': campF.data },
    yogiKpis: { '12Yogi': permF.kpis, '13Yogi': campF.kpis },
  });
}

async function handleSync(c) {
  const { env } = c;
  const body = await readJson(c.request);
  const queue = Array.isArray(body.queue) ? body.queue.slice(0, 500) : [];
  const results = [];
  for (const item of queue) {
    const uid = str(item?.unique_id);
    const qid = item?.qid ?? null;
    try {
      const action = str(item?.action).toUpperCase();
      let table, kind;
      const raw = str(item.table);
      if (TABLE_MAP[raw]) { table = TABLE_MAP[raw]; kind = 'ledger'; }
      else if (raw === 'Inventory') { table = 'Inventory'; kind = 'inventory'; }
      else if (['Permanent Yogi', 'Camp Yogi', '12Yogi', '13Yogi'].includes(raw)) {
        table = resolveYogiTable(item.data?.sheet_type || item.data?.book_name || raw); kind = 'yogi';
      } else throw new HttpError(400, `Table not allowed: ${raw}`);

      if (action === 'CREATE' || action === 'UPDATE') {
        const row = NORM[kind]({ ...(item.data || {}), unique_id: uid || item.data?.unique_id }, table);
        await upsertStmt(env, table, row).run();
        results.push({ qid, unique_id: row.unique_id, status: 'synced' });
      } else if (action === 'DELETE') {
        if (!uid) throw new HttpError(400, 'unique_id required');
        const trf = TRF_RE.exec(uid);
        if (trf) await deleteTransferGroup(env, trf[1]);
        else {
          const tables = kind === 'yogi' ? ['Permanent Yogi', 'Camp Yogi'] : [table];
          await env.DB.batch(tables.map(t => env.DB.prepare(`DELETE FROM "${t}" WHERE unique_id = ?`).bind(uid)));
        }
        results.push({ qid, unique_id: uid, status: 'deleted' });
      } else {
        throw new HttpError(400, `Unknown action: ${action}`);
      }
    } catch (e) {
      results.push({ qid, unique_id: uid, status: 'error', error: e.message });
    }
  }
  const failed = results.filter(r => r.status === 'error').length;
  return c.J({ success: true, count: results.length, failed, results });
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

async function handleInventory(c) {
  const { url, method, env } = c;
  if (method === 'GET') {
    const { results } = await env.DB.prepare(`SELECT * FROM "Inventory" ORDER BY date ASC, id ASC`).all();
    return c.J(formatInventory(results || []));
  }
  const body = (method === 'POST' || method === 'PUT') ? await readJson(c.request) : null;
  if (method === 'POST') {
    const row = normInventory(body);
    await upsertStmt(env, 'Inventory', row).run();
    return c.J({ success: true, unique_id: row.unique_id });
  }
  const key = parseKey(body, url.searchParams);
  if (!key) throw new HttpError(400, 'unique_id or id required');
  if (method === 'PUT') {
    const r = await updateStmt(env, 'Inventory', normInventory({ ...body, unique_id: key.uid }), key).run();
    if (!changes(r)) throw new HttpError(404, 'Item not found');
    return c.J({ success: true });
  }
  if (method === 'DELETE') {
    const [where, val] = keyWhere(key);
    const r = await env.DB.prepare(`DELETE FROM "Inventory" WHERE ${where}`).bind(val).run();
    return c.J({ success: true, deleted: changes(r) });
  }
  throw new HttpError(405, 'Method not allowed');
}

async function handleYogi(c) {
  const { url, method, env, path } = c;
  const sheetParam = url.searchParams.get('sheet');

  if (method === 'GET') {
    const raw = sheetParam || '12Yogi';
    const table = resolveYogiTable(raw);
    const { results } = await env.DB.prepare(`SELECT * FROM "${table}" ORDER BY start_date ASC, id ASC`).all();
    return c.J(formatYogi(results || [], raw, table));
  }

  const body = (method === 'DELETE') ? null : await readJson(c.request);
  const explicit = str(body?.sheet_type || body?.sheet || sheetParam);

  if (method === 'POST') {
    const table = resolveYogiTable(explicit || '12Yogi');
    const row = normYogi(body, table);
    await upsertStmt(env, table, row).run();
    return c.J({ success: true, unique_id: row.unique_id });
  }

  const key = parseKey(body, url.searchParams);
  if (!key) throw new HttpError(400, 'unique_id or id required');
  const tables = explicit ? [resolveYogiTable(explicit)] : ['Permanent Yogi', 'Camp Yogi'];
  const [where, val] = keyWhere(key);

  if (method === 'PUT' && (path.endsWith('/checkout') || path.endsWith('/reactivate'))) {
    const checkout = path.endsWith('/checkout');
    const end = checkout ? str(body.end_date, todayMM()) : '';
    if (checkout && !DATE_RE.test(end)) throw new HttpError(400, 'Invalid end_date (YYYY-MM-DD)');
    const res = await env.DB.batch(tables.map(t => env.DB.prepare(
      `UPDATE "${t}" SET end_date = ?, updated_at = datetime('now') WHERE ${where}`).bind(end, val)));
    if (!res.some(r => changes(r))) throw new HttpError(404, 'ယောဂီ မတွေ့ပါ');
    return c.J({ success: true });
  }

  if (method === 'PUT') {
    const table = tables[0];
    const row = normYogi({ ...body, unique_id: key.uid }, table);
    const res = await env.DB.batch(tables.map(t => updateStmt(env, t, row, key)));
    if (!res.some(r => changes(r))) throw new HttpError(404, 'ယောဂီ မတွေ့ပါ');
    return c.J({ success: true });
  }

  if (method === 'DELETE') {
    const res = await env.DB.batch(tables.map(t => env.DB.prepare(`DELETE FROM "${t}" WHERE ${where}`).bind(val)));
    return c.J({ success: true, deleted: res.reduce((s, r) => s + changes(r), 0) });
  }
  throw new HttpError(405, 'Method not allowed');
}

// -------------------------------------------------------------------
// 🌟 REPORT HANDLER (စာရင်းပြောင်း ဘဏ်အပ်နှံခြင်း အား အသုံးစရိတ်ထဲ ပေါင်းထည့်ပေးထားပါသည်)
// -------------------------------------------------------------------
const PREDEFINED_INCOME = [
  { category: 'စာရင်းဖွင့်', subcategory: 'စာရင်းဖွင့်လက်ကျန်', keywords: ['စာရင်းဖွင့်'] },
  { category: 'ဆွမ်းအလှူ', subcategory: 'အရုဏ်ဆွမ်း', keywords: ['အရုဏ်'] },
  { category: 'ဆွမ်းအလှူ', subcategory: 'နေ့ဆွမ်း', keywords: ['နေ့ဆွမ်း'] },
  { category: 'ဆွမ်းအလှူ', subcategory: 'တနေ့တာဆွမ်း', keywords: ['တနေ့တာ', 'တစ်နေ့တာ'] },
  { category: 'ဆွမ်းအလှူ', subcategory: 'အထွေထွေ', keywords: ['ဆွမ်းအလှူ အထွေထွေ'] },
  { category: 'အထွေထွေ', subcategory: 'လမ်းအလှူ', keywords: ['လမ်းအလှူ'] },
  { category: 'အထွေထွေ', subcategory: 'အခြားအလှူ', keywords: ['အခြားအလှူ'] },
  { category: 'အထွေထွေ', subcategory: 'အထွေထွေ', keywords: ['အထွေထွေ'] },
];

const PREDEFINED_EXPENSE = [
  { category: 'ဆွမ်းစရိတ်ကုန်ကျခြင်း', subcategory: 'မီးဖိုချောင်အသုံးစရိတ်', keywords: ['မီးဖို'] },
  { category: 'ဆွမ်းစရိတ်ကုန်ကျခြင်း', subcategory: 'သင်္ကန်းတရားစခန်း အသုံးစရိတ်', keywords: ['သင်္ကန်း', 'တရားစခန်း'] },
  { category: 'ဆွမ်းစရိတ်ကုန်ကျခြင်း', subcategory: 'အထွေထွေ', keywords: ['ဆွမ်းစရိတ် အထွေထွေ'] },
  { category: 'အုပ်ချုပ်မှုအသုံးစရိတ်', subcategory: 'ကျောင်းပစ္စည်းဝယ်ယူခြင်း', keywords: ['ကျောင်းပစ္စည်း', 'ပစ္စည်းဝယ်'] },
  { category: 'အုပ်ချုပ်မှုအသုံးစရိတ်', subcategory: 'ဆ/ဥ ပြုပြင်စရိတ်', keywords: ['ဆ/ဥ'] },
  { category: 'အုပ်ချုပ်မှုအသုံးစရိတ်', subcategory: 'လမ်းပြင်ဆင်စရိတ်', keywords: ['လမ်းပြင်', 'လမ်း'] },
  { category: 'အုပ်ချုပ်မှုအသုံးစရိတ်', subcategory: 'အထွေထွေအသုံးစရိတ်', keywords: ['အထွေထွေအသုံး', 'အုပ်ချုပ်မှု'] },
  { category: 'ယာဉ်အုပ်စုအသုံးစရိတ်', subcategory: 'ဆီ/ပြုပြင်/ယာဉ်မောင်း/အခြား', keywords: ['ယာဉ်'] },
  // 🌟 အသစ်ဖြည့်စွက်ချက်: စာရင်းပြောင်း (ဘဏ်အပ်နှံခြင်း) အား အသုံးစရိတ် အောက်ဆုံးတန်းတွင် သတ်မှတ်ခြင်း
  { category: 'စာရင်းပြောင်း', subcategory: 'ဘဏ်အပ်နှံခြင်း', keywords: ['ဘဏ်အပ်နှံခြင်း', 'ဘဏ်အပ်ငွေ'] },
];

const REPORT_SKIP_TITLES = new Set(['စာရင်းပြောင်း', 'ဘဏ်အပ်ငွေ', 'လွှဲပြောင်းရရှိ']);

async function handleReport(c) {
  const { url, env } = c;
  const rawSheet = url.searchParams.get('sheet') || '4GB';
  const table = ledgerTable(rawSheet);
  const targetYear = url.searchParams.get('year') || todayMM().slice(0, 4);
  if (!/^\d{4}$/.test(targetYear)) throw new HttpError(400, 'Invalid year');

  const { results } = await env.DB.prepare(
    `SELECT date, title, sub_title, COALESCE(income,0) as income, COALESCE(expense,0) as expense
     FROM "${table}" WHERE strftime('%Y', date) <= ? ORDER BY date ASC`
  ).bind(targetYear).all();

  const mk = (defs, type) => defs.map((s) => ({ type, ...s, months: Array(12).fill(0), total: 0 }));
  const incRows = mk(PREDEFINED_INCOME, 'ဝင်ငွေ');
  const expRows = mk(PREDEFINED_EXPENSE, 'ထွက်ငွေ');
  const dynInc = {}, dynExp = {};

  const find = (rows, t, st, txt) => rows.find(x => x.category === t && x.subcategory === st) || rows.find(x => x.keywords && x.keywords.some(k => txt.includes(k)));
  const add = (rows, dyn, type, fallback, t, st, txt, m, amt) => {
    const hit = find(rows, t, st, txt);
    if (hit) { hit.months[m] += amt; return; }
    const k = `${t || fallback}_${st || 'အထွေထွေ'}`;
    if (!dyn[k]) dyn[k] = { type, category: t || fallback, subcategory: st || 'အထွေထွေ', months: Array(12).fill(0), total: 0 };
    dyn[k].months[m] += amt;
  };

  let runningBalance = 0;
  const monthlyNetCurrentYear = Array(12).fill(0);
  const manualOpeningsCurrentYear = Array(12).fill(0);

  (results || []).forEach(r => {
    const t = str(r.title), st = str(r.sub_title);
    const inc = parseFloat(r.income) || 0, exp = parseFloat(r.expense) || 0;

    // 🌟 အဓိက ပြင်ဆင်ချက်: အကယ်၍ "ဘဏ်အပ်နှံခြင်း" (စာရင်းပြောင်း ထွက်ငွေ) ဖြစ်ပါက အသုံးစရိတ်ထဲ ထည့်သွင်းမည် (မကျော်ပါ)
    const isBankDepositExpense = (t === 'စာရင်းပြောင်း' || st.includes('ဘဏ်အပ်နှံခြင်း')) && st.includes('ဘဏ်အပ်နှံခြင်း') && (exp > 0);

    if (!isBankDepositExpense) {
      // ဘဏ်အပ်နှံခြင်း မဟုတ်သော User အချင်းချင်း လွှဲပြောင်းမှုများနှင့် အခြား internal transfer များကိုသာ ကျော်မည်
      if (REPORT_SKIP_TITLES.has(t) || t.includes('လွှဲပြောင်း') || st.includes('လွှဲပြောင်း') || t.includes('စာရင်းပြောင်း')) return;
    }
    
    const rYear = r.date.slice(0, 4);
    
    if (rYear < targetYear) {
      runningBalance += (inc - exp);
    } else if (rYear === targetYear) {
      const rMonth = parseInt(r.date.slice(5, 7), 10) - 1;
      monthlyNetCurrentYear[rMonth] += (inc - exp);
      
      const txt = `${t} ${st}`;
      if (t === 'စာရင်းဖွင့်' || st === 'စာရင်းဖွင့်လက်ကျန်') {
        manualOpeningsCurrentYear[rMonth] += inc;
      } else {
        if (inc > 0) add(incRows, dynInc, 'ဝင်ငွေ', 'အခြားဝင်ငွေ', t, st, txt, rMonth, inc);
      }
      if (exp > 0) add(expRows, dynExp, 'ထွက်ငွေ', 'အခြားထွက်ငွေ', t, st, txt, rMonth, exp);
    }
  });

  const openingBalances = Array(12).fill(0);
  openingBalances[0] = runningBalance;
  for(let i = 1; i < 12; i++) {
    openingBalances[i] = openingBalances[i-1] + monthlyNetCurrentYear[i-1];
  }

  const openingRow = incRows.find(r => r.category === 'စာရင်းဖွင့်' && r.subcategory === 'စာရင်းဖွင့်လက်ကျန်');
  if (openingRow) {
    for(let i = 0; i < 12; i++) {
      openingRow.months[i] = openingBalances[i] + manualOpeningsCurrentYear[i];
    }
  }

  Object.values(dynInc).forEach(x => { incRows.push(x); });
  Object.values(dynExp).forEach(x => { expRows.push(x); });

  function sortReportRows(rows, predefinedList) {
    const catOrder = [...new Set(predefinedList.map(x => x.category))];
    rows.sort((a, b) => {
      let catA = catOrder.indexOf(a.category);
      let catB = catOrder.indexOf(b.category);
      if (catA === -1) catA = 999;
      if (catB === -1) catB = 999;
      if (catA !== catB) return catA - catB;
      
      let subA = predefinedList.findIndex(x => x.category === a.category && x.subcategory === a.subcategory);
      let subB = predefinedList.findIndex(x => x.category === b.category && x.subcategory === b.subcategory);
      if (subA === -1) subA = 999;
      if (subB === -1) subB = 999;
      if (subA !== subB) return subA - subB;
      
      return a.subcategory.localeCompare(b.subcategory);
    });
    rows.forEach((r, i) => r.srNo = i + 1);
  }

  sortReportRows(incRows, PREDEFINED_INCOME);
  sortReportRows(expRows, PREDEFINED_EXPENSE);

  const incomeTotals = Array(12).fill(0), expenseTotals = Array(12).fill(0);
  let grandIncomeTotal = 0, grandExpenseTotal = 0;

  incRows.forEach(r => { 
    delete r.keywords; 
    r.months.forEach((a, i) => { incomeTotals[i] += a; }); 
    if (r.category === 'စာရင်းဖွင့်' && r.subcategory === 'စာရင်းဖွင့်လက်ကျန်') {
      r.total = openingBalances[0] + manualOpeningsCurrentYear.reduce((a,b)=>a+b, 0);
    } else {
      r.total = r.months.reduce((a,b)=>a+b, 0);
    }
    grandIncomeTotal += r.total; 
  });
  
  expRows.forEach(r => { 
    delete r.keywords; 
    r.months.forEach((a, i) => { expenseTotals[i] += a; }); 
    r.total = r.months.reduce((a,b)=>a+b, 0);
    grandExpenseTotal += r.total; 
  });
  
  const balanceTotals = incomeTotals.map((v, i) => v - expenseTotals[i]);

  return c.J({
    success: true, sheet: rawSheet, book: table, year: targetYear,
    data: { incomeRows: incRows, incomeTotals, grandIncomeTotal, expenseRows: expRows, expenseTotals,
      grandExpenseTotal, balanceTotals, grandNetBalance: grandIncomeTotal - grandExpenseTotal },
  });
}

// -------------------------------------------------------------------
// ROUTING
// -------------------------------------------------------------------
async function route(c) {
  const { env, path, method } = c;

  if (path === '/api/login' && method === 'POST') return handleLogin(c);

  c.user = await verifyToken(env, c.request);
  if (!c.user) throw new HttpError(401, 'Unauthorized: Login ပြန်လည်ဝင်ရောက်ပေးပါခင်ဗျာ။');

  if (path === '/api/change-password' && method === 'POST') return handleChangePassword(c);
  if (method !== 'GET' && isViewer(c.user)) throw new HttpError(403, 'ကြည့်ရှုခွင့်သာ ရှိသောကြောင့် ပြင်ဆင်ခွင့် မရှိပါ။');

  if (path === '/api/bootstrap' && method === 'GET') return handleBootstrap(c);
  if (path === '/api/sync' && method === 'POST') return handleSync(c);
  if (path === '/api/home-summary' && method === 'GET') return handleHomeSummary(c);
  if (path === '/api/entries') return handleEntries(c);
  if (path === '/api/transfer') return handleTransfer(c);
  if (path === '/api/bulk-import' && method === 'POST') return handleBulkImport(c);
  if (path === '/api/inventory') return handleInventory(c);
  if (path.startsWith('/api/yogi')) return handleYogi(c);
  if (path === '/api/report' && method === 'GET') return handleReport(c);

  throw new HttpError(404, 'Endpoint not found');
}

// ===================================================================
// 🌟 EXPORT DEFAULT ENTRY POINT
// ===================================================================
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
      console.error('[Worker Error]', err);
      return J({ success: false, error: env.DEBUG === '1' ? String(err.message) : 'Internal server error' }, 500);
    }
  },
};
