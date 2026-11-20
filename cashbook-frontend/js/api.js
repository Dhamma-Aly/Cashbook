// ===================================================================
// cashbook-api/system.js - Pure Cloudflare Worker System Control (v7.2)
// Zero Google Script | Native .zip & Multi-Sheet .xlsx | Resend API Mail
// D1 Analytics Quota % | Daily 12:00 AM Auto Mail | Weekly/Quarterly SQL ZIP
// ===================================================================

import {
  HttpError, ALL_TRACKED_TABLES, LEDGER_TABLES,
  str, toEngDigits, roundMoney, todayMM, yesterdayMM, isValidDateStr,
  formatMonthYear, readJson, isAdmin, isViewer, maskNrc, maskPhone,
  auditStmt, getAllVersionsMap, rebuildAllSummaries,
} from './core.js';

const DEFAULT_CF_ACCOUNT_ID = 'bf411663ab2f1ced269542eaf3369104';
const DEFAULT_CF_DB_ID = '52727cc9-9e40-49d0-92f1-a1b9eb3758fd';
const DEFAULT_MAIL_TO = 'dhammaaly@gmail.com';
const DEFAULT_MAIL_FROM = 'Sasana ERP <onboarding@resend.dev>';

// Cloudflare D1 Free Tier Quotas
const D1_DAILY_READ_LIMIT = 5000000;
const D1_DAILY_WRITE_LIMIT = 100000;
const D1_STORAGE_LIMIT_BYTES = 500 * 1024 * 1024; // 500 MB

const textEnc = new TextEncoder();

function pct(used, limit) {
  if (!(limit > 0)) return 0;
  return Math.min(100, Math.round((used / limit) * 10000) / 100);
}

function buildVersionFingerprint(versionsMap) {
  return ALL_TRACKED_TABLES
    .map(t => `${t}:${versionsMap[t]?.version || 1}:${versionsMap[t]?.row_count || 0}`)
    .join('|');
}

function mmDateToUtcRange(mmDate) {
  const startMs = Date.parse(`${mmDate}T00:00:00.000+06:30`);
  const endMs = Date.parse(`${mmDate}T23:59:59.999+06:30`);
  const fmt = (ms) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
  return { startUtc: fmt(startMs), endUtc: fmt(endMs) };
}

function sqlVal(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '0';
  if (typeof v === 'boolean') return v ? '1' : '0';
  return `'${String(v).replace(/'/g, "''")}'`;
}

function escapeHtml(v) {
  return String(v === null || v === undefined ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeXml(v) {
  return String(v === null || v === undefined ? '' : v)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function bytesToBase64(bytes) {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

// ===================================================================
// A. SELF-HEALING SYSTEM META STORE (Tracks Backup Fingerprints in D1)
// ===================================================================
async function ensureSystemMetaTable(env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS "system_meta" (
       key TEXT PRIMARY KEY,
       value TEXT,
       updated_at TEXT DEFAULT (datetime('now'))
     )`
  ).run();
}

async function getSystemMeta(env, key) {
  await ensureSystemMetaTable(env);
  const row = await env.DB.prepare(`SELECT value FROM "system_meta" WHERE key = ? LIMIT 1`).bind(key).first();
  return row ? str(row.value) : '';
}

async function setSystemMeta(env, key, value) {
  await ensureSystemMetaTable(env);
  await env.DB.prepare(
    `INSERT INTO "system_meta" (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
  ).bind(key, str(value)).run();
}

// ===================================================================
// B. NATIVE ZERO-DEPENDENCY PKZIP + MULTI-SHEET EXCEL (.xlsx) BUILDER
// ===================================================================
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

async function deflateRaw(bytes) {
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    const buf = await new Response(stream).arrayBuffer();
    return { data: new Uint8Array(buf), method: 8 };
  } catch (_) {
    return { data: bytes, method: 0 };
  }
}

async function buildZipBytes(entries) {
  const now = new Date(Date.now() + 6.5 * 3600 * 1000);
  const dosDate = (((Math.max(1980, now.getUTCFullYear()) - 1980) & 0x7F) << 9) |
    (((now.getUTCMonth() + 1) & 0x0F) << 5) |
    (now.getUTCDate() & 0x1F);
  const dosTime = ((now.getUTCHours() & 0x1F) << 11) |
    ((now.getUTCMinutes() & 0x3F) << 5) |
    ((now.getUTCSeconds() >> 1) & 0x1F);

  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = textEnc.encode(entry.name);
    const rawBytes = entry.data instanceof Uint8Array ? entry.data : textEnc.encode(String(entry.data || ''));
    const crc = crc32(rawBytes);
    const { data: compBytes, method } = await deflateRaw(rawBytes);

    // Local File Header (30 bytes)
    const lh = new Uint8Array(30);
    const lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true); // UTF-8 filename flag
    lv.setUint16(8, method, true);
    lv.setUint16(10, dosTime, true);
    lv.setUint16(12, dosDate, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, compBytes.length, true);
    lv.setUint32(22, rawBytes.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);

    localParts.push(lh, nameBytes, compBytes);

    // Central Directory Header (46 bytes)
    const ch = new Uint8Array(46);
    const cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, method, true);
    cv.setUint16(12, dosTime, true);
    cv.setUint16(14, dosDate, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, compBytes.length, true);
    cv.setUint32(24, rawBytes.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);

    centralParts.push(ch, nameBytes);
    offset += lh.length + nameBytes.length + compBytes.length;
  }

  const cdOffset = offset;
  let cdSize = 0;
  for (const p of centralParts) cdSize += p.length;

  // End of Central Directory (22 bytes)
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, cdOffset, true);
  ev.setUint16(20, 0, true);

  const totalLen = offset + cdSize + eocd.length;
  const out = new Uint8Array(totalLen);
  let pos = 0;
  for (const p of localParts) { out.set(p, pos); pos += p.length; }
  for (const p of centralParts) { out.set(p, pos); pos += p.length; }
  out.set(eocd, pos);
  return out;
}

