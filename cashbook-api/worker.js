// ===================================================================
// SĀSANA ERP - CLOUDFLARE WORKER API (worker.js) — v7.0 (Hardened Pro)
// Features: Fail-Closed Auth, Token Revocation, Brute-Force Lockout,
// Strict UID Validation, Myanmar->Eng Auto-Convert, Partial PUT Merge,
// Summary/Version Cache, Atomic Batch Sync & Scheduled Cron Audit
// ===================================================================

const PBKDF2_ITER = 100000;
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 Days (Revocable via token_version)
const LOGIN_MAX_FAILS = 5;
const LOGIN_LOCK_MS = 15 * 60 * 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UID_RE = /^[A-Za-z0-9_-]{1,80}$/;
const TRF_RE = /^(TRF_[A-Za-z0-9_-]{1,65})_(OUT|IN)$/;
const LEGACY_ID_RE = /^(?:CB|INV|YOGI)-(\d+)$/;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MM_DIGITS = ['၀', '၁', '၂', '၃', '၄', '၅', '၆', '၇', '၈', '၉'];
const enc = new TextEncoder();
const dec = new TextDecoder();

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function getSecret(env) {
  if (!env.AUTH_SECRET || String(env.AUTH_SECRET).length < 32) {
    throw new HttpError(500, 'Server AUTH_SECRET is not configured (min 32 chars required)');
  }
  return String(env.AUTH_SECRET);
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
const ALL_TRACKED_TABLES = [...LEDGER_TABLES, 'Inventory', 'Permanent Yogi', 'Camp Yogi'];
const BANK_TABLES = new Set(['1CB Bank (General)', '2CB Bank (Meal)', '3CB Bank (UZ)']);
const ALL_SHEETS = ['1CB', '2CB', '3CB', '4GB', '5FB', '6HB', '7PB', '8EB', '9MB', '10GB'];
const BANK_SHEETS = ['1CB', '2CB', '3CB'];
const USERS = ['User 1', 'User 2', 'User 3'];
const YOGI_CATS = ['ရဟန်း', 'ကိုရင်', 'သီလရှင်', 'လူပုဂ္ဂိုလ်', 'ဝေယျာဝိစ္စ'];

const str = (v, d = '') => (v === null || v === undefined) ? d : String(v).trim();
const toEngDigits = (v) => (v === null || v === undefined)
  ? ''
  : String(v).replace(/[၀-၉]/g, ch => MM_DIGITS.indexOf(ch));

const roundMoney = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const num = (v) => {
  const eng = toEngDigits(v ?? '');
  const clean = eng.replace(/,/g, '').replace(/[^0-9.-]/g, '');
  const n = parseFloat(clean);
  return Number.isFinite(n) ? roundMoney(n) : 0;
};
const todayMM = () => new Date(Date.now() + 6.5 * 3600 * 1000).toISOString().slice(0, 10);

function isValidDateStr(s) {
  if (!DATE_RE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && (dt.getUTCMonth() + 1) === m && dt.getUTCDate() === d;
}

function assertValidUid(uid) {
  if (uid && !UID_RE.test(uid)) {
    throw new HttpError(400, 'Invalid unique_id format');
  }
  return uid;
}

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
    if (b && typeof b === 'object' && !Array.isArray(b)) return b;
  } catch (_) { }
  throw new HttpError(400, 'Invalid JSON body');
}

function parseKey(body, params) {
  const pick = (k) => body?.[k] ?? params?.get(k) ?? null;
  const uid = str(pick('unique_id') ?? pick('uniqueId'));
  if (uid) {
    assertValidUid(uid);
    const m = LEGACY_ID_RE.exec(uid);
    return m ? { id: +m[1] } : { uid };
  }
  const id = parseInt(toEngDigits(pick('id')), 10);
  return Number.isInteger(id) && id > 0 ? { id } : null;
}
const keyWhere = (k) => (k.uid ? ['unique_id = ?', k.uid] : ['id = ?', k.id]);

// -------------------------------------------------------------------
// Crypto & Auth Helpers
// -------------------------------------------------------------------
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

async function verifyPassword(pw, stored, allowLegacyUpgrade = true) {
  if (stored.startsWith('pbkdf2$')) {
    const [, iter, salt] = stored.split('$');
    const calc = await hashPassword(pw, b64uToBytes(salt), parseInt(iter, 10));
    return { ok: safeEqual(calc, stored), upgrade: false };
  }
  if (!allowLegacyUpgrade) return { ok: false, upgrade: false };
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
    if (!(p.exp > Date.now()) || !p.uid) return null;

    // Live DB check for active flag, token_version & live role
    const uRow = await env.DB.prepare(
      `SELECT id, username, role, active, token_version FROM "users" WHERE id = ? LIMIT 1`
    ).bind(p.uid).first();

    if (!uRow || Number(uRow.active ?? 1) !== 1) return null;
    if (Number(uRow.token_version ?? 1) !== Number(p.tv ?? 1)) return null;

    return { uid: uRow.id, u: uRow.username, r: uRow.role || 'Viewer', tv: Number(uRow.token_version ?? 1) };
  } catch (err) {
    if (err instanceof HttpError && err.status === 500) throw err;
    return null;
  }
}

// Strict Role Matrix
const roleOf = (user) => String(user?.r || 'Viewer').trim().toLowerCase();
const isAdmin = (user) => roleOf(user) === 'admin';
const isViewer = (user) => roleOf(user) === 'viewer';
const canDeleteRole = (user) => ['admin', 'finance', 'account'].includes(roleOf(user));

