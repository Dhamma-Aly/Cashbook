// ===================================================================
// cashbook-api/core.js - Shared Constants, Auth, Normalizers & D1 Helpers
// Sāsana ERP Worker v7.1 (Modular 3-File Architecture)
// ===================================================================

export const PBKDF2_ITER = 100000;
export const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 Days (Revocable via token_version)
export const LOGIN_MAX_FAILS = 5;
export const LOGIN_LOCK_MS = 15 * 60 * 1000;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const UID_RE = /^[A-Za-z0-9_-]{1,80}$/;
export const TRF_RE = /^(TRF_[A-Za-z0-9_-]{1,65})_(OUT|IN)$/;
export const LEGACY_ID_RE = /^(?:CB|INV|YOGI)-(\d+)$/;
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MM_DIGITS = ['၀', '၁', '၂', '၃', '၄', '၅', '၆', '၇', '၈', '၉'];

const enc = new TextEncoder();
const dec = new TextDecoder();

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function getSecret(env) {
  if (!env.AUTH_SECRET || String(env.AUTH_SECRET).length < 32) {
    throw new HttpError(500, 'Server AUTH_SECRET is not configured (min 32 chars required)');
  }
  return String(env.AUTH_SECRET);
}

export const TABLE_MAP = {
  '1CB': '1CB Bank (General)', '2CB': '2CB Bank (Meal)', '3CB': '3CB Bank (UZ)',
  '4GB': '1General Book', '5FB': '2Meal Book', '6HB': '3Hall Book', '7PB': '4Pagoda Book',
  '8EB': '5Electronic Book', '9MB': '6Medical Book', '10GB': '7Other Book',
};
[
  '1CB Bank (General)', '2CB Bank (Meal)', '3CB Bank (UZ)', '1General Book', '2Meal Book',
  '3Hall Book', '4Pagoda Book', '5Electronic Book', '6Medical Book', '7Other Book',
].forEach(t => { TABLE_MAP[t] = t; });

export const LEDGER_TABLES = [...new Set(Object.values(TABLE_MAP))];
export const ALL_TRACKED_TABLES = [...LEDGER_TABLES, 'Inventory', 'Permanent Yogi', 'Camp Yogi'];
export const BANK_TABLES = new Set(['1CB Bank (General)', '2CB Bank (Meal)', '3CB Bank (UZ)']);
export const ALL_SHEETS = ['1CB', '2CB', '3CB', '4GB', '5FB', '6HB', '7PB', '8EB', '9MB', '10GB'];
export const BANK_SHEETS = ['1CB', '2CB', '3CB'];
export const USERS = ['User 1', 'User 2', 'User 3'];
export const YOGI_CATS = ['ရဟန်း', 'ကိုရင်', 'သီလရှင်', 'လူပုဂ္ဂိုလ်', 'ဝေယျာဝိစ္စ'];

export const str = (v, d = '') => (v === null || v === undefined) ? d : String(v).trim();
export const toEngDigits = (v) => (v === null || v === undefined)
  ? ''
  : String(v).replace(/[၀-၉]/g, ch => MM_DIGITS.indexOf(ch));

export const roundMoney = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
export const num = (v) => {
  const eng = toEngDigits(v ?? '');
  const clean = eng.replace(/,/g, '').replace(/[^0-9.-]/g, '');
  const n = parseFloat(clean);
  return Number.isFinite(n) ? roundMoney(n) : 0;
};
export const todayMM = () => new Date(Date.now() + 6.5 * 3600 * 1000).toISOString().slice(0, 10);
export const yesterdayMM = () => new Date(Date.now() + 6.5 * 3600 * 1000 - 86400000).toISOString().slice(0, 10);