function colLetter(idx) {
  let s = '';
  let n = idx + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function buildWorksheetXml(headers, rows, widths, boldLastRow = false) {
  const colsXml = widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');
  const xmlRows = [];

  const renderRow = (cells, rowIdx, isHeader, isTotal) => {
    const cellXml = cells.map((val, cIdx) => {
      const ref = `${colLetter(cIdx)}${rowIdx}`;
      if (isHeader) {
        return `<c r="${ref}" t="inlineStr" s="1"><is><t xml:space="preserve">${escapeXml(val)}</t></is></c>`;
      }
      if (typeof val === 'number' && Number.isFinite(val)) {
        return `<c r="${ref}" s="${isTotal ? 3 : 2}"><v>${val}</v></c>`;
      }
      return `<c r="${ref}" t="inlineStr" s="${isTotal ? 1 : 0}"><is><t xml:space="preserve">${escapeXml(val ?? '')}</t></is></c>`;
    }).join('');
    return `<row r="${rowIdx}">${cellXml}</row>`;
  };

  xmlRows.push(renderRow(headers, 1, true, false));
  rows.forEach((r, i) => {
    xmlRows.push(renderRow(r, i + 2, false, boldLastRow && i === rows.length - 1));
  });

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<cols>${colsXml}</cols>` +
    `<sheetData>${xmlRows.join('')}</sheetData>` +
    `</worksheet>`;
}

async function buildMultiSheetXlsxBytes(exportData) {
  const sheetDefs = [];

  // Sheet 1: Summary
  const sumRows = (exportData.summary || []).map((s, i) => [
    i + 1, s.book_name, s.opening_balance, s.total_income, s.total_expense, s.closing_balance, s.row_count,
  ]);
  const totOpen = (exportData.summary || []).reduce((a, b) => a + Number(b.opening_balance || 0), 0);
  const totInc = (exportData.summary || []).reduce((a, b) => a + Number(b.total_income || 0), 0);
  const totExp = (exportData.summary || []).reduce((a, b) => a + Number(b.total_expense || 0), 0);
  const totClose = (exportData.summary || []).reduce((a, b) => a + Number(b.closing_balance || 0), 0);
  const totCnt = (exportData.summary || []).reduce((a, b) => a + Number(b.row_count || 0), 0);
  sumRows.push(['', `စုစုပေါင်း (FY: ${exportData.fy})`, roundMoney(totOpen), roundMoney(totInc), roundMoney(totExp), roundMoney(totClose), totCnt]);

  sheetDefs.push({
    name: 'Summary',
    xml: buildWorksheetXml(
      ['စဉ်', 'စာအုပ်အမည် (Book)', 'စာရင်းဖွင့်လက်ကျန်', 'စုစုပေါင်းဝင်ငွေ', 'စုစုပေါင်းထွက်ငွေ', 'လက်ကျန်ငွေ', 'စာကြောင်းရေ'],
      sumRows,
      [7, 26, 18, 18, 18, 18, 13],
      true
    ),
  });

  // Sheets 2..14: All 13 ERP Tables
  Object.entries(exportData.sheets || {}).forEach(([tblName, rows]) => {
    const safeName = String(tblName).replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31) || 'Sheet';
    let headers, body, widths;

    if (tblName === 'Inventory') {
      headers = ['စဉ်', 'ရက်စွဲ', 'တည်နေရာ', 'အမျိုးအစား', 'အကြောင်းအရာ', 'ရေတွက်ပုံ', 'အရေအတွက်', 'မှတ်ချက်', 'လနှစ်'];
      widths = [7, 13, 16, 18, 34, 10, 12, 24, 11];
      body = rows.map(r => [r.no, r.date, r.location, r.category, r.description, r.unit, r.qty, r.remark, r.month_year]);
    } else if (tblName === 'Permanent Yogi' || tblName === 'Camp Yogi') {
      headers = ['စဉ်', 'စတင်ရက်', 'ထွက်ရက်', 'အမျိုးအစား', 'ယောဂီအမည်', 'အဘအမည်', 'မှတ်ပုံတင်', 'မွေးသက္ကရာဇ်', 'အသက်', 'ကျား/မ', 'ယောဂီဖုန်း', 'အိမ်ဖုန်း', 'နေရပ်လိပ်စာ', 'အခြေအနေ'];
      widths = [7, 13, 13, 14, 22, 18, 22, 13, 8, 8, 16, 16, 32, 11];
      body = rows.map(r => [r.no, r.start_date, r.end_date, r.yogi_type, r.name, r.father_name, r.nrc, r.dob, r.age, r.gender, r.yogi_phone, r.home_phone, r.address, r.status]);
    } else {
      headers = ['စဉ်', 'ရက်စွဲ', 'ခေါင်းစဉ်', 'အကြောင်းအရာ', 'ဝင်ငွေ', 'ထွက်ငွေ', 'လက်ကျန်', 'ခေါင်းစဉ်ခွဲ', 'ဘောင်ချာ', 'လက်ခံသူ', 'လနှစ်', 'စာအုပ်အမည်'];
      widths = [7, 13, 18, 38, 15, 15, 16, 22, 14, 12, 11, 22];
      body = rows.map(r => [r.no, r.date, r.title, r.description, r.income, r.expense, r.balance, r.sub_title, r.voucher_no, r.receiver, r.month_year, r.book_name]);
    }

    sheetDefs.push({
      name: safeName,
      xml: buildWorksheetXml(headers, body, widths, false),
    });
  });

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    sheetDefs.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
    `</Types>`;

  const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
    `</Relationships>`;

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets>` +
    sheetDefs.map((s, i) => `<sheet name="${escapeXml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
    `</sheets></workbook>`;

  const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    sheetDefs.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
    `<Relationship Id="rId${sheetDefs.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    `</Relationships>`;

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>` +
    `<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFEF3C7"/><bgColor indexed="64"/></patternFill></fill></fills>` +
    `<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFCBD5E1"/></left><right style="thin"><color rgb="FFCBD5E1"/></right><top style="thin"><color rgb="FFCBD5E1"/></top><bottom style="thin"><color rgb="FFCBD5E1"/></bottom><diagonal/></border></borders>` +
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
    `<cellXfs count="4">` +
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
    `<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>` +
    `<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
    `<xf numFmtId="3" fontId="1" fillId="2" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>` +
    `</cellXfs></styleSheet>`;

  const zipEntries = [
    { name: '[Content_Types].xml', data: contentTypesXml },
    { name: '_rels/.rels', data: rootRelsXml },
    { name: 'xl/workbook.xml', data: workbookXml },
    { name: 'xl/_rels/workbook.xml.rels', data: workbookRelsXml },
    { name: 'xl/styles.xml', data: stylesXml },
    ...sheetDefs.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: s.xml })),
  ];

  return buildZipBytes(zipEntries);
}

// ===================================================================
// C. RESEND API EMAIL ENGINE (No Domain Required for Own Account Email)
// ===================================================================
async function sendResendEmail(env, { to, subject, html, attachments = [] }) {
  const apiKey = str(env.RESEND_API_KEY);
  if (!apiKey) {
    throw new HttpError(503, 'RESEND_API_KEY မထည့်ရသေးပါ။ Cloudflare Worker Settings → Secrets တွင် RESEND_API_KEY ထည့်သွင်းပေးပါ။');
  }
  const from = str(env.MAIL_FROM) || DEFAULT_MAIL_FROM;
  const recipients = String(to || env.MAIL_TO || DEFAULT_MAIL_TO)
    .split(',').map(s => s.trim()).filter(Boolean);

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: recipients,
      subject,
      html,
      ...(attachments.length ? { attachments } : {}),
    }),
  });

  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (_) { }
  if (!res.ok) {
    throw new HttpError(502, `Resend API Error (${res.status}): ${(json && (json.message || json.error)) || text.slice(0, 180)}`);
  }
  return json || { id: 'sent' };
}

// ===================================================================
// D. INTERNAL DATA COLLECTORS (Shared by HTTP Endpoints & Auto Cron)
// ===================================================================
async function collectExportExcelData(env, rawFy, maskPii, exportedBy) {
  const fyClean = toEngDigits(str(rawFy || 'ALL')).toUpperCase();
  const isAll = fyClean === 'ALL' || fyClean === '';
  if (!isAll && !/^\d{4}$/.test(fyClean)) {
    throw new HttpError(400, 'Invalid FY parameter (use ALL or YYYY e.g. 2026)');
  }

  const fyStart = isAll ? '' : `${fyClean}-01-01`;
  const fyEnd = isAll ? '' : `${fyClean}-12-31`;
  const fyStartYm = isAll ? '' : `${fyClean}-01`;

  const metaStmts = [
    env.DB.prepare(`SELECT DISTINCT substr(ym, 1, 4) AS yr FROM "ledger_summary" WHERE ym != '0000-00' AND row_count > 0 ORDER BY yr DESC`),
    isAll
      ? env.DB.prepare(`SELECT '' AS book_name, 0 AS opening WHERE 0`)
      : env.DB.prepare(
          `SELECT book_name, ROUND(COALESCE(SUM(total_income - total_expense), 0), 2) AS opening
           FROM "ledger_summary"
           WHERE ym < ? AND ym != '0000-00' AND row_count > 0
           GROUP BY book_name`
        ).bind(fyStartYm),
  ];

  const dataStmts = [
    ...LEDGER_TABLES.map(t => isAll
      ? env.DB.prepare(`SELECT * FROM "${t}" ORDER BY date ASC, id ASC`)
      : env.DB.prepare(`SELECT * FROM "${t}" WHERE date >= ? AND date <= ? ORDER BY date ASC, id ASC`).bind(fyStart, fyEnd)
    ),
    isAll
      ? env.DB.prepare(`SELECT * FROM "Inventory" ORDER BY date ASC, id ASC`)
      : env.DB.prepare(`SELECT * FROM "Inventory" WHERE date >= ? AND date <= ? ORDER BY date ASC, id ASC`).bind(fyStart, fyEnd),
    isAll
      ? env.DB.prepare(`SELECT * FROM "Permanent Yogi" ORDER BY start_date ASC, id ASC`)
      : env.DB.prepare(
          `SELECT * FROM "Permanent Yogi"
           WHERE start_date <= ? AND (end_date IS NULL OR end_date = '' OR end_date = '-' OR end_date >= ?)
           ORDER BY start_date ASC, id ASC`
        ).bind(fyEnd, fyStart),
    isAll
      ? env.DB.prepare(`SELECT * FROM "Camp Yogi" ORDER BY start_date ASC, id ASC`)
      : env.DB.prepare(
          `SELECT * FROM "Camp Yogi"
           WHERE start_date <= ? AND (end_date IS NULL OR end_date = '' OR end_date = '-' OR end_date >= ?)
           ORDER BY start_date ASC, id ASC`
        ).bind(fyEnd, fyStart),
  ];

  const allRes = await env.DB.batch([...metaStmts, ...dataStmts]);
  const yearsSet = new Set([todayMM().slice(0, 4)]);
  (allRes[0].results || []).forEach(r => {
    if (/^\d{4}$/.test(str(r.yr))) yearsSet.add(str(r.yr));
  });
  const availableYears = [...yearsSet].sort((a, b) => b.localeCompare(a));

  const openingMap = {};
  (allRes[1].results || []).forEach(r => {
    openingMap[str(r.book_name)] = roundMoney(parseFloat(r.opening) || 0);
  });

  const sheets = {};
  const summary = [];

  LEDGER_TABLES.forEach((tbl, i) => {
    const rawRows = allRes[2 + i].results || [];
    const opening = isAll ? 0 : (openingMap[tbl] || 0);
    let running = opening, totalInc = 0, totalExp = 0;

    sheets[tbl] = rawRows.map((row, idx) => {
      const inc = roundMoney(parseFloat(row.income) || 0);
      const exp = roundMoney(parseFloat(row.expense) || 0);
      totalInc = roundMoney(totalInc + inc);
      totalExp = roundMoney(totalExp + exp);
      running = roundMoney(running + inc - exp);
      return {
        no: idx + 1, date: row.date || '', title: row.title || '', description: row.description || '',
        income: inc, expense: exp, balance: running, sub_title: row.sub_title || '',
        voucher_no: row.voucher_no || '', receiver: row.receiver || '',
        month_year: row.month_year || formatMonthYear(row.date), book_name: tbl,
      };
    });

    summary.push({
      book_name: tbl, opening_balance: opening, total_income: totalInc,
      total_expense: totalExp, closing_balance: running, row_count: rawRows.length,
    });
  });

  const invRaw = allRes[2 + LEDGER_TABLES.length].results || [];
  sheets['Inventory'] = invRaw.map((row, idx) => ({
    no: idx + 1, date: row.date || '', location: row.location || '', category: row.category || '',
    description: row.description || '', unit: row.unit || '', qty: parseFloat(row.qty) || 0,
    remark: row.remark || '', month_year: row.month_year || formatMonthYear(row.date),
  }));

  const mapYogiRows = (rows) => rows.map((row, idx) => ({
    no: idx + 1, start_date: row.start_date || '', end_date: row.end_date || '',
    yogi_type: row.yogi_type || '', name: row.name || '', father_name: row.father_name || '',
    nrc: maskPii ? maskNrc(row.nrc) : (row.nrc || ''), dob: maskPii ? '' : (row.dob || ''),
    age: row.age || 0, gender: row.gender || '',
    yogi_phone: maskPii ? maskPhone(row.yogi_phone) : (row.yogi_phone || ''),
    home_phone: maskPii ? maskPhone(row.home_phone) : (row.home_phone || ''),
    address: maskPii ? '' : (row.address || ''),
    status: (!str(row.end_date) || str(row.end_date) === '-') ? 'Active' : 'Inactive',
  }));

  sheets['Permanent Yogi'] = mapYogiRows(allRes[2 + LEDGER_TABLES.length + 1].results || []);
  sheets['Camp Yogi'] = mapYogiRows(allRes[2 + LEDGER_TABLES.length + 2].results || []);

  return {
    success: true,
    fy: isAll ? 'ALL' : fyClean,
    exportedAt: new Date().toISOString(),
    exportedBy,
    availableYears,
    summary,
    sheets,
  };
}

async function collectDailyChanges(env, targetDate) {
  if (!isValidDateStr(targetDate)) throw new HttpError(400, 'Invalid date parameter (YYYY-MM-DD)');

  const { startUtc, endUtc } = mmDateToUtcRange(targetDate);
  const versionsMap = await getAllVersionsMap(env);
  const fingerprint = buildVersionFingerprint(versionsMap);

  // Fast 13-row pre-filter
  const candidateTables = ALL_TRACKED_TABLES.filter(t => {
    const upd = str(versionsMap[t]?.updated_at);
    return !upd || upd >= startUtc;
  });

  const byTable = {};
  let totalChanged = 0;

  if (candidateTables.length > 0) {
    const stmts = candidateTables.map(t => {
      if (t === 'Permanent Yogi' || t === 'Camp Yogi') {
        return env.DB.prepare(
          `SELECT unique_id, start_date, end_date, yogi_type, name, gender, updated_at
           FROM "${t}"
           WHERE (updated_at >= ? AND updated_at <= ?) OR start_date = ? OR end_date = ?
           ORDER BY id DESC LIMIT 100`
        ).bind(startUtc, endUtc, targetDate, targetDate);
      }
      if (t === 'Inventory') {
        return env.DB.prepare(
          `SELECT unique_id, date, location, category, description, unit, qty, updated_at
           FROM "Inventory"
           WHERE (updated_at >= ? AND updated_at <= ?) OR date = ?
           ORDER BY id DESC LIMIT 100`
        ).bind(startUtc, endUtc, targetDate);
      }
      return env.DB.prepare(
        `SELECT unique_id, date, title, sub_title, description, income, expense, receiver, voucher_no, updated_at
         FROM "${t}"
         WHERE (updated_at >= ? AND updated_at <= ?) OR date = ?
         ORDER BY id DESC LIMIT 100`
      ).bind(startUtc, endUtc, targetDate);
    });

    const resList = await env.DB.batch(stmts);
    candidateTables.forEach((tbl, i) => {
      const rows = resList[i].results || [];
      if (rows.length > 0) {
        byTable[tbl] = rows;
        totalChanged += rows.length;
      }
    });
  }

  let auditActions = [];
  try {
    const auditRes = await env.DB.prepare(
      `SELECT actor, role, action, target_table, target_uid, summary, created_at
       FROM "audit_logs"
       WHERE created_at >= ? AND created_at <= ?
         AND action NOT IN ('REBUILD_SUMMARIES', 'CHANGE_PASSWORD', 'MANUAL_MAIL', 'DRIVE_BACKUP', 'AUTO_MAIL', 'AUTO_BACKUP')
       ORDER BY id DESC LIMIT 100`
    ).bind(startUtc, endUtc).all();
    auditActions = auditRes.results || [];
  } catch (_) { }

  return {
    success: true,
    date: targetDate,
    utcRange: { startUtc, endUtc },
    hasChanges: totalChanged > 0 || auditActions.length > 0,
    totalChanged,
    auditCount: auditActions.length,
    fingerprint,
    byTable,
    auditActions,
  };
}

async function collectSqlDump(env, exportedBy) {
  const versionsMap = await getAllVersionsMap(env);
  const fingerprint = buildVersionFingerprint(versionsMap);

  const [schemaRes, ...tableResults] = await env.DB.batch([
    env.DB.prepare(
      `SELECT type, name, sql FROM sqlite_master
       WHERE type IN ('table', 'index') AND sql IS NOT NULL
         AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'
       ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END, name ASC`
    ),
    ...ALL_TRACKED_TABLES.map(t => env.DB.prepare(`SELECT * FROM "${t}" ORDER BY id ASC`)),
  ]);

  const lines = [
    `-- ===================================================================`,
    `-- SĀSANA ERP (D1 SQLite) Full SQL Backup`,
    `-- Generated At (UTC): ${new Date().toISOString()}`,
    `-- Generated Date (MMT): ${todayMM()}`,
    `-- Exported By: ${exportedBy}`,
    `-- Fingerprint: ${fingerprint}`,
    `-- ===================================================================`,
    `PRAGMA foreign_keys = OFF;`,
    `BEGIN TRANSACTION;`,
    ``,
  ];

  (schemaRes.results || []).forEach(obj => {
    const ddl = String(obj.sql || '').trim();
    if (!ddl) return;
    const safeDdl = ddl
      .replace(/^CREATE TABLE\s+(?!IF NOT EXISTS)/i, 'CREATE TABLE IF NOT EXISTS ')
      .replace(/^CREATE UNIQUE INDEX\s+(?!IF NOT EXISTS)/i, 'CREATE UNIQUE INDEX IF NOT EXISTS ')
      .replace(/^CREATE INDEX\s+(?!IF NOT EXISTS)/i, 'CREATE INDEX IF NOT EXISTS ');
    lines.push(`${safeDdl};`);
  });

  lines.push('');

  let totalRows = 0;
  ALL_TRACKED_TABLES.forEach((tbl, i) => {
    const rows = tableResults[i].results || [];
    lines.push(`-- Table: "${tbl}" (${rows.length} rows)`);
    rows.forEach(row => {
      const cols = Object.keys(row);
      const colList = cols.map(k => `"${k}"`).join(', ');
      const valList = cols.map(k => sqlVal(row[k])).join(', ');
      lines.push(`INSERT OR REPLACE INTO "${tbl}" (${colList}) VALUES (${valList});`);
      totalRows++;
    });
    lines.push('');
  });

  lines.push(`COMMIT;`, `PRAGMA foreign_keys = ON;`);
  const sql = lines.join('\n');
  const filename = `Sasana_ERP_D1_Backup_${todayMM()}.sql`;

  return {
    success: true,
    generatedAt: new Date().toISOString(),
    date: todayMM(),
    filename,
    fingerprint,
    totalRows,
    sql,
  };
}

function buildDailyMailHtml(changes, fy, triggeredBy) {
  const byTable = changes.byTable || {};
  const tables = Object.keys(byTable);
  let rowsHtml = '';

  if (tables.length === 0) {
    rowsHtml = `<p style="color:#64748b;">(${escapeHtml(changes.date)} ရက်နေ့အတွက် စာရင်းအသစ် ထည့်သွင်းမှု မရှိသေးပါ — Manual တောင်းဆိုမှုအရ FY ${escapeHtml(fy)} Excel ဖိုင်အား ပူးတွဲပေးပို့အပ်ပါသည်။)</p>`;
  } else {
    tables.forEach(tbl => {
      const list = byTable[tbl] || [];
      rowsHtml += `<h4 style="margin:16px 0 6px 0; color:#b45309;">📘 ${escapeHtml(tbl)} (${list.length} ကြောင်း)</h4>`;
      rowsHtml += `<table style="width:100%; border-collapse:collapse; font-size:12.5px; margin-bottom:10px;">
        <thead>
          <tr style="background:#f1f5f9; text-align:left;">
            <th style="padding:6px 8px; border:1px solid #cbd5e1;">ရက်စွဲ</th>
            <th style="padding:6px 8px; border:1px solid #cbd5e1;">ခေါင်းစဉ် / အမည်</th>
            <th style="padding:6px 8px; border:1px solid #cbd5e1;">အကြောင်းအရာ</th>
            <th style="padding:6px 8px; border:1px solid #cbd5e1; text-align:right;">ဝင်ငွေ</th>
            <th style="padding:6px 8px; border:1px solid #cbd5e1; text-align:right;">ထွက်ငွေ</th>
          </tr>
        </thead><tbody>`;

      list.slice(0, 40).forEach(r => {
        const dt = r.date || r.start_date || '';
        const title = r.title || r.category || r.yogi_type || '-';
        const desc = r.description || r.name || '-';
        const inc = r.income ? Number(r.income).toLocaleString() : '-';
        const exp = r.expense ? Number(r.expense).toLocaleString() : (r.qty !== undefined ? `Qty: ${r.qty}` : '-');
        rowsHtml += `<tr>
          <td style="padding:5px 8px; border:1px solid #e2e8f0; white-space:nowrap;">${escapeHtml(dt)}</td>
          <td style="padding:5px 8px; border:1px solid #e2e8f0;">${escapeHtml(title)}</td>
          <td style="padding:5px 8px; border:1px solid #e2e8f0;">${escapeHtml(desc)}</td>
          <td style="padding:5px 8px; border:1px solid #e2e8f0; text-align:right; color:#059669; font-weight:bold;">${escapeHtml(inc)}</td>
          <td style="padding:5px 8px; border:1px solid #e2e8f0; text-align:right; color:#e11d48; font-weight:bold;">${escapeHtml(exp)}</td>
        </tr>`;
      });
      rowsHtml += `</tbody></table>`;
    });
  }

  return `
    <div style="font-family:sans-serif; max-width:740px; margin:auto; color:#1e293b; line-height:1.6;">
      <div style="background:#0c1118; color:#fbbf24; padding:18px 22px; border-radius:12px 12px 0 0;">
        <h2 style="margin:0; font-size:18px;">ဓမ္မအလင်းရောင်တောရရိပ်သာ — Sāsana ERP</h2>
        <div style="color:#94a3b8; font-size:12px; margin-top:4px;">နေ့စဉ်ငွေစာရင်း အစီရင်ခံစာ (${escapeHtml(changes.date)}) · FY ${escapeHtml(fy)}</div>
      </div>
      <div style="border:1px solid #cbd5e1; border-top:none; padding:18px 22px; border-radius:0 0 12px 12px;">
        <p style="margin-top:0;">
          <b>ရက်စွဲ:</b> ${escapeHtml(changes.date)} &nbsp;|&nbsp;
          <b>စာရင်းအသစ်/ပြင်ဆင်မှု:</b> ${Number(changes.totalChanged || 0)} ကြောင်း &nbsp;|&nbsp;
          <b>ပေးပို့သူ:</b> ${escapeHtml(triggeredBy)}
        </p>
        ${rowsHtml}
        <hr style="border:none; border-top:1px solid #e2e8f0; margin:18px 0;">
        <p style="font-size:12px; color:#64748b; margin-bottom:0;">
          📎 စာအုပ်အားလုံး (Sheet ၁၄ ခု အပြည့်အစုံ) ပါဝင်သော Excel (<code>.xlsx</code>) ဖိုင်အား Attachment တွင် ပူးတွဲပေးပို့ထားပါသည်။
        </p>
      </div>
    </div>`;
}

async function executeDailyMail(env, { date, fy, force = false, triggeredBy = 'System' }) {
  const targetDate = date || yesterdayMM();
  const changes = await collectDailyChanges(env, targetDate);

  if (!force && !changes.hasChanges) {
    return {
      success: true,
      sent: false,
      skipped: true,
      date: targetDate,
      message: `${targetDate} ရက်နေ့အတွက် စာရင်းအသစ် မရှိသဖြင့် Mail မပို့ပါ။`,
    };
  }

  const targetFy = fy || targetDate.slice(0, 4);
  const exportData = await collectExportExcelData(env, targetFy, false, triggeredBy);
  const xlsxBytes = await buildMultiSheetXlsxBytes(exportData);
  const fileName = `Sasana_ERP_FY_${exportData.fy}_${targetDate}.xlsx`;
  const mailTo = str(env.MAIL_TO) || DEFAULT_MAIL_TO;

  await sendResendEmail(env, {
    to: mailTo,
    subject: `[Sāsana ERP] နေ့စဉ်ငွေစာရင်း အစီရင်ခံစာ (${targetDate}) — FY ${exportData.fy}`,
    html: buildDailyMailHtml(changes, exportData.fy, triggeredBy),
    attachments: [{ filename: fileName, content: bytesToBase64(xlsxBytes) }],
  });

  await setSystemMeta(env, 'last_mail_date', targetDate);
  return {
    success: true,
    sent: true,
    skipped: false,
    date: targetDate,
    fy: exportData.fy,
    fileName,
    totalChanged: changes.totalChanged,
    message: `${mailTo} သို့ ${fileName} ပူးတွဲ၍ Mail ပေးပို့ပြီးပါပြီ (စာရင်းအသစ် ${changes.totalChanged} ကြောင်း)။`,
  };
}

async function executeSqlZipBackup(env, { mode = 'manual', force = false, triggeredBy = 'System' }) {
  const metaKey = mode === 'archive' ? 'last_archive_backup_fp' : 'last_sql_backup_fp';
  const versionsMap = await getAllVersionsMap(env);
  const currentFp = buildVersionFingerprint(versionsMap);
  const prevFp = await getSystemMeta(env, metaKey);

  if (!force && prevFp && prevFp === currentFp) {
    return {
      success: true,
      skipped: true,
      mode,
      message: 'နောက်ဆုံး Backup သိမ်းထားချိန်မှစ၍ ဒေတာအသစ် မရှိသေးပါသဖြင့် Backup အပို မသိမ်းပါ။',
    };
  }

  const dump = await collectSqlDump(env, triggeredBy);
  const dateStr = todayMM();
  const modeTag = String(mode || 'manual').toUpperCase();
  const zipName = `Sasana_ERP_D1_${modeTag}_${dateStr}.zip`;
  const zipBytes = await buildZipBytes([{ name: dump.filename, data: dump.sql }]);
  const mailTo = str(env.MAIL_TO) || DEFAULT_MAIL_TO;

  const sizeKB = Math.max(1, Math.round(zipBytes.length / 1024));
  const html = `
    <div style="font-family:sans-serif; max-width:680px; margin:auto; color:#1e293b; line-height:1.6;">
      <div style="background:#0c1118; color:#fbbf24; padding:18px 22px; border-radius:12px 12px 0 0;">
        <h2 style="margin:0; font-size:18px;">Sāsana ERP — D1 SQL (.zip) Backup</h2>
        <div style="color:#94a3b8; font-size:12px; margin-top:4px;">Mode: ${escapeHtml(modeTag)} · ရက်စွဲ: ${escapeHtml(dateStr)}</div>
      </div>
      <div style="border:1px solid #cbd5e1; border-top:none; padding:18px 22px; border-radius:0 0 12px 12px;">
        <p style="margin-top:0;">
          <b>ဖိုင်အမည်:</b> <code>${escapeHtml(zipName)}</code> (${sizeKB} KB)<br/>
          <b>စာရင်းစုစုပေါင်း:</b> ${Number(dump.totalRows || 0).toLocaleString()} rows (Table ၁၃ ခု အပြည့်အစုံ)<br/>
          <b>လုပ်ဆောင်သူ:</b> ${escapeHtml(triggeredBy)}
        </p>
        <p style="font-size:12.5px; color:#475569; margin-bottom:0;">
          ☁️ Gmail ထဲက Attachment ပေါ်တွင် <b>"Add to Drive"</b> ခလုတ်ကို တစ်ချက်နှိပ်ရုံဖြင့် Google Drive ထဲသို့ပါ တိုက်ရိုက်သိမ်းဆည်းနိုင်ပါသည်။
        </p>
      </div>
    </div>`;

  await sendResendEmail(env, {
    to: mailTo,
    subject: `[Sāsana ERP SQL BACKUP — ${modeTag}] ${dateStr} (${dump.totalRows} rows)`,
    html,
    attachments: [{ filename: zipName, content: bytesToBase64(zipBytes) }],
  });

  await setSystemMeta(env, metaKey, dump.fingerprint);
  if (mode === 'manual') await setSystemMeta(env, 'last_sql_backup_fp', dump.fingerprint);

  return {
    success: true,
    skipped: false,
    mode,
    fileName: zipName,
    totalRows: dump.totalRows,
    sizeKB,
    message: `${zipName} (${dump.totalRows} rows, ${sizeKB} KB) ကို ${mailTo} သို့ ပေးပို့သိမ်းဆည်းပြီးပါပြီ။`,
  };
}

// ===================================================================
// E. SCHEDULED CRON AUTOMATION (Runs Daily at 12:00 AM MMT = 17:30 UTC)
// ===================================================================
export async function runScheduledAutomation(env) {
  const mmNow = new Date(Date.now() + 6.5 * 3600 * 1000);
  const mmDow = mmNow.getUTCDay();    // 0 = Sunday
  const mmDay = mmNow.getUTCDate();   // 1..31
  const mmMonth = mmNow.getUTCMonth() + 1; // 1..12

  let hadDailyChanges = false;

  // 1. Daily 12:00 AM Auto Excel Mail (Only if yesterday had new/updated entries)
  if (str(env.RESEND_API_KEY)) {
    try {
      const mailRes = await executeDailyMail(env, {
        date: yesterdayMM(),
        force: false,
        triggeredBy: 'Auto Cron 12:00 AM MMT',
      });
      hadDailyChanges = !mailRes.skipped;
      if (mailRes.sent) {
        await env.DB.batch([auditStmt(env, { u: 'cron', r: 'System' }, 'AUTO_MAIL', 'SYSTEM', mailRes.date, mailRes.fileName)]);
      }
    } catch (e) {
      console.error('[Cron Daily Mail Error]', e);
    }

    // 2. Weekly Sunday SQL .zip Backup (Only if data changed since last backup)
    if (mmDow === 0) {
      try {
        const wkRes = await executeSqlZipBackup(env, {
          mode: 'weekly',
          force: false,
          triggeredBy: 'Auto Weekly Sunday',
        });
        if (!wkRes.skipped) {
          await env.DB.batch([auditStmt(env, { u: 'cron', r: 'System' }, 'AUTO_BACKUP', 'SYSTEM', todayMM(), wkRes.fileName)]);
        }
      } catch (e) {
        console.error('[Cron Weekly Backup Error]', e);
      }
    }

    // 3. Quarterly Archive SQL .zip Backup (Jan 1, Apr 1, Jul 1, Oct 1 — Only if changed)
    if (mmDay === 1 && [1, 4, 7, 10].includes(mmMonth)) {
      try {
        const qRes = await executeSqlZipBackup(env, {
          mode: 'archive',
          force: false,
          triggeredBy: 'Auto Quarterly Archive',
        });
        if (!qRes.skipped) {
          await env.DB.batch([auditStmt(env, { u: 'cron', r: 'System' }, 'AUTO_BACKUP', 'SYSTEM', todayMM(), qRes.fileName)]);
        }
      } catch (e) {
        console.error('[Cron Quarterly Backup Error]', e);
      }
    }
  }

  // 4. Nightly Maintenance (Rebuild summaries ONLY if changes happened, so idle days don't bump versions!)
  try {
    if (hadDailyChanges) {
      await rebuildAllSummaries(env, { u: 'cron', r: 'System' });
    }
    await env.DB.prepare(`DELETE FROM "login_attempts" WHERE locked_until > 0 AND locked_until < ?`).bind(Date.now()).run();
  } catch (e) {
    console.error('[Cron Maintenance Error]', e);
  }
}

// ===================================================================
// F. HTTP ENDPOINT HANDLERS
// ===================================================================
export async function handleSystemD1Metrics(c) {
  const { env } = c;
  const accountId = str(env.CF_ACCOUNT_ID) || DEFAULT_CF_ACCOUNT_ID;
  const databaseId = str(env.CF_DATABASE_ID) || DEFAULT_CF_DB_ID;
  const cfToken = str(env.CF_API_TOKEN);

  const [versionsRes, sizeProbe] = await env.DB.batch([
    env.DB.prepare(`SELECT table_name, version, row_count, updated_at FROM "book_versions"`),
    env.DB.prepare(`SELECT 1 AS ok`),
  ]);

  let totalTrackedRows = 0;
  let lastDataUpdate = '';
  (versionsRes.results || []).forEach(r => {
    totalTrackedRows += Number(r.row_count || 0);
    if (r.updated_at && String(r.updated_at) > lastDataUpdate) lastDataUpdate = String(r.updated_at);
  });

  let storageBytes = Number(sizeProbe?.meta?.size_after || 0);
  const nowUtc = new Date();
  const todayUtc = nowUtc.toISOString().slice(0, 10);
  const start30d = new Date(nowUtc.getTime() - 29 * 86400000).toISOString().slice(0, 10);

  let analyticsConfigured = Boolean(cfToken);
  let analyticsError = null;
  let todayRead = 0, todayWrite = 0, todayReadQueries = 0, todayWriteQueries = 0;
  let totalRead30d = 0, totalWrite30d = 0, totalReadQueries30d = 0, totalWriteQueries30d = 0;

  if (cfToken) {
    const query = `
      query D1Metrics($accountTag: string!, $start: Date, $end: Date, $databaseId: string) {
        viewer {
          accounts(filter: { accountTag: $accountTag }) {
            d1AnalyticsAdaptiveGroups(
              limit: 1000
              filter: { date_geq: $start, date_leq: $end, databaseId: $databaseId }
              orderBy: [date_DESC]
            ) {
              sum { readQueries writeQueries rowsRead rowsWritten }
              dimensions { date }
            }
            d1StorageAdaptiveGroups(
              limit: 10
              filter: { date_geq: $start, date_leq: $end, databaseId: $databaseId }
              orderBy: [date_DESC]
            ) {
              max { databaseSizeBytes }
              dimensions { date }
            }
          }
        }
      }`;

    try {
      const gqlRes = await fetch('https://api.cloudflare.com/client/v4/graphql', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${cfToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables: { accountTag: accountId, start: start30d, end: todayUtc, databaseId } }),
      });
      const gqlJson = await gqlRes.json();
      if (!gqlRes.ok || (gqlJson.errors && gqlJson.errors.length)) {
        analyticsError = gqlJson.errors?.[0]?.message || `Cloudflare GraphQL HTTP ${gqlRes.status}`;
      } else {
        const acc = gqlJson?.data?.viewer?.accounts?.[0];
        (acc?.d1AnalyticsAdaptiveGroups || []).forEach(g => {
          const rRows = Number(g?.sum?.rowsRead || 0);
          const wRows = Number(g?.sum?.rowsWritten || 0);
          const rQ = Number(g?.sum?.readQueries || 0);
          const wQ = Number(g?.sum?.writeQueries || 0);
          totalRead30d += rRows; totalWrite30d += wRows;
          totalReadQueries30d += rQ; totalWriteQueries30d += wQ;
          if (g?.dimensions?.date === todayUtc) {
            todayRead += rRows; todayWrite += wRows;
            todayReadQueries += rQ; todayWriteQueries += wQ;
          }
        });
        const gqlBytes = Number(acc?.d1StorageAdaptiveGroups?.[0]?.max?.databaseSizeBytes || 0);
        if (gqlBytes > 0) storageBytes = gqlBytes;
      }
    } catch (err) {
      analyticsError = err.message || 'Failed to fetch Cloudflare GraphQL';
    }
  }

  const readUsedPct = pct(todayRead, D1_DAILY_READ_LIMIT);
  const writeUsedPct = pct(todayWrite, D1_DAILY_WRITE_LIMIT);
  const storageUsedPct = pct(storageBytes, D1_STORAGE_LIMIT_BYTES);

  return c.J({
    success: true,
    analyticsConfigured,
    analyticsError,
    mailConfigured: Boolean(str(env.RESEND_API_KEY)),
    todayUtc,
    todayMM: todayMM(),
    windowStartUtc: start30d,
    lastDataUpdate,
    totalTrackedRows,
    today: {
      rowsRead: todayRead, rowsReadLimit: D1_DAILY_READ_LIMIT,
      rowsReadPct: readUsedPct, rowsReadRemainingPct: roundMoney(100 - readUsedPct),
      rowsWritten: todayWrite, rowsWrittenLimit: D1_DAILY_WRITE_LIMIT,
      rowsWrittenPct: writeUsedPct, rowsWrittenRemainingPct: roundMoney(100 - writeUsedPct),
      readQueries: todayReadQueries, writeQueries: todayWriteQueries,
    },
    total30d: {
      rowsRead: totalRead30d, rowsWritten: totalWrite30d,
      readQueries: totalReadQueries30d, writeQueries: totalWriteQueries30d,
    },
    storage: {
      usedBytes: storageBytes,
      usedMB: Math.round((storageBytes / (1024 * 1024)) * 100) / 100,
      limitMB: 500, usedPct: storageUsedPct, remainingPct: roundMoney(100 - storageUsedPct),
    },
  });
}

export async function handleSystemExportExcel(c) {
  const fy = c.url.searchParams.get('fy') || 'ALL';
  const data = await collectExportExcelData(c.env, fy, isViewer(c.user), c.user.u);
  return c.J(data);
}

export async function handleSystemDailyChanges(c) {
  const mode = str(c.url.searchParams.get('mode')).toLowerCase();
  const dateParam = toEngDigits(str(c.url.searchParams.get('date')));
  const targetDate = dateParam || (mode === 'yesterday' ? yesterdayMM() : todayMM());
  return c.J(await collectDailyChanges(c.env, targetDate));
}

export async function handleSystemSqlDump(c) {
  if (!isAdmin(c.user)) throw new HttpError(403, 'Admin တစ်ဦးတည်းသာ SQL Dump ထုတ်ယူခွင့် ရှိပါသည်။');
  const dump = await collectSqlDump(c.env, c.user.u);
  const fmt = str(c.url.searchParams.get('format')).toLowerCase();
  if (fmt === 'zip') {
    const zipBytes = await buildZipBytes([{ name: dump.filename, data: dump.sql }]);
    const zipName = `Sasana_ERP_D1_Backup_${todayMM()}.zip`;
    return new Response(zipBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${zipName}"`,
      },
    });
  }
  return c.J(dump);
}