function corsHeaders(request, env) {
  const allowed = String(env.ALLOWED_ORIGIN || 'https://dhamma-aly.github.io').split(',').map(s => s.trim()).filter(Boolean);
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
// Row Normalizers (With Calendar Date, UID Check & Myanmar->Eng Digits)
// -------------------------------------------------------------------
function normLedger(b, table, existing = null) {
  const dateRaw = b.entry_date !== undefined ? b.entry_date : (b.date !== undefined ? b.date : existing?.date);
  const date = toEngDigits(str(dateRaw, todayMM())).slice(0, 10);
  if (!isValidDateStr(date)) throw new HttpError(400, 'Invalid calendar date (YYYY-MM-DD)');

  let title = str(b.title !== undefined ? b.title : (b.category !== undefined ? b.category : existing?.title));
  const sub_title = str(b.sub_title !== undefined ? b.sub_title : (b.subcategory !== undefined ? b.subcategory : existing?.sub_title));

  let income, expense;
  if (b.income !== undefined || b.expense !== undefined || b.amount !== undefined) {
    income = num(b.income);
    expense = num(b.expense);
    if (b.amount != null && !income && !expense) {
      const a = num(b.amount);
      const kindHint = str(b.type || title);
      if (kindHint.includes('ထွက်ငွေ') || kindHint.includes('စာရင်းပြောင်း') || kindHint === 'ဘဏ်ထုတ်ငွေ') {
        expense = a;
      } else {
        income = a;
      }
    }
  } else if (existing) {
    income = num(existing.income);
    expense = num(existing.expense);
  } else {
    income = 0;
    expense = 0;
  }

  if (income < 0 || expense < 0) throw new HttpError(400, 'Amount must not be negative');
  if (!title) title = income > 0 ? 'ဝင်ငွေ' : 'ထွက်ငွေ';

  const descRaw = b.description !== undefined ? b.description : existing?.description;
  const description = str(descRaw);
  if (!description) {
    throw new HttpError(400, 'အကြောင်းအရာ (Description) ထည့်သွင်းရန် လိုအပ်ပါသည်ခင်ဗျာ။');
  }

  const voucherRaw = b.voucher_no !== undefined ? b.voucher_no : existing?.voucher_no;
  const voucher_no = toEngDigits(str(voucherRaw));

  const no = parseInt(toEngDigits(b.no), 10);
  const balance = b.balance !== undefined ? num(b.balance) : (existing?.balance !== undefined ? num(existing.balance) : 0);

  let defaultReceiver = 'User 1';
  if (BANK_TABLES.has(table)) {
    defaultReceiver = (title === 'ဘဏ်ထုတ်ငွေ' || sub_title.includes('ကျောင်းရန်ပုံငွေ'))
      ? (str(b.receiver) || existing?.receiver || 'User 1')
      : 'Bank';
  }
  const receiverRaw = b.receiver !== undefined ? b.receiver : existing?.receiver;
  const receiver = str(receiverRaw) || defaultReceiver;

  const uid = assertValidUid(str(b.unique_id ?? b.uniqueId ?? existing?.unique_id)) || crypto.randomUUID();

  return {
    ...(Number.isInteger(no) ? { no } : {}),
    date, title, sub_title,
    description,
    income, expense,
    balance,
    voucher_no,
    receiver,
    month_year: formatMonthYear(date),
    book_name: table,
    unique_id: uid,
  };
}

function normInventory(b, existing = null) {
  const descRaw = b.description !== undefined ? b.description
    : (b.item_name !== undefined ? b.item_name
      : (b.item_desc !== undefined ? b.item_desc : existing?.description));
  const description = str(descRaw);
  if (!description) throw new HttpError(400, 'အကြောင်းအရာ (Description) ထည့်သွင်းရန် လိုအပ်ပါသည်ခင်ဗျာ။');

  const dateRaw = b.entry_date !== undefined ? b.entry_date : (b.date !== undefined ? b.date : existing?.date);
  const date = toEngDigits(str(dateRaw, todayMM())).slice(0, 10);
  if (!isValidDateStr(date)) throw new HttpError(400, 'Invalid calendar date (YYYY-MM-DD)');

  const qtyRaw = b.qty !== undefined ? b.qty : existing?.qty;
  const qty = num(qtyRaw);
  if (qty < 0) throw new HttpError(400, 'အရေအတွက်သည် ၀ ထက် မငယ်ရပါ။');

  const no = parseInt(toEngDigits(b.no), 10);
  const uid = assertValidUid(str(b.unique_id ?? b.uniqueId ?? existing?.unique_id)) || `INV-${crypto.randomUUID()}`;

  return {
    ...(Number.isInteger(no) ? { no } : {}),
    date, description,
    location: str(b.location !== undefined ? b.location : existing?.location) || 'စတို',
    category: str(b.category !== undefined ? b.category : existing?.category) || 'အထွေထွေ',
    unit: str(b.unit !== undefined ? b.unit : existing?.unit) || 'ခု',
    qty,
    remark: str(b.remark !== undefined ? b.remark : (b.note !== undefined ? b.note : existing?.remark)),
    month_year: formatMonthYear(date),
    book_name: 'Inventory',
    unique_id: uid,
  };
}

function normYogi(b, table, existingRow = null) {
  const nameRaw = b.name !== undefined ? b.name : existingRow?.name;
  const name = str(nameRaw);
  if (!name) throw new HttpError(400, 'ယောဂီအမည် (Name) ထည့်သွင်းရန် လိုအပ်ပါသည်ခင်ဗျာ။');

  const startDateRaw = b.start_date !== undefined ? b.start_date : existingRow?.start_date;
  const startDate = toEngDigits(str(startDateRaw, todayMM())).slice(0, 10);
  if (startDate && !isValidDateStr(startDate)) throw new HttpError(400, 'Invalid start_date (YYYY-MM-DD)');

  const endDateRaw = b.end_date !== undefined ? b.end_date : existingRow?.end_date;
  const endDate = toEngDigits(str(endDateRaw));
  if (endDate && endDate !== '-' && !isValidDateStr(endDate)) {
    throw new HttpError(400, 'Invalid end_date (YYYY-MM-DD)');
  }

  const dobRaw = b.dob !== undefined ? b.dob : existingRow?.dob;
  const dob = toEngDigits(str(dobRaw));

  const nrcRaw = b.nrc !== undefined ? b.nrc : (b.full_nrc !== undefined ? b.full_nrc : existingRow?.nrc);
  const phoneRaw = b.yogi_phone !== undefined ? b.yogi_phone : (b.phone !== undefined ? b.phone : existingRow?.yogi_phone);
  const homePhoneRaw = b.home_phone !== undefined ? b.home_phone : existingRow?.home_phone;
  const ageRaw = b.age !== undefined ? b.age : existingRow?.age;

  const no = parseInt(toEngDigits(b.no), 10);
  const uid = assertValidUid(str(b.unique_id ?? b.uniqueId ?? existingRow?.unique_id)) || `YOGI-${crypto.randomUUID()}`;

  return {
    ...(Number.isInteger(no) ? { no } : {}),
    start_date: startDate,
    end_date: endDate,
    yogi_type: str(b.yogi_type !== undefined ? b.yogi_type : (b.category !== undefined ? b.category : existingRow?.yogi_type)) || (table === 'Camp Yogi' ? 'စခန်းဝင်' : 'အမြဲနေ'),
    name,
    father_name: str(b.father_name !== undefined ? b.father_name : existingRow?.father_name),
    nrc: toEngDigits(str(nrcRaw)),
    dob,
    age: parseInt(toEngDigits(ageRaw), 10) || 0,
    gender: str(b.gender !== undefined ? b.gender : existingRow?.gender) || 'ကျား',
    yogi_phone: toEngDigits(str(phoneRaw)),
    home_phone: toEngDigits(str(homePhoneRaw)),
    address: str(b.address !== undefined ? b.address : existingRow?.address),
    unique_id: uid,
  };
}
const NORM = { ledger: normLedger, inventory: normInventory, yogi: normYogi };

// -------------------------------------------------------------------
// SQL Builders + Incremental Summary & Version Maintenance
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

function summaryKey(table, row) {
  const rawDate = str(row.date);
  const ym = rawDate.length >= 7 && /^\d{4}-\d{2}/.test(rawDate) ? rawDate.slice(0, 7) : '0000-00';
  const defaultRec = BANK_TABLES.has(table) ? 'Bank' : 'User 1';
  const receiver = str(row.receiver) || defaultRec;
  const title = str(row.title);
  const sub_title = str(row.sub_title);
  return { book_name: table, ym, receiver, title, sub_title };
}

function ledgerSummaryDeltaStmt(env, table, row, sign) {
  const k = summaryKey(table, row);
  const inc = roundMoney((parseFloat(row.income) || 0) * sign);
  const exp = roundMoney((parseFloat(row.expense) || 0) * sign);
  return env.DB.prepare(
    `INSERT INTO "ledger_summary" (book_name, ym, receiver, title, sub_title, total_income, total_expense, row_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(book_name, ym, receiver, title, sub_title) DO UPDATE SET
       total_income = ROUND(total_income + excluded.total_income, 2),
       total_expense = ROUND(total_expense + excluded.total_expense, 2),
       row_count = row_count + excluded.row_count`
  ).bind(k.book_name, k.ym, k.receiver, k.title, k.sub_title, inc, exp, sign);
}

function cleanupEmptySummaryStmt(env, table) {
  return env.DB.prepare(`DELETE FROM "ledger_summary" WHERE book_name = ? AND row_count <= 0`).bind(table);
}

function bumpVersionStmt(env, table, rowDelta = 0) {
  return env.DB.prepare(
    `INSERT INTO "book_versions" (table_name, version, row_count, updated_at)
     VALUES (?, 2, MAX(0, ?), datetime('now'))
     ON CONFLICT(table_name) DO UPDATE SET
       version = version + 1,
       row_count = MAX(0, row_count + ?),
       updated_at = datetime('now')`
  ).bind(table, rowDelta, rowDelta);
}

function rebuildTableSummaryStmts(env, table) {
  const defaultRec = BANK_TABLES.has(table) ? 'Bank' : 'User 1';
  return [
    env.DB.prepare(`DELETE FROM "ledger_summary" WHERE book_name = ?`).bind(table),
    env.DB.prepare(
      `INSERT INTO "ledger_summary" (book_name, ym, receiver, title, sub_title, total_income, total_expense, row_count)
       SELECT
         ?,
         COALESCE(NULLIF(TRIM(substr(date, 1, 7)), ''), '0000-00'),
         COALESCE(NULLIF(TRIM(receiver), ''), ?),
         COALESCE(TRIM(title), ''),
         COALESCE(TRIM(sub_title), ''),
         ROUND(COALESCE(SUM(COALESCE(income, 0)), 0), 2),
         ROUND(COALESCE(SUM(COALESCE(expense, 0)), 0), 2),
         COUNT(*)
       FROM "${table}"
       GROUP BY
         COALESCE(NULLIF(TRIM(substr(date, 1, 7)), ''), '0000-00'),
         COALESCE(NULLIF(TRIM(receiver), ''), ?),
         COALESCE(TRIM(title), ''),
         COALESCE(TRIM(sub_title), '')`
    ).bind(table, defaultRec, defaultRec),
    env.DB.prepare(
      `INSERT INTO "book_versions" (table_name, version, row_count, updated_at)
       VALUES (?, 2, (SELECT COUNT(*) FROM "${table}"), datetime('now'))
       ON CONFLICT(table_name) DO UPDATE SET
         version = version + 1,
         row_count = excluded.row_count,
         updated_at = datetime('now')`
    ).bind(table),
  ];
}

function auditStmt(env, user, action, targetTable, targetUid, summary) {
  return env.DB.prepare(
    `INSERT INTO "audit_logs" (actor, role, action, target_table, target_uid, summary) VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(str(user?.u || 'system'), str(user?.r || 'System'), action, targetTable, str(targetUid), str(summary).slice(0, 300));
}

async function getTableVersion(env, table) {
  const r = await env.DB.prepare(`SELECT version FROM "book_versions" WHERE table_name = ? LIMIT 1`).bind(table).first();
  return r ? Number(r.version) : 1;
}

async function getAllVersionsMap(env) {
  const { results } = await env.DB.prepare(`SELECT table_name, version, row_count, updated_at FROM "book_versions"`).all();
  const map = {};
  (results || []).forEach(r => {
    map[r.table_name] = { version: Number(r.version) || 1, row_count: Number(r.row_count) || 0, updated_at: r.updated_at || '' };
  });
  return map;
}

async function runBatches(env, stmts, chunkSize = 40) {
  const out = [];
  for (let i = 0; i < stmts.length; i += chunkSize) {
    const res = await env.DB.batch(stmts.slice(i, i + chunkSize));
    out.push(...res);
  }
  return out;
}

async function deleteTransferGroup(env, gid, user = null) {
  assertValidUid(gid);
  const ids = [`${gid}_OUT`, `${gid}_IN`];
  const foundRes = await env.DB.batch(
    LEDGER_TABLES.map(t => env.DB.prepare(`SELECT * FROM "${t}" WHERE unique_id IN (?, ?)`).bind(...ids))
  );

  const stmts = [];
  let deletedCount = 0;
  const touchedTables = new Set();

  foundRes.forEach((res, idx) => {
    const t = LEDGER_TABLES[idx];
    const rows = res.results || [];
    if (rows.length === 0) return;
    touchedTables.add(t);
    rows.forEach(oldRow => {
      stmts.push(ledgerSummaryDeltaStmt(env, t, oldRow, -1));
      deletedCount++;
    });
    stmts.push(env.DB.prepare(`DELETE FROM "${t}" WHERE unique_id IN (?, ?)`).bind(...ids));
    stmts.push(cleanupEmptySummaryStmt(env, t));
    stmts.push(bumpVersionStmt(env, t, -rows.length));
  });

  if (stmts.length === 0) return 0;
  if (user) {
    stmts.push(auditStmt(env, user, 'DELETE_TRANSFER', [...touchedTables].join(', '), gid, `Deleted transfer group ${gid}`));
  }
  await runBatches(env, stmts);
  return deletedCount;
}

// -------------------------------------------------------------------
// Query Book
// -------------------------------------------------------------------
async function queryBook(env, table, rawSheet, knownVersion = null) {
  const currentVersion = await getTableVersion(env, table);
  if (knownVersion !== null && Number(knownVersion) === currentVersion) {
    return { success: true, book: table, version: currentVersion, unchanged: true };
  }

  const { results } = await env.DB.prepare(`SELECT * FROM "${table}" ORDER BY date ASC, id ASC`).all();
  const rows = results || [];
  let running = 0, totalIncome = 0, totalExpense = 0;
  const data = rows.map((row, idx) => {
    const inc = parseFloat(row.income) || 0, exp = parseFloat(row.expense) || 0;
    totalIncome = roundMoney(totalIncome + inc);
    totalExpense = roundMoney(totalExpense + exp);
    running = roundMoney(running + inc - exp);
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
  return {
    success: true,
    book: table,
    version: currentVersion,
    data,
    kpis: { totalIncome, totalExpense, balance: running, count: rows.length },
  };
}

// -------------------------------------------------------------------
// Universal Transfer Builder (Explicit Validation + Myanmar->Eng Digits)
// -------------------------------------------------------------------
function resolveExplicitBank(rawTarget) {
  const t = str(rawTarget);
  if (TABLE_MAP[t] && BANK_TABLES.has(TABLE_MAP[t])) return TABLE_MAP[t];
  return [...BANK_TABLES].find(bTbl => t === bTbl || t.startsWith(bTbl.split(' ')[0])) || null;
}

function buildTransfer(b, src) {
  const date = toEngDigits(str(b.entry_date || b.date, todayMM())).slice(0, 10);
  if (!isValidDateStr(date)) throw new HttpError(400, 'Invalid calendar date (YYYY-MM-DD)');

  const amt = num(b.amount || b.expense || b.income);
  if (!(amt > 0)) throw new HttpError(400, 'amount must be greater than 0');

  const rawUid = str(b.unique_id);
  if (rawUid) assertValidUid(rawUid);
  const fromUid = TRF_RE.exec(rawUid);
  const gid = assertValidUid(str(b.group_id)) || (fromUid && fromUid[1]) || `TRF_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;

  const sender = BANK_TABLES.has(src) ? 'Bank' : (str(b.receiver) || 'User 1');
  const target = str(b.dest_book || b.target || b.sub_title);
  if (!target) throw new HttpError(400, 'လွှဲပြောင်းမည့် ပစ်မှတ် (target) ထည့်သွင်းရန် လိုအပ်ပါသည်');

  const voucher_no = toEngDigits(str(b.voucher_no));
  const month_year = formatMonthYear(date);
  const explicitType = str(b.transfer_type).toUpperCase();

  const mk = (table, suffix, o) => [table, {
    date, voucher_no, month_year, book_name: table, unique_id: `${gid}_${suffix}`,
    title: 'စာရင်းပြောင်း', income: 0, expense: 0, ...o,
  }];

  // A. Bank Source
  if (BANK_TABLES.has(src)) {
    const targetBank = resolveExplicitBank(target);
    const isWithdrawalToSchool = explicitType === 'BANK_WITHDRAWAL' ||
      b.title === 'ဘဏ်ထုတ်ငွေ' ||
      target === '1General Book' ||
      target === '4GB' ||
      target === 'ကျောင်းရန်ပုံငွေ စာအုပ်' ||
      (!targetBank && USERS.includes(target));

    if (isWithdrawalToSchool) {
      const destUser = USERS.includes(target) ? target : (USERS.includes(b.receiver) ? b.receiver : 'User 1');
      const desc = str(b.description) || 'ကျောင်းအသုံးစရိတ် ထုတ်ပေးခြင်း (ဘဏ်မှရရှိငွေ)';

      return {
        gid,
        rows: [
          mk(src, 'OUT', {
            title: 'ဘဏ်ထုတ်ငွေ',
            sub_title: 'ကျောင်းရန်ပုံငွေ စာအုပ်',
            description: desc,
            expense: amt,
            receiver: destUser,
          }),
          mk('1General Book', 'IN', {
            title: 'ဘဏ်ထုတ်ငွေ',
            sub_title: `${src} မှ ထုတ်ယူရရှိ`,
            description: desc,
            income: amt,
            receiver: destUser,
          }),
        ],
      };
    }

    if (!targetBank) {
      throw new HttpError(400, `Unknown transfer target for bank: "${target}"`);
    }
    if (targetBank === src) {
      throw new HttpError(400, 'မူရင်းဘဏ်စာရင်းနှင့် လွှဲပြောင်းမည့် ဘဏ်စာရင်း မတူညီရပါ။');
    }

    return {
      gid,
      rows: [
        mk(src, 'OUT', {
          sub_title: `${targetBank} သို့ လွှဲပြောင်း`,
          description: str(b.description) || `${targetBank} သို့ ဘဏ်စာရင်းပြောင်း လွှဲပို့ခြင်း`,
          expense: amt,
          receiver: 'Bank',
        }),
        mk(targetBank, 'IN', {
          title: 'စာရင်းပြောင်း',
          sub_title: `${src} မှ လွှဲပြောင်းရရှိ`,
          description: `${src} မှ စာရင်းပြောင်း ရရှိခြင်း`,
          income: amt,
          receiver: 'Bank',
        }),
      ],
    };
  }

  // B. Ledger Source -> User to User
  const targetUser = USERS.find(u => target === u || target.startsWith(`${u} `));
  if (explicitType === 'USER_TO_USER' || (targetUser && !target.includes('Bank') && !target.includes('ဘဏ်'))) {
    if (!targetUser) throw new HttpError(400, `Invalid target user: "${target}"`);
    if (!USERS.includes(sender)) throw new HttpError(400, `Invalid sender user: "${sender}"`);
    if (targetUser === sender) {
      throw new HttpError(400, 'လွှဲပို့သူနှင့် လက်ခံသူ User မတူညီရပါ။');
    }
    return {
      gid,
      rows: [
        mk(src, 'OUT', {
          sub_title: `${targetUser} သို့ လွှဲပြောင်း`,
          description: str(b.description) || `${targetUser} ထံ စာရင်းပြောင်း ပေးပို့ခြင်း`,
          expense: amt,
          receiver: sender,
        }),
        mk(src, 'IN', {
          sub_title: `${sender} ထံမှ လွှဲပြောင်းရရှိ`,
          description: str(b.description) ? `${str(b.description)} (ရရှိ)` : `${sender} ထံမှ စာရင်းပြောင်း ရရှိခြင်း`,
          income: amt,
          receiver: targetUser,
        }),
      ],
    };
  }

  // C. Ledger Source -> Bank Deposit
  const targetBank = resolveExplicitBank(target);
  if (!targetBank) {
    throw new HttpError(400, `Unknown transfer target: "${target}"`);
  }

  return {
    gid,
    rows: [
      mk(src, 'OUT', {
        sub_title: 'ဘဏ်အပ်နှံခြင်း',
        description: str(b.description) || `${targetBank} သို့ ဘဏ်အပ်နှံခြင်း`,
        expense: amt,
        receiver: sender,
      }),
      mk(targetBank, 'IN', {
        title: 'ဘဏ်အပ်ငွေ',
        sub_title: 'ဘဏ်အပ်နှံခြင်း',
        description: `${src} [${sender}] မှ ဘဏ်အပ်ငွေ ရရှိခြင်း`,
        income: amt,
        receiver: 'Bank',
      }),
    ],
  };
}

async function applyTransferAtomic(env, user, b, src, isEditOrReplace = false) {
  const { gid, rows } = buildTransfer(b, src);
  const ids = [`${gid}_OUT`, `${gid}_IN`];
  const stmts = [];
  const touchedTables = new Set(rows.map(([t]) => t));

  const existingChecks = await env.DB.batch(
    LEDGER_TABLES.map(t => env.DB.prepare(`SELECT * FROM "${t}" WHERE unique_id IN (?, ?)`).bind(...ids))
  );

  existingChecks.forEach((res, idx) => {
    const t = LEDGER_TABLES[idx];
    const oldRows = res.results || [];
    if (oldRows.length === 0) return;
    touchedTables.add(t);
    oldRows.forEach(oldRow => {
      stmts.push(ledgerSummaryDeltaStmt(env, t, oldRow, -1));
    });
    if (isEditOrReplace || !rows.some(([rt]) => rt === t)) {
      stmts.push(env.DB.prepare(`DELETE FROM "${t}" WHERE unique_id IN (?, ?)`).bind(...ids));
      if (!rows.some(([rt]) => rt === t)) {
        stmts.push(bumpVersionStmt(env, t, -oldRows.length));
      }
    }
  });

  const deltaPerTable = {};
  existingChecks.forEach((res, idx) => {
    const t = LEDGER_TABLES[idx];
    deltaPerTable[t] = -(res.results?.length || 0);
  });

  rows.forEach(([t, row]) => {
    stmts.push(upsertStmt(env, t, row));
    stmts.push(ledgerSummaryDeltaStmt(env, t, row, +1));
    deltaPerTable[t] = (deltaPerTable[t] || 0) + 1;
  });

  touchedTables.forEach(t => {
    stmts.push(cleanupEmptySummaryStmt(env, t));
    stmts.push(bumpVersionStmt(env, t, deltaPerTable[t] || 0));
  });

  stmts.push(auditStmt(env, user, isEditOrReplace ? 'UPDATE_TRANSFER' : 'TRANSFER', src, gid, `${rows[0]?.[1]?.description || gid}`));
  await runBatches(env, stmts);
  return gid;
}

async function handleTransfer(c) {
  const { url, method, env, user } = c;
  if (method === 'DELETE') {
    if (!canDeleteRole(user)) throw new HttpError(403, 'ဖျက်သိမ်းခွင့် မရှိပါ။');
    const rawUid = str(url.searchParams.get('unique_id'));
    if (rawUid) assertValidUid(rawUid);
    const m = TRF_RE.exec(rawUid);
    const gid = assertValidUid(str(url.searchParams.get('group_id'))) || (m && m[1]);
    if (!gid) throw new HttpError(400, 'group_id required');
    return c.J({ success: true, deleted: await deleteTransferGroup(env, gid, user) });
  }
  if (method !== 'POST' && method !== 'PUT') throw new HttpError(405, 'Method not allowed');

  const b = await readJson(c.request);
  const src = ledgerTable(url.searchParams.get('sheet') || b.sheet_name || b.sheet_code || b.book_name);
  const gid = await applyTransferAtomic(env, user, b, src, method === 'PUT' || str(b.unique_id).includes('TRF_'));
  return c.J({ success: true, group_id: gid, unique_id: `${gid}_OUT` });
}

async function handleEntries(c) {
  const { url, method, env, user } = c;
  const sheetParam = url.searchParams.get('sheet') || url.searchParams.get('book');

  if (method === 'GET') {
    const raw = sheetParam || '1CB';
    const knownV = url.searchParams.get('known_version');
    return c.J(await queryBook(env, ledgerTable(raw), raw, knownV ? parseInt(knownV, 10) : null));
  }

  const body = (method === 'POST' || method === 'PUT') ? await readJson(c.request) : null;
  const table = ledgerTable(sheetParam || body?.sheet_name || body?.sheet_code || body?.book_name);

  if (method === 'POST') {
    const isBankWithdrawal = BANK_TABLES.has(table) &&
      (body.title === 'ဘဏ်ထုတ်ငွေ' || body.category === 'ဘဏ်ထုတ်ငွေ' || str(body.sub_title).includes('ကျောင်းရန်ပုံငွေ')) &&
      str(body.type) !== 'ဝင်ငွေ';

    if (isBankWithdrawal) {
      const gid = await applyTransferAtomic(env, user, {
        ...body,
        transfer_type: 'BANK_WITHDRAWAL',
        target: '1General Book',
        amount: body.amount || body.expense,
        receiver: body.receiver || 'User 1',
        description: body.description || 'ကျောင်းအသုံးစရိတ် ထုတ်ပေးခြင်း (ဘဏ်မှရရှိငွေ)',
      }, table, false);
      return c.J({ success: true, unique_id: `${gid}_OUT`, group_id: gid });
    }

    const row = normLedger(body, table);
    const existing = await env.DB.prepare(`SELECT * FROM "${table}" WHERE unique_id = ? LIMIT 1`).bind(row.unique_id).first();
    const stmts = [];
    if (existing) stmts.push(ledgerSummaryDeltaStmt(env, table, existing, -1));
    stmts.push(upsertStmt(env, table, row));
    stmts.push(ledgerSummaryDeltaStmt(env, table, row, +1));
    stmts.push(cleanupEmptySummaryStmt(env, table));
    stmts.push(bumpVersionStmt(env, table, existing ? 0 : 1));
    stmts.push(auditStmt(env, user, existing ? 'UPSERT_LEDGER' : 'CREATE_LEDGER', table, row.unique_id, `${row.date} | ${row.title} | ${row.income || row.expense}`));
    await env.DB.batch(stmts);
    return c.J({ success: true, unique_id: row.unique_id });
  }

  const key = parseKey(body, url.searchParams);
  if (!key) throw new HttpError(400, 'unique_id or id required');

  if (key.uid && key.uid.endsWith('_IN')) {
    throw new HttpError(400, 'ဤစာရင်းသည် လက်ခံစာရင်း (Incoming Transfer) ဖြစ်သောကြောင့် မူရင်းလွှဲပို့သည့် စာအုပ်မှသာ ပြင်ဆင်/ဖျက်ပစ်နိုင်ပါသည်ခင်ဗျာ။');
  }

  if (method === 'PUT') {
    if (key.uid && TRF_RE.test(key.uid)) {
      const gid = await applyTransferAtomic(env, user, body, table, true);
      return c.J({ success: true, group_id: gid });
    }
    const [where, val] = keyWhere(key);
    const existing = await env.DB.prepare(`SELECT * FROM "${table}" WHERE ${where} LIMIT 1`).bind(val).first();
    if (!existing) throw new HttpError(404, 'Entry not found in this book');

    const newRow = normLedger({ ...body, unique_id: existing.unique_id || key.uid }, table, existing);
    const stmts = [
      updateStmt(env, table, newRow, key),
      ledgerSummaryDeltaStmt(env, table, existing, -1),
      ledgerSummaryDeltaStmt(env, table, newRow, +1),
      cleanupEmptySummaryStmt(env, table),
      bumpVersionStmt(env, table, 0),
      auditStmt(env, user, 'UPDATE_LEDGER', table, existing.unique_id || val, `${newRow.date} | ${newRow.title} | ${newRow.income || newRow.expense}`),
    ];
    await env.DB.batch(stmts);
    return c.J({ success: true });
  }

  if (method === 'DELETE') {
    if (!canDeleteRole(user)) throw new HttpError(403, 'ဖျက်သိမ်းခွင့် မရှိပါ။');
    const trf = key.uid && TRF_RE.exec(key.uid);
    if (trf) {
      return c.J({ success: true, deleted: await deleteTransferGroup(env, trf[1], user) });
    }
    const [where, val] = keyWhere(key);
    const existing = await env.DB.prepare(`SELECT * FROM "${table}" WHERE ${where} LIMIT 1`).bind(val).first();
    if (!existing) return c.J({ success: true, deleted: 0 });

    const stmts = [
      env.DB.prepare(`DELETE FROM "${table}" WHERE ${where}`).bind(val),
      ledgerSummaryDeltaStmt(env, table, existing, -1),
      cleanupEmptySummaryStmt(env, table),
      bumpVersionStmt(env, table, -1),
      auditStmt(env, user, 'DELETE_LEDGER', table, existing.unique_id || val, `${existing.date} | ${existing.title} | ${existing.income || existing.expense}`),
    ];
    await env.DB.batch(stmts);
    return c.J({ success: true, deleted: 1 });
  }
  throw new HttpError(405, 'Method not allowed');
}

// -------------------------------------------------------------------
// GOOGLE SHEETS BULK IMPORT (Admin Only + Safe Staging Validation)
// -------------------------------------------------------------------
async function handleBulkImport(c) {
  const { env, user } = c;
  if (!isAdmin(user)) throw new HttpError(403, 'Admin တစ်ဦးတည်းသာ Bulk Import ပြုလုပ်ခွင့် ရှိပါသည်။');

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

  // Validate ALL rows BEFORE mutating/clearing the table so partial failures can't wipe DB
  const normalizedRows = rawRows.map((item, idx) => {
    const rowData = { ...item };
    if (rowData.no === undefined) rowData.no = idx + 1;
    if (!rowData.description && rowData.title) rowData.description = rowData.title;
    return NORM[kind](rowData, table);
  });

  if (clearExisting) {
    await env.DB.prepare(`DELETE FROM "${table}"`).run();
  }

  const CHUNK_SIZE = 70;
  for (let i = 0; i < normalizedRows.length; i += CHUNK_SIZE) {
    const slice = normalizedRows.slice(i, i + CHUNK_SIZE);
    await env.DB.batch(slice.map(r => upsertStmt(env, table, r)));
  }

  if (kind === 'ledger') {
    await env.DB.batch([
      ...rebuildTableSummaryStmts(env, table),
      auditStmt(env, user, 'BULK_IMPORT', table, '', `clear=${clearExisting}, count=${normalizedRows.length}`),
    ]);
  } else {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO "book_versions" (table_name, version, row_count, updated_at)
         VALUES (?, 2, (SELECT COUNT(*) FROM "${table}"), datetime('now'))
         ON CONFLICT(table_name) DO UPDATE SET version = version + 1, row_count = excluded.row_count, updated_at = datetime('now')`
      ).bind(table),
      auditStmt(env, user, 'BULK_IMPORT', table, '', `clear=${clearExisting}, count=${normalizedRows.length}`),
    ]);
  }

  return c.J({ success: true, count: normalizedRows.length, table });
}

// -------------------------------------------------------------------
// Formatters & Yogi Classifier (With PII Masking for Viewer)
// -------------------------------------------------------------------
function maskNrc(nrc) {
  const s = str(nrc);
  if (!s) return '';
  if (s.length <= 4) return '****';
  return `${s.slice(0, Math.max(2, s.length - 6))}******`;
}
function maskPhone(phone) {
  const s = str(phone);
  if (!s) return '';
  if (s.length <= 4) return '****';
  return `${s.slice(0, 2)}*****${s.slice(-3)}`;
}

function formatInventory(rows, version = 1) {
  let kitchen = 0, dhammaHall = 0, sim = 0, store = 0, totalQty = 0;
  const data = rows.map((row, idx) => {
    const q = parseFloat(row.qty) || 0, loc = str(row.location);
    totalQty = roundMoney(totalQty + q);
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
  return { success: true, version, data, kpis: { kitchen, dhammaHall, sim, store, totalQty, totalItems: rows.length } };
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

function formatYogi(rows, rawSheet, table, version = 1, maskPii = false) {
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
    const nrcVal = maskPii ? maskNrc(row.nrc) : (row.nrc || '');
    const phoneVal = maskPii ? maskPhone(row.yogi_phone) : (row.yogi_phone || '');
    const homeVal = maskPii ? maskPhone(row.home_phone) : (row.home_phone || '');
    return {
      id: row.id, no: idx + 1, uniqueId: uid, unique_id: uid, sheet_type: rawSheet,
      start_date: row.start_date || '', end_date: row.end_date || '',
      yogi_type: row.yogi_type || '', category: row.yogi_type || 'လူပုဂ္ဂိုလ်',
      name: row.name, father_name: row.father_name || '', nrc: nrcVal, full_nrc: nrcVal,
      dob: maskPii ? '' : (row.dob || ''), age: row.age || 0, gender,
      yogi_phone: phoneVal, phone: phoneVal,
      home_phone: homeVal, address: maskPii ? '' : (row.address || ''),
      status: isActive ? 'Active' : 'Inactive', book_name: table,
    };
  });
  return {
    success: true, sheet: rawSheet, book: table, version, data,
    kpis: {
      totalMonks: monks, totalNuns: nuns, totalMales: males, totalFemales: females,
      totalActiveYogis: active, totalInactiveYogis: inactive, totalCount: rows.length,
    },
  };
}

// -------------------------------------------------------------------
// Auth & Account Handlers (Rate Limit + Token Versioning)
// -------------------------------------------------------------------
async function handleLogin(c) {
  const b = await readJson(c.request);
  const username = str(b.username), password = str(b.password);
  if (!username || !password) throw new HttpError(400, 'Username and password required');

  const ip = c.request.headers.get('CF-Connecting-IP') || 'unknown';
  const rateKeys = [`user:${username.toLowerCase()}`, `ip:${ip}`];
  const now = Date.now();

  const lockRows = await c.env.DB.batch(
    rateKeys.map(k => c.env.DB.prepare(`SELECT key, fail_count, locked_until FROM "login_attempts" WHERE key = ? LIMIT 1`).bind(k))
  );
  for (const res of lockRows) {
    const lr = res.results?.[0];
    if (lr && Number(lr.locked_until || 0) > now) {
      const waitMin = Math.ceil((Number(lr.locked_until) - now) / 60000);
      throw new HttpError(429, `လျှို့ဝှက်နံပါတ် အကြိမ်များစွာ မှားယွင်းနေပါသဖြင့် ${waitMin} မိနစ်ခန့် စောင့်ပြီးမှ ပြန်ဝင်ပါ။`);
    }
  }

  const row = await c.env.DB.prepare(
    `SELECT id, username, password, role, name, active, token_version FROM "users" WHERE username = ? LIMIT 1`
  ).bind(username).first();

  if (row && Number(row.active ?? 1) !== 1) {
    throw new HttpError(403, 'ဤအကောင့်ကို ယာယီပိတ်ထားပါသည်။');
  }

  const allowLegacy = c.env.ALLOW_LEGACY_PASSWORD_UPGRADE !== '0';
  const check = row ? await verifyPassword(password, String(row.password || ''), allowLegacy) : { ok: false };

  if (!check.ok) {
    await c.env.DB.batch(rateKeys.map((k, idx) => {
      const curFails = Number(lockRows[idx]?.results?.[0]?.fail_count || 0) + 1;
      const lockedUntil = curFails >= LOGIN_MAX_FAILS ? now + LOGIN_LOCK_MS : 0;
      return c.env.DB.prepare(
        `INSERT INTO "login_attempts" (key, fail_count, locked_until, updated_at)
         VALUES (?, ?, ?, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET
           fail_count = excluded.fail_count,
           locked_until = excluded.locked_until,
           updated_at = datetime('now')`
      ).bind(k, curFails >= LOGIN_MAX_FAILS ? 0 : curFails, lockedUntil);
    }));
    throw new HttpError(401, 'အသုံးပြုသူအမည် သို့မဟုတ် လျှို့ဝှက်နံပါတ် မှားယွင်းနေပါသည်။');
  }

  const postLoginStmts = [
    c.env.DB.prepare(`DELETE FROM "login_attempts" WHERE key IN (?, ?)`).bind(...rateKeys),
  ];
  if (check.upgrade) {
    postLoginStmts.push(
      c.env.DB.prepare(`UPDATE "users" SET password = ? WHERE id = ?`).bind(await hashPassword(password), row.id)
    );
  }
  await c.env.DB.batch(postLoginStmts);

  const role = row.role || 'Staff';
  const tv = Number(row.token_version ?? 1);
  const token = await signToken(c.env, { uid: row.id, u: row.username, r: role, tv, exp: now + TOKEN_TTL_MS });
  return c.J({
    success: true,
    token,
    user: { id: row.id, username: row.username, role, name: row.name || row.username },
    expiresInMs: TOKEN_TTL_MS,
  });
}

async function handleChangePassword(c) {
  const b = await readJson(c.request);
  const oldPw = str(b.old_password), newPw = str(b.new_password);
  if (newPw.length < 8) throw new HttpError(400, 'လျှို့ဝှက်နံပါတ်အသစ်သည် အနည်းဆုံး ၈ လုံး ရှိရမည်');

  const row = await c.env.DB.prepare(`SELECT id, username, password, role, token_version FROM "users" WHERE id = ? LIMIT 1`).bind(c.user.uid).first();
  const check = row ? await verifyPassword(oldPw, String(row.password || ''), true) : { ok: false };
  if (!check.ok) throw new HttpError(401, 'လက်ရှိ လျှို့ဝှက်နံပါတ် မှားနေပါသည်');

  const nextTv = Number(row.token_version ?? 1) + 1;
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE "users" SET password = ?, token_version = ? WHERE id = ?`)
      .bind(await hashPassword(newPw), nextTv, row.id),
    auditStmt(c.env, c.user, 'CHANGE_PASSWORD', 'users', row.id, `Password changed & old tokens revoked for ${row.username}`),
  ]);

  const token = await signToken(c.env, { uid: row.id, u: row.username, r: row.role, tv: nextTv, exp: Date.now() + TOKEN_TTL_MS });
  return c.J({ success: true, token, expiresInMs: TOKEN_TTL_MS });
}

// -------------------------------------------------------------------
// Version Check & Smart Bootstrap
// -------------------------------------------------------------------
async function handleVersions(c) {
  const versions = await getAllVersionsMap(c.env);
  return c.J({ success: true, versions, timestamp: Date.now() });
}

async function handleBootstrap(c) {
  const { env, url, user } = c;
  let clientVersions = {};
  const vParam = url.searchParams.get('versions');
  if (vParam) {
    try { clientVersions = JSON.parse(vParam) || {}; } catch (_) { clientVersions = {}; }
  }

  const serverVersions = await getAllVersionsMap(env);
  const unchangedBooks = {};
  const booksToFetch = [];

  ALL_SHEETS.forEach(code => {
    const tbl = TABLE_MAP[code];
    const sv = serverVersions[tbl]?.version || 1;
    const cv = Number(clientVersions[tbl] ?? clientVersions[code] ?? -1);
    if (cv === sv) unchangedBooks[code] = sv;
    else booksToFetch.push(code);
  });

  const invSv = serverVersions['Inventory']?.version || 1;
  const fetchInv = Number(clientVersions['Inventory'] ?? -1) !== invSv;

  const permSv = serverVersions['Permanent Yogi']?.version || 1;
  const fetchPerm = Number(clientVersions['Permanent Yogi'] ?? clientVersions['12Yogi'] ?? -1) !== permSv;

  const campSv = serverVersions['Camp Yogi']?.version || 1;
  const fetchCamp = Number(clientVersions['Camp Yogi'] ?? clientVersions['13Yogi'] ?? -1) !== campSv;

  const [booksRes, invRes, permRes, campRes] = await Promise.all([
    Promise.all(booksToFetch.map(code => queryBook(env, TABLE_MAP[code], code))),
    fetchInv ? env.DB.prepare(`SELECT * FROM "Inventory" ORDER BY date ASC, id ASC`).all() : Promise.resolve(null),
    fetchPerm ? env.DB.prepare(`SELECT * FROM "Permanent Yogi" ORDER BY start_date ASC, id ASC`).all() : Promise.resolve(null),
    fetchCamp ? env.DB.prepare(`SELECT * FROM "Camp Yogi" ORDER BY start_date ASC, id ASC`).all() : Promise.resolve(null),
  ]);

  const booksPayload = {};
  booksToFetch.forEach((code, i) => { booksPayload[code] = booksRes[i]; });

  const maskPii = isViewer(user);
  const invF = invRes ? formatInventory(invRes.results || [], invSv) : null;
  const permF = permRes ? formatYogi(permRes.results || [], '12Yogi', 'Permanent Yogi', permSv, maskPii) : null;
  const campF = campRes ? formatYogi(campRes.results || [], '13Yogi', 'Camp Yogi', campSv, maskPii) : null;

  return c.J({
    success: true,
    timestamp: Date.now(),
    versions: serverVersions,
    unchangedBooks,
    books: booksPayload,
    ...(invF ? { inventory: invF.data, inventoryKpis: invF.kpis } : {}),
    yogi: {
      ...(permF ? { '12Yogi': permF.data } : {}),
      ...(campF ? { '13Yogi': campF.data } : {}),
    },
    yogiKpis: {
      ...(permF ? { '12Yogi': permF.kpis } : {}),
      ...(campF ? { '13Yogi': campF.kpis } : {}),
    },
  });
}

// -------------------------------------------------------------------
// Offline Batch Sync (/api/sync) - Prevents Resurrection & Subrequest Overflow
// -------------------------------------------------------------------
async function handleSync(c) {
  const { env, user } = c;
  const body = await readJson(c.request);
  const queue = Array.isArray(body.queue) ? body.queue.slice(0, 20) : [];
  const results = [];

  for (const item of queue) {
    const uid = str(item?.unique_id);
    if (uid) assertValidUid(uid);
    const qid = item?.qid ?? null;

    try {
      const action = str(item?.action).toUpperCase();
      const raw = str(item.table);

      if (action === 'DELETE' && !canDeleteRole(user)) {
        throw new HttpError(403, 'ဖျက်သိမ်းခွင့် မရှိပါ။');
      }

      let table, kind;
      if (TABLE_MAP[raw]) { table = TABLE_MAP[raw]; kind = 'ledger'; }
      else if (raw === 'Inventory') { table = 'Inventory'; kind = 'inventory'; }
      else if (['Permanent Yogi', 'Camp Yogi', '12Yogi', '13Yogi'].includes(raw)) {
        table = resolveYogiTable(item.data?.sheet_type || item.data?.book_name || raw); kind = 'yogi';
      } else throw new HttpError(400, `Table not allowed: ${raw}`);

      if (kind === 'ledger') {
        if (action === 'CREATE' || action === 'UPDATE') {
          const dataObj = { ...(item.data || {}), unique_id: uid || item.data?.unique_id };
          if (dataObj.unique_id) assertValidUid(str(dataObj.unique_id));

          const isTransferOrWithdrawal = TRF_RE.test(str(dataObj.unique_id)) ||
            dataObj.title === 'စာရင်းပြောင်း' ||
            (BANK_TABLES.has(table) && (dataObj.title === 'ဘဏ်ထုတ်ငွေ' || str(dataObj.sub_title).includes('ကျောင်းရန်ပုံငွေ')) && str(dataObj.type) !== 'ဝင်ငွေ');

          if (isTransferOrWithdrawal) {
            const gid = await applyTransferAtomic(env, user, dataObj, table, action === 'UPDATE');
            results.push({ qid, unique_id: `${gid}_OUT`, status: 'synced' });
          } else {
            const targetUid = str(dataObj.unique_id);
            const existing = targetUid
              ? await env.DB.prepare(`SELECT * FROM "${table}" WHERE unique_id = ? LIMIT 1`).bind(targetUid).first()
              : null;
            if (action === 'UPDATE' && !existing) {
              throw new HttpError(404, 'Record no longer exists on server');
            }
            const row = normLedger(dataObj, table, existing);
            const stmts = [];
            if (existing) stmts.push(ledgerSummaryDeltaStmt(env, table, existing, -1));
            stmts.push(upsertStmt(env, table, row));
            stmts.push(ledgerSummaryDeltaStmt(env, table, row, +1));
            stmts.push(cleanupEmptySummaryStmt(env, table));
            stmts.push(bumpVersionStmt(env, table, existing ? 0 : 1));
            stmts.push(auditStmt(env, user, `SYNC_${action}_LEDGER`, table, row.unique_id, `${row.date} | ${row.title} | ${row.income || row.expense}`));
            await env.DB.batch(stmts);
            results.push({ qid, unique_id: row.unique_id, status: 'synced' });
          }
        } else if (action === 'DELETE') {
          if (!uid) throw new HttpError(400, 'unique_id required');
          const trf = TRF_RE.exec(uid);
          if (trf) {
            await deleteTransferGroup(env, trf[1], user);
          } else {
            const existing = await env.DB.prepare(`SELECT * FROM "${table}" WHERE unique_id = ? LIMIT 1`).bind(uid).first();
            if (existing) {
              await env.DB.batch([
                env.DB.prepare(`DELETE FROM "${table}" WHERE unique_id = ?`).bind(uid),
                ledgerSummaryDeltaStmt(env, table, existing, -1),
                cleanupEmptySummaryStmt(env, table),
                bumpVersionStmt(env, table, -1),
                auditStmt(env, user, 'SYNC_DELETE_LEDGER', table, uid, `${existing.date} | ${existing.title}`),
              ]);
            }
          }
          results.push({ qid, unique_id: uid, status: 'deleted' });
        } else {
          throw new HttpError(400, `Unknown action: ${action}`);
        }
      } else if (kind === 'inventory') {
        if (action === 'CREATE' || action === 'UPDATE') {
          const targetUid = str(uid || item.data?.unique_id);
          if (targetUid) assertValidUid(targetUid);
          const existing = targetUid
            ? await env.DB.prepare(`SELECT * FROM "Inventory" WHERE unique_id = ? LIMIT 1`).bind(targetUid).first()
            : null;
          if (action === 'UPDATE' && !existing) {
            throw new HttpError(404, 'Item no longer exists on server');
          }
          const row = normInventory({ ...(item.data || {}), unique_id: targetUid }, existing);
          await env.DB.batch([
            upsertStmt(env, 'Inventory', row),
            bumpVersionStmt(env, 'Inventory', existing ? 0 : 1),
            auditStmt(env, user, `SYNC_${action}_INV`, 'Inventory', row.unique_id, row.description),
          ]);
          results.push({ qid, unique_id: row.unique_id, status: 'synced' });
        } else if (action === 'DELETE') {
          if (!uid) throw new HttpError(400, 'unique_id required');
          const r = await env.DB.prepare(`DELETE FROM "Inventory" WHERE unique_id = ?`).bind(uid).run();
          if (changes(r) > 0) {
            await env.DB.batch([
              bumpVersionStmt(env, 'Inventory', -changes(r)),
              auditStmt(env, user, 'SYNC_DELETE_INV', 'Inventory', uid, 'Deleted via offline sync'),
            ]);
          }
          results.push({ qid, unique_id: uid, status: 'deleted' });
        } else {
          throw new HttpError(400, `Unknown action: ${action}`);
        }
      } else if (kind === 'yogi') {
        if (action === 'CREATE' || action === 'UPDATE') {
          const targetUid = str(uid || item.data?.unique_id);
          if (targetUid) assertValidUid(targetUid);
          const existing = targetUid
            ? await env.DB.prepare(`SELECT * FROM "${table}" WHERE unique_id = ? LIMIT 1`).bind(targetUid).first()
            : null;
          if (action === 'UPDATE' && !existing) {
            throw new HttpError(404, 'Yogi no longer exists on server');
          }
          const row = normYogi({ ...(item.data || {}), unique_id: targetUid }, table, existing);
          await env.DB.batch([
            upsertStmt(env, table, row),
            bumpVersionStmt(env, table, existing ? 0 : 1),
            auditStmt(env, user, `SYNC_${action}_YOGI`, table, row.unique_id, row.name),
          ]);
          results.push({ qid, unique_id: row.unique_id, status: 'synced' });
        } else if (action === 'DELETE') {
          if (!uid) throw new HttpError(400, 'unique_id required');
          const delRes = await env.DB.batch([
            env.DB.prepare(`DELETE FROM "Permanent Yogi" WHERE unique_id = ?`).bind(uid),
            env.DB.prepare(`DELETE FROM "Camp Yogi" WHERE unique_id = ?`).bind(uid),
          ]);
          const vers = [];
          if (changes(delRes[0]) > 0) {
            vers.push(bumpVersionStmt(env, 'Permanent Yogi', -changes(delRes[0])));
            vers.push(auditStmt(env, user, 'SYNC_DELETE_YOGI', 'Permanent Yogi', uid, 'Deleted via offline sync'));
          }
          if (changes(delRes[1]) > 0) {
            vers.push(bumpVersionStmt(env, 'Camp Yogi', -changes(delRes[1])));
            vers.push(auditStmt(env, user, 'SYNC_DELETE_YOGI', 'Camp Yogi', uid, 'Deleted via offline sync'));
          }
          if (vers.length) await env.DB.batch(vers);
          results.push({ qid, unique_id: uid, status: 'deleted' });
        } else {
          throw new HttpError(400, `Unknown action: ${action}`);
        }
      }
    } catch (e) {
      results.push({ qid, unique_id: uid, status: 'error', error: e.message });
    }
  }
  const failed = results.filter(r => r.status === 'error').length;
  return c.J({ success: true, count: results.length, failed, results });
}

// -------------------------------------------------------------------
// HOME SUMMARY (Uses ledger_summary + Excludes Internal User<->User in Padetha)
// -------------------------------------------------------------------
async function handleHomeSummary(c) {
  const { env } = c;
  const fundSummary = {};
  const tableToSheet = {};
  ALL_SHEETS.forEach(s => {
    tableToSheet[TABLE_MAP[s]] = s;
    fundSummary[s] = { bankBalance: 0, user1Balance: 0, user2Balance: 0, user3Balance: 0, totalBalance: 0 };
  });

  const padethaDefs = [
    ['2Meal Book', 'ဆွမ်းပဒေသာပင် စာအုပ်'],
    ['5Electronic Book', 'လျှပ်စစ်ပဒေသာပင် စာအုပ်'],
    ['6Medical Book', 'ဆေးပဒေသာပင် စာအုပ်'],
    ['7Other Book', 'အထွေထွေရန်ပုံငွေစာအုပ်'],
  ];
  const padethaTotals = {};
  padethaDefs.forEach(([t]) => { padethaTotals[t] = { income: 0, expense: 0 }; });

  let totalFund = 0, totalBank = 0, totalCash = 0, totalCount = 0;

  try {
    const [sumRes, pRes, kRes] = await env.DB.batch([
      env.DB.prepare(
        `SELECT book_name, receiver, title, sub_title,
                COALESCE(SUM(total_income), 0) as inc,
                COALESCE(SUM(total_expense), 0) as exp,
                COALESCE(SUM(row_count), 0) as cnt
         FROM "ledger_summary"
         WHERE row_count > 0
         GROUP BY book_name, receiver, title, sub_title`
      ),
      env.DB.prepare(`SELECT yogi_type, name, gender FROM "Permanent Yogi" WHERE (end_date IS NULL OR end_date = '' OR end_date = '-')`),
      env.DB.prepare(`SELECT yogi_type, name, gender FROM "Camp Yogi" WHERE (end_date IS NULL OR end_date = '' OR end_date = '-')`),
    ]);

    (sumRes.results || []).forEach(row => {
      const tbl = str(row.book_name);
      const sheet = tableToSheet[tbl];
      if (!sheet) return;
      const receiver = str(row.receiver);
      const t = str(row.title);
      const st = str(row.sub_title);
      const inc = parseFloat(row.inc) || 0;
      const exp = parseFloat(row.exp) || 0;
      const net = roundMoney(inc - exp);
      const cnt = parseInt(row.cnt, 10) || 0;

      totalCount += cnt;
      if (BANK_SHEETS.includes(sheet)) {
        fundSummary[sheet].bankBalance = roundMoney(fundSummary[sheet].bankBalance + net);
        totalBank = roundMoney(totalBank + net);
      } else {
        if (receiver.includes('User 2') || receiver.includes('User2')) {
          fundSummary[sheet].user2Balance = roundMoney(fundSummary[sheet].user2Balance + net);
        } else if (receiver.includes('User 3') || receiver.includes('User3')) {
          fundSummary[sheet].user3Balance = roundMoney(fundSummary[sheet].user3Balance + net);
        } else {
          fundSummary[sheet].user1Balance = roundMoney(fundSummary[sheet].user1Balance + net);
        }
        totalCash = roundMoney(totalCash + net);
      }
      fundSummary[sheet].totalBalance = roundMoney(fundSummary[sheet].totalBalance + net);
      totalFund = roundMoney(totalFund + net);

      if (padethaTotals[tbl]) {
        // Padetha summary includes Bank Deposits (ဘဏ်အပ်နှံခြင်း), skips internal User<->User transfers
        const isInternalUserTransfer = (t === 'စာရင်းပြောင်း' || t.includes('လွှဲပြောင်း')) && !st.includes('ဘဏ်အပ်နှံ');
        if (!isInternalUserTransfer) {
          padethaTotals[tbl].income = roundMoney(padethaTotals[tbl].income + inc);
          padethaTotals[tbl].expense = roundMoney(padethaTotals[tbl].expense + exp);
        }
      }
    });

    const padethaSummary = padethaDefs.map(([table_name, title]) => {
      const p = padethaTotals[table_name];
      return { table_name, title, income: p.income, expense: p.expense, balance: roundMoney(p.income - p.expense) };
    });

    const resident = {}, retreat = {};
    YOGI_CATS.forEach(k => { resident[k] = { male: 0, female: 0, total: 0 }; retreat[k] = { male: 0, female: 0, total: 0 }; });

    const addYogi = (rows, target) => (rows || []).forEach(row => {
      const type = classifyYogi(row);
      const bucket = target[type] || target['လူပုဂ္ဂိုလ်'];
      if (str(row.gender) === 'မ') bucket.female++; else bucket.male++;
      bucket.total++;
    });
    addYogi(pRes.results, resident);
    addYogi(kRes.results, retreat);

    return c.J({
      success: true,
      kpis: { totalFund, totalBank, totalCash, totalCount },
      fundSummary,
      padethaSummary,
      yogiSummary: { resident, retreat },
    });
  } catch (e) {
    console.error('[Dashboard Summary Error]', e);
    throw new HttpError(500, 'Dashboard summary error');
  }
}

// -------------------------------------------------------------------
// Inventory Handler
// -------------------------------------------------------------------
async function handleInventory(c) {
  const { url, method, env, user } = c;
  if (method === 'GET') {
    const knownV = url.searchParams.get('known_version');
    const sv = await getTableVersion(env, 'Inventory');
    if (knownV !== null && Number(knownV) === sv) {
      return c.J({ success: true, book: 'Inventory', version: sv, unchanged: true });
    }
    const { results } = await env.DB.prepare(`SELECT * FROM "Inventory" ORDER BY date ASC, id ASC`).all();
    return c.J(formatInventory(results || [], sv));
  }

  const body = (method === 'POST' || method === 'PUT') ? await readJson(c.request) : null;
  if (method === 'POST') {
    const row = normInventory(body);
    const existing = await env.DB.prepare(`SELECT id FROM "Inventory" WHERE unique_id = ? LIMIT 1`).bind(row.unique_id).first();
    await env.DB.batch([
      upsertStmt(env, 'Inventory', row),
      bumpVersionStmt(env, 'Inventory', existing ? 0 : 1),
      auditStmt(env, user, existing ? 'UPSERT_INV' : 'CREATE_INV', 'Inventory', row.unique_id, `${row.description} (${row.qty})`),
    ]);
    return c.J({ success: true, unique_id: row.unique_id });
  }

  const key = parseKey(body, url.searchParams);
  if (!key) throw new HttpError(400, 'unique_id or id required');

  if (method === 'PUT') {
    const [where, val] = keyWhere(key);
    const existing = await env.DB.prepare(`SELECT * FROM "Inventory" WHERE ${where} LIMIT 1`).bind(val).first();
    if (!existing) throw new HttpError(404, 'Item not found');

    const row = normInventory({ ...body, unique_id: existing.unique_id || key.uid }, existing);
    await env.DB.batch([
      updateStmt(env, 'Inventory', row, key),
      bumpVersionStmt(env, 'Inventory', 0),
      auditStmt(env, user, 'UPDATE_INV', 'Inventory', existing.unique_id || val, `${row.description} (${row.qty})`),
    ]);
    return c.J({ success: true });
  }

  if (method === 'DELETE') {
    if (!canDeleteRole(user)) throw new HttpError(403, 'ဖျက်သိမ်းခွင့် မရှိပါ။');
    const [where, val] = keyWhere(key);
    const existing = await env.DB.prepare(`SELECT id, unique_id, description FROM "Inventory" WHERE ${where} LIMIT 1`).bind(val).first();
    if (!existing) return c.J({ success: true, deleted: 0 });
    await env.DB.batch([
      env.DB.prepare(`DELETE FROM "Inventory" WHERE ${where}`).bind(val),
      bumpVersionStmt(env, 'Inventory', -1),
      auditStmt(env, user, 'DELETE_INV', 'Inventory', existing.unique_id || val, existing.description),
    ]);
    return c.J({ success: true, deleted: 1 });
  }
  throw new HttpError(405, 'Method not allowed');
}

// -------------------------------------------------------------------
// Yogi Handler
// -------------------------------------------------------------------
async function findYogiTableAndRow(env, key, explicitSheet) {
  const [where, val] = keyWhere(key);
  if (explicitSheet) {
    const tbl = resolveYogiTable(explicitSheet);
    const row = await env.DB.prepare(`SELECT * FROM "${tbl}" WHERE ${where} LIMIT 1`).bind(val).first();
    return row ? { table: tbl, row } : null;
  }
  if (!key.uid) {
    throw new HttpError(400, 'sheet_type or unique_id required for numeric ID lookup');
  }
  const [pRes, cRes] = await env.DB.batch([
    env.DB.prepare(`SELECT * FROM "Permanent Yogi" WHERE unique_id = ? LIMIT 1`).bind(key.uid),
    env.DB.prepare(`SELECT * FROM "Camp Yogi" WHERE unique_id = ? LIMIT 1`).bind(key.uid),
  ]);
  if (pRes.results?.[0]) return { table: 'Permanent Yogi', row: pRes.results[0] };
  if (cRes.results?.[0]) return { table: 'Camp Yogi', row: cRes.results[0] };
  return null;
}

async function handleYogi(c) {
  const { url, method, env, path, user } = c;
  const sheetParam = url.searchParams.get('sheet');

  if (method === 'GET') {
    const raw = sheetParam || '12Yogi';
    const table = resolveYogiTable(raw);
    const knownV = url.searchParams.get('known_version');
    const sv = await getTableVersion(env, table);
    if (knownV !== null && Number(knownV) === sv) {
      return c.J({ success: true, sheet: raw, book: table, version: sv, unchanged: true });
    }
    const { results } = await env.DB.prepare(`SELECT * FROM "${table}" ORDER BY start_date ASC, id ASC`).all();
    return c.J(formatYogi(results || [], raw, table, sv, isViewer(user)));
  }

  const body = (method === 'DELETE') ? null : await readJson(c.request);
  const explicit = str(body?.sheet_type || body?.sheet || sheetParam);

  if (method === 'POST') {
    const table = resolveYogiTable(explicit || '12Yogi');
    const row = normYogi(body, table);
    const existing = await env.DB.prepare(`SELECT id FROM "${table}" WHERE unique_id = ? LIMIT 1`).bind(row.unique_id).first();
    await env.DB.batch([
      upsertStmt(env, table, row),
      bumpVersionStmt(env, table, existing ? 0 : 1),
      auditStmt(env, user, existing ? 'UPSERT_YOGI' : 'CREATE_YOGI', table, row.unique_id, row.name),
    ]);
    return c.J({ success: true, unique_id: row.unique_id });
  }

  const key = parseKey(body, url.searchParams);
  if (!key) throw new HttpError(400, 'unique_id or id required');

  if (method === 'DELETE' && !canDeleteRole(user)) {
    throw new HttpError(403, 'ဖျက်သိမ်းခွင့် မရှိပါ။');
  }

  const found = await findYogiTableAndRow(env, key, explicit);
  if (!found) {
    if (method === 'DELETE') return c.J({ success: true, deleted: 0 });
    throw new HttpError(404, 'ယောဂီ မတွေ့ပါ');
  }
  const { table, row: existingRow } = found;
  const [where, val] = keyWhere(key);

  if (method === 'PUT' && (path.endsWith('/checkout') || path.endsWith('/reactivate'))) {
    const checkout = path.endsWith('/checkout');
    const end = checkout ? toEngDigits(str(body.end_date, todayMM())).slice(0, 10) : '';
    if (checkout && !isValidDateStr(end)) throw new HttpError(400, 'Invalid end_date (YYYY-MM-DD)');
    await env.DB.batch([
      env.DB.prepare(`UPDATE "${table}" SET end_date = ?, updated_at = datetime('now') WHERE ${where}`).bind(end, val),
      bumpVersionStmt(env, table, 0),
      auditStmt(env, user, checkout ? 'CHECKOUT_YOGI' : 'REACTIVATE_YOGI', table, existingRow.unique_id || val, `${existingRow.name} (${end || 'Active'})`),
    ]);
    return c.J({ success: true });
  }

  if (method === 'PUT') {
    const row = normYogi({ ...body, unique_id: existingRow.unique_id || key.uid }, table, existingRow);
    await env.DB.batch([
      updateStmt(env, table, row, key),
      bumpVersionStmt(env, table, 0),
      auditStmt(env, user, 'UPDATE_YOGI', table, existingRow.unique_id || val, row.name),
    ]);
    return c.J({ success: true });
  }

  if (method === 'DELETE') {
    await env.DB.batch([
      env.DB.prepare(`DELETE FROM "${table}" WHERE ${where}`).bind(val),
      bumpVersionStmt(env, table, -1),
      auditStmt(env, user, 'DELETE_YOGI', table, existingRow.unique_id || val, existingRow.name),
    ]);
    return c.J({ success: true, deleted: 1 });
  }
  throw new HttpError(405, 'Method not allowed');
}

// -------------------------------------------------------------------
// REPORT HANDLER
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
  { category: 'စာရင်းပြောင်း', subcategory: 'ဘဏ်အပ်နှံခြင်း', keywords: ['ဘဏ်အပ်နှံခြင်း', 'ဘဏ်အပ်ငွေ'] },
];