export function isValidDateStr(s) {
  if (!DATE_RE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && (dt.getUTCMonth() + 1) === m && dt.getUTCDate() === d;
}

export function assertValidUid(uid) {
  if (uid && !UID_RE.test(uid)) {
    throw new HttpError(400, 'Invalid unique_id format');
  }
  return uid;
}

export function formatMonthYear(dateStr) {
  const m = /^(\d{4})-(\d{2})/.exec(String(dateStr || ''));
  if (!m) return dateStr ? String(dateStr) : '-';
  return `${MONTHS[+m[2] - 1] || m[2]}-${m[1].slice(2)}`;
}

export function ledgerTable(raw) {
  const t = TABLE_MAP[str(raw)];
  if (!t) throw new HttpError(400, `Unknown or missing sheet: "${str(raw)}"`);
  return t;
}

export function resolveYogiTable(s) {
  const v = str(s);
  return (v === '13Yogi' || v === 'Camp Yogi' || v.includes('စခန်းဝင်')) ? 'Camp Yogi' : 'Permanent Yogi';
}

export async function readJson(request) {
  try {
    const b = await request.json();
    if (b && typeof b === 'object' && !Array.isArray(b)) return b;
  } catch (_) { }
  throw new HttpError(400, 'Invalid JSON body');
}

export function parseKey(body, params) {
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

export const keyWhere = (k) => (k.uid ? ['unique_id = ?', k.uid] : ['id = ?', k.id]);
export const changes = (r) => r?.meta?.changes ?? 0;

// -------------------------------------------------------------------
// Crypto & Auth Helpers
// -------------------------------------------------------------------
export const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const b64uToBytes = (s) => {
  let t = s.replace(/-/g, '+').replace(/_/g, '/');
  while (t.length % 4) t += '=';
  return Uint8Array.from(atob(t), c => c.charCodeAt(0));
};

export function safeEqual(a, b) {
  a = String(a); b = String(b);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export async function hashPassword(pw, salt = crypto.getRandomValues(new Uint8Array(16)), iter = PBKDF2_ITER) {
  const key = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, key, 256);
  return `pbkdf2$${iter}$${b64u(salt)}$${b64u(bits)}`;
}

export async function verifyPassword(pw, stored, allowLegacyUpgrade = true) {
  if (stored.startsWith('pbkdf2$')) {
    const [, iter, salt] = stored.split('$');
    const calc = await hashPassword(pw, b64uToBytes(salt), parseInt(iter, 10));
    return { ok: safeEqual(calc, stored), upgrade: false };
  }
  if (!allowLegacyUpgrade) return { ok: false, upgrade: false };
  return { ok: stored !== '' && safeEqual(pw, stored), upgrade: true };
}

const hmacKey = (secret) => crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);

export async function signToken(env, payload) {
  const body = b64u(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(getSecret(env)), enc.encode(body));
  return `tok_${body}.${b64u(sig)}`;
}

export async function verifyToken(env, request) {
  try {
    const h = request.headers.get('Authorization') || '';
    if (!h.startsWith('Bearer tok_')) return null;
    const [body, sig] = h.slice(11).trim().split('.');
    if (!body || !sig) return null;
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(getSecret(env)), b64uToBytes(sig), enc.encode(body));
    if (!ok) return null;
    const p = JSON.parse(dec.decode(b64uToBytes(body)));
    if (!(p.exp > Date.now()) || !p.uid) return null;

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

export function verifyGasSecret(env, request) {
  const configured = str(env.GAS_SECRET);
  if (!configured || configured.length < 16) return false;
  const provided = str(request.headers.get('X-GAS-Secret'));
  return provided !== '' && safeEqual(provided, configured);
}

// Strict Role Matrix
export const roleOf = (user) => String(user?.r || 'Viewer').trim().toLowerCase();
export const isAdmin = (user) => roleOf(user) === 'admin';
export const isViewer = (user) => roleOf(user) === 'viewer';
export const canDeleteRole = (user) => ['admin', 'finance', 'account'].includes(roleOf(user));

export function corsHeaders(request, env) {
  const allowed = String(env.ALLOWED_ORIGIN || 'https://dhamma-aly.github.io').split(',').map(s => s.trim()).filter(Boolean);
  const origin = request.headers.get('Origin') || '';
  const allow = allowed.includes('*') ? '*' : (allowed.includes(origin) ? origin : allowed[0]);
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-GAS-Secret',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

// -------------------------------------------------------------------
// PII Masking & Row Normalizers
// -------------------------------------------------------------------
export function maskNrc(nrc) {
  const s = str(nrc);
  if (!s) return '';
  if (s.length <= 4) return '****';
  return `${s.slice(0, Math.max(2, s.length - 6))}******`;
}

export function maskPhone(phone) {
  const s = str(phone);
  if (!s) return '';
  if (s.length <= 4) return '****';
  return `${s.slice(0, 2)}*****${s.slice(-3)}`;
}

export function normLedger(b, table, existing = null) {
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
    date, title, sub_title, description,
    income, expense, balance, voucher_no, receiver,
    month_year: formatMonthYear(date),
    book_name: table,
    unique_id: uid,
  };
}

export function normInventory(b, existing = null) {
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

export function normYogi(b, table, existingRow = null) {
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
    dob: toEngDigits(str(dobRaw)),
    age: parseInt(toEngDigits(ageRaw), 10) || 0,
    gender: str(b.gender !== undefined ? b.gender : existingRow?.gender) || 'ကျား',
    yogi_phone: toEngDigits(str(phoneRaw)),
    home_phone: toEngDigits(str(homePhoneRaw)),
    address: str(b.address !== undefined ? b.address : existingRow?.address),
    unique_id: uid,
  };
}

export const NORM = { ledger: normLedger, inventory: normInventory, yogi: normYogi };

// -------------------------------------------------------------------
// SQL Builders + Incremental Summary & Version Maintenance
// -------------------------------------------------------------------
export function upsertStmt(env, table, row) {
  const keys = Object.keys(row);
  const upd = keys.filter(k => k !== 'unique_id').map(k => `"${k}" = excluded."${k}"`)
    .concat(`updated_at = datetime('now')`).join(', ');
  return env.DB.prepare(
    `INSERT INTO "${table}" (${keys.map(k => `"${k}"`).join(', ')}) VALUES (${keys.map(() => '?').join(', ')}) ` +
    `ON CONFLICT(unique_id) DO UPDATE SET ${upd}`
  ).bind(...keys.map(k => row[k]));
}

export function updateStmt(env, table, row, key) {
  const keys = Object.keys(row).filter(k => k !== 'unique_id' && k !== 'book_name');
  const [where, val] = keyWhere(key);
  return env.DB.prepare(
    `UPDATE "${table}" SET ${keys.map(k => `"${k}" = ?`).join(', ')}, updated_at = datetime('now') WHERE ${where}`
  ).bind(...keys.map(k => row[k]), val);
}

export function summaryKey(table, row) {
  const rawDate = str(row.date);
  const ym = rawDate.length >= 7 && /^\d{4}-\d{2}/.test(rawDate) ? rawDate.slice(0, 7) : '0000-00';
  const defaultRec = BANK_TABLES.has(table) ? 'Bank' : 'User 1';
  return {
    book_name: table,
    ym,
    receiver: str(row.receiver) || defaultRec,
    title: str(row.title),
    sub_title: str(row.sub_title),
  };
}

export function ledgerSummaryDeltaStmt(env, table, row, sign) {
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

export function cleanupEmptySummaryStmt(env, table) {
  return env.DB.prepare(`DELETE FROM "ledger_summary" WHERE book_name = ? AND row_count <= 0`).bind(table);
}

export function bumpVersionStmt(env, table, rowDelta = 0) {
  return env.DB.prepare(
    `INSERT INTO "book_versions" (table_name, version, row_count, updated_at)
     VALUES (?, 2, MAX(0, ?), datetime('now'))
     ON CONFLICT(table_name) DO UPDATE SET
       version = version + 1,
       row_count = MAX(0, row_count + ?),
       updated_at = datetime('now')`
  ).bind(table, rowDelta, rowDelta);
}

export function rebuildTableSummaryStmts(env, table) {
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

export function auditStmt(env, user, action, targetTable, targetUid, summary) {
  return env.DB.prepare(
    `INSERT INTO "audit_logs" (actor, role, action, target_table, target_uid, summary) VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(str(user?.u || 'system'), str(user?.r || 'System'), action, targetTable, str(targetUid), str(summary).slice(0, 300));
}

export async function getTableVersion(env, table) {
  const r = await env.DB.prepare(`SELECT version FROM "book_versions" WHERE table_name = ? LIMIT 1`).bind(table).first();
  return r ? Number(r.version) : 1;
}

export async function getAllVersionsMap(env) {
  const { results } = await env.DB.prepare(`SELECT table_name, version, row_count, updated_at FROM "book_versions"`).all();
  const map = {};
  (results || []).forEach(r => {
    map[r.table_name] = { version: Number(r.version) || 1, row_count: Number(r.row_count) || 0, updated_at: r.updated_at || '' };
  });
  return map;
}

export async function runBatches(env, stmts, chunkSize = 40) {
  const out = [];
  for (let i = 0; i < stmts.length; i += chunkSize) {
    const res = await env.DB.batch(stmts.slice(i, i + chunkSize));
    out.push(...res);
  }
  return out;
}

export async function rebuildAllSummaries(env, user) {
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