export async function handleSystemTriggerMail(c) {
  let body = {};
  try { body = await readJson(c.request); } catch (_) { body = {}; }
  const fy = toEngDigits(str(body.fy || todayMM().slice(0, 4))).toUpperCase();
  const date = toEngDigits(str(body.date || todayMM()));
  const force = body.force !== false;

  const res = await executeDailyMail(c.env, {
    date,
    fy,
    force,
    triggeredBy: `${c.user.u} (${c.user.r})`,
  });

  if (res.sent) {
    await c.env.DB.batch([auditStmt(c.env, c.user, 'MANUAL_MAIL', 'SYSTEM', date, `fy=${fy}, file=${res.fileName}`)]);
  }
  return c.J(res);
}

export async function handleSystemTriggerDriveBackup(c) {
  let body = {};
  try { body = await readJson(c.request); } catch (_) { body = {}; }
  const force = body.force === true;

  const res = await executeSqlZipBackup(c.env, {
    mode: 'manual',
    force,
    triggeredBy: `${c.user.u} (${c.user.r})`,
  });

  await c.env.DB.batch([
    auditStmt(c.env, c.user, 'DRIVE_BACKUP', 'SYSTEM', todayMM(), res.skipped ? 'Skipped (no new data)' : res.fileName),
  ]);
  return c.J(res);
}