const REPORT_SKIP_TITLES = new Set(['စာရင်းပြောင်း', 'ဘဏ်အပ်ငွေ', 'လွှဲပြောင်းရရှိ']);

async function handleReport(c) {
  const { url, env } = c;
  const rawSheet = url.searchParams.get('sheet') || '4GB';
  const table = ledgerTable(rawSheet);
  const targetYear = toEngDigits(url.searchParams.get('year') || todayMM().slice(0, 4));
  if (!/^\d{4}$/.test(targetYear)) throw new HttpError(400, 'Invalid year');

  const bookVersion = await getTableVersion(env, table);
  const knownV = url.searchParams.get('known_version');
  if (knownV !== null && Number(knownV) === bookVersion) {
    return c.J({ success: true, sheet: rawSheet, book: table, year: targetYear, version: bookVersion, unchanged: true });
  }

  const { results } = await env.DB.prepare(
    `SELECT ym, title, sub_title,
            COALESCE(SUM(total_income), 0) as income,
            COALESCE(SUM(total_expense), 0) as expense
     FROM "ledger_summary"
     WHERE book_name = ? AND row_count > 0 AND ym <= ?
     GROUP BY ym, title, sub_title
     ORDER BY ym ASC`
  ).bind(table, `${targetYear}-12`).all();

  const mk = (defs, type) => defs.map((s) => ({ type, ...s, months: Array(12).fill(0), total: 0 }));
  const incRows = mk(PREDEFINED_INCOME, 'ဝင်ငွေ');
  const expRows = mk(PREDEFINED_EXPENSE, 'ထွက်ငွေ');
  const dynInc = {}, dynExp = {};

  const find = (rows, t, st, txt) => rows.find(x => x.category === t && x.subcategory === st) || rows.find(x => x.keywords && x.keywords.some(k => txt.includes(k)));
  const add = (rows, dyn, type, fallback, t, st, txt, m, amt) => {
    const hit = find(rows, t, st, txt);
    if (hit) { hit.months[m] = roundMoney(hit.months[m] + amt); return; }
    const k = `${t || fallback}_${st || 'အထွေထွေ'}`;
    if (!dyn[k]) dyn[k] = { type, category: t || fallback, subcategory: st || 'အထွေထွေ', months: Array(12).fill(0), total: 0 };
    dyn[k].months[m] = roundMoney(dyn[k].months[m] + amt);
  };

  let runningBalance = 0;
  const monthlyNetCurrentYear = Array(12).fill(0);
  const manualOpeningsCurrentYear = Array(12).fill(0);

  (results || []).forEach(r => {
    const ym = str(r.ym);
    if (!/^\d{4}-\d{2}$/.test(ym) || ym === '0000-00') return;
    const t = str(r.title), st = str(r.sub_title);
    const inc = parseFloat(r.income) || 0, exp = parseFloat(r.expense) || 0;

    const isBankDepositExpense = (t === 'စာရင်းပြောင်း' || st.includes('ဘဏ်အပ်နှံခြင်း')) && st.includes('ဘဏ်အပ်နှံခြင်း') && (exp > 0);
    if (!isBankDepositExpense) {
      if (REPORT_SKIP_TITLES.has(t) || t.includes('လွှဲပြောင်း') || st.includes('လွှဲပြောင်း') || t.includes('စာရင်းပြောင်း')) return;
    }

    const rYear = ym.slice(0, 4);
    if (rYear < targetYear) {
      runningBalance = roundMoney(runningBalance + inc - exp);
    } else if (rYear === targetYear) {
      const rMonth = parseInt(ym.slice(5, 7), 10) - 1;
      if (rMonth < 0 || rMonth > 11) return;

      monthlyNetCurrentYear[rMonth] = roundMoney(monthlyNetCurrentYear[rMonth] + inc - exp);
      const txt = `${t} ${st}`;
      if (t === 'စာရင်းဖွင့်' || st === 'စာရင်းဖွင့်လက်ကျန်') {
        manualOpeningsCurrentYear[rMonth] = roundMoney(manualOpeningsCurrentYear[rMonth] + inc);
      } else if (inc > 0) {
        add(incRows, dynInc, 'ဝင်ငွေ', 'အခြားဝင်ငွေ', t, st, txt, rMonth, inc);
      }
      if (exp > 0) add(expRows, dynExp, 'ထွက်ငွေ', 'အခြားထွက်ငွေ', t, st, txt, rMonth, exp);
    }
  });

  const openingBalances = Array(12).fill(0);
  openingBalances[0] = runningBalance;
  for (let i = 1; i < 12; i++) {
    openingBalances[i] = roundMoney(openingBalances[i - 1] + monthlyNetCurrentYear[i - 1]);
  }

  const openingRow = incRows.find(r => r.category === 'စာရင်းဖွင့်' && r.subcategory === 'စာရင်းဖွင့်လက်ကျန်');
  if (openingRow) {
    for (let i = 0; i < 12; i++) {
      openingRow.months[i] = roundMoney(openingBalances[i] + manualOpeningsCurrentYear[i]);
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
    rows.forEach((r, i) => { r.srNo = i + 1; });
  }

  sortReportRows(incRows, PREDEFINED_INCOME);
  sortReportRows(expRows, PREDEFINED_EXPENSE);

  const incomeTotals = Array(12).fill(0), expenseTotals = Array(12).fill(0);
  let grandIncomeTotal = 0, grandExpenseTotal = 0;

  incRows.forEach(r => {
    delete r.keywords;
    r.months.forEach((a, i) => { incomeTotals[i] = roundMoney(incomeTotals[i] + a); });
    if (r.category === 'စာရင်းဖွင့်' && r.subcategory === 'စာရင်းဖွင့်လက်ကျန်') {
      r.total = roundMoney(openingBalances[0] + manualOpeningsCurrentYear.reduce((a, b) => a + b, 0));
    } else {
      r.total = roundMoney(r.months.reduce((a, b) => a + b, 0));
    }
    grandIncomeTotal = roundMoney(grandIncomeTotal + r.total);
  });

  expRows.forEach(r => {
    delete r.keywords;
    r.months.forEach((a, i) => { expenseTotals[i] = roundMoney(expenseTotals[i] + a); });
    r.total = roundMoney(r.months.reduce((a, b) => a + b, 0));
    grandExpenseTotal = roundMoney(grandExpenseTotal + r.total);
  });

  const balanceTotals = incomeTotals.map((v, i) => roundMoney(v - expenseTotals[i]));

  return c.J({
    success: true, sheet: rawSheet, book: table, year: targetYear, version: bookVersion,
    data: {
      incomeRows: incRows, incomeTotals, grandIncomeTotal,
      expenseRows: expRows, expenseTotals, grandExpenseTotal,
      balanceTotals, grandNetBalance: roundMoney(grandIncomeTotal - grandExpenseTotal),
    },
  });
}

// -------------------------------------------------------------------
// ADMIN ENDPOINTS (Rebuild Summaries, Full JSON Backup, Audit Logs)
// -------------------------------------------------------------------
async function rebuildAllSummaries(env, user) {
  const stmts = [];
  LEDGER_TABLES.forEach(t => stmts.push(...rebuildTableSummaryStmts(env, t)));
  ['Inventory', 'Permanent Yogi', 'Camp Yogi'].forEach(t => {
    stmts.push(
      env.DB.prepare(
        `INSERT INTO "book_versions" (table_name, version, row_count, updated_at)
         VALUES (?, 2, (SELECT COUNT(*) FROM "${t}"), datetime('now'))
         ON CONFLICT(table_name) DO UPDATE SET version = version + 1, row_count = excluded.row_count, updated_at = datetime('now')`
      ).bind(t)
    );
  });
  stmts.push(auditStmt(env, user, 'REBUILD_SUMMARIES', 'ALL', '', 'Rebuilt ledger_summary & book_versions'));
  await runBatches(env, stmts);
}

async function handleAdminRebuildSummaries(c) {
  if (!isAdmin(c.user)) throw new HttpError(403, 'Admin တစ်ဦးတည်းသာ လုပ်ဆောင်ခွင့် ရှိပါသည်။');
  await rebuildAllSummaries(c.env, c.user);
  return c.J({ success: true, message: 'All summaries and versions rebuilt successfully' });
}

async function handleAdminBackup(c) {
  if (!isAdmin(c.user)) throw new HttpError(403, 'Admin တစ်ဦးတည်းသာ Backup ထုတ်ယူခွင့် ရှိပါသည်။');
  const tablesRes = await c.env.DB.batch(
    ALL_TRACKED_TABLES.map(t => c.env.DB.prepare(`SELECT * FROM "${t}" ORDER BY id ASC`))
  );
  const backup = {};
  ALL_TRACKED_TABLES.forEach((t, i) => {
    backup[t] = tablesRes[i].results || [];
  });
  return c.J({
    success: true,
    exportedAt: new Date().toISOString(),
    exportedBy: c.user.u,
    tables: backup,
  });
}

async function handleAdminAuditLogs(c) {
  if (!isAdmin(c.user)) throw new HttpError(403, 'Admin တစ်ဦးတည်းသာ ကြည့်ရှုခွင့် ရှိပါသည်။');
  const limit = Math.min(200, Math.max(10, parseInt(c.url.searchParams.get('limit') || '50', 10) || 50));
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM "audit_logs" ORDER BY id DESC LIMIT ?`
  ).bind(limit).all();
  return c.J({ success: true, data: results || [] });
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

  if (path === '/api/versions' && method === 'GET') return handleVersions(c);
  if (path === '/api/bootstrap' && method === 'GET') return handleBootstrap(c);
  if (path === '/api/sync' && method === 'POST') return handleSync(c);
  if (path === '/api/home-summary' && method === 'GET') return handleHomeSummary(c);
  if (path === '/api/entries') return handleEntries(c);
  if (path === '/api/transfer') return handleTransfer(c);
  if (path === '/api/bulk-import' && method === 'POST') return handleBulkImport(c);
  if (path === '/api/inventory') return handleInventory(c);
  if (path.startsWith('/api/yogi')) return handleYogi(c);
  if (path === '/api/report' && method === 'GET') return handleReport(c);

  if (path === '/api/admin/rebuild-summaries' && method === 'POST') return handleAdminRebuildSummaries(c);
  if (path === '/api/admin/backup' && method === 'GET') return handleAdminBackup(c);
  if (path === '/api/admin/audit-logs' && method === 'GET') return handleAdminAuditLogs(c);

  throw new HttpError(404, 'Endpoint not found');
}

// ===================================================================
// 🌟 EXPORT DEFAULT ENTRY POINT (HTTP + Scheduled Cron Audit)
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

  async scheduled(_event, env, ctx) {
    ctx.waitUntil((async () => {
      try {
        await rebuildAllSummaries(env, { u: 'cron', r: 'System' });
        await env.DB.prepare(`DELETE FROM "login_attempts" WHERE locked_until > 0 AND locked_until < ?`).bind(Date.now()).run();
      } catch (e) {
        console.error('[Scheduled Audit Error]', e);
      }
    })());
  },
};
// === END OF worker.js ===