// -------------------------------------------------------------------
// EXISTING ADMIN ENDPOINTS
// -------------------------------------------------------------------
export async function handleAdminRebuildSummaries(c) {
  if (!isAdmin(c.user)) throw new HttpError(403, 'Admin တစ်ဦးတည်းသာ လုပ်ဆောင်ခွင့် ရှိပါသည်။');
  await rebuildAllSummaries(c.env, c.user);
  return c.J({ success: true, message: 'All summaries and versions rebuilt successfully' });
}

export async function handleAdminBackup(c) {
  if (!isAdmin(c.user)) throw new HttpError(403, 'Admin တစ်ဦးတည်းသာ Backup ထုတ်ယူခွင့် ရှိပါသည်။');
  const tablesRes = await c.env.DB.batch(
    ALL_TRACKED_TABLES.map(t => c.env.DB.prepare(`SELECT * FROM "${t}" ORDER BY id ASC`))
  );
  const backup = {};
  ALL_TRACKED_TABLES.forEach((t, i) => { backup[t] = tablesRes[i].results || []; });
  return c.J({ success: true, exportedAt: new Date().toISOString(), exportedBy: c.user.u, tables: backup });
}

export async function handleAdminAuditLogs(c) {
  if (!isAdmin(c.user)) throw new HttpError(403, 'Admin တစ်ဦးတည်းသာ ကြည့်ရှုခွင့် ရှိပါသည်။');
  const limit = Math.min(200, Math.max(10, parseInt(c.url.searchParams.get('limit') || '50', 10) || 50));
  const { results } = await c.env.DB.prepare(`SELECT * FROM "audit_logs" ORDER BY id DESC LIMIT ?`).bind(limit).all();
  return c.J({ success: true, data: results || [] });
}
