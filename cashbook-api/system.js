// ===================================================================
// cashbook-api/system.js - System Control, D1 Analytics, FY Excel Export,
// Daily Changes Detector, SQL Dump & Google Apps Script Automation Bridge
// ===================================================================

import {
  HttpError, ALL_TRACKED_TABLES, LEDGER_TABLES,
  str, toEngDigits, roundMoney, todayMM, yesterdayMM, isValidDateStr,
  formatMonthYear, readJson, isAdmin, isViewer, maskNrc, maskPhone,
  auditStmt, getAllVersionsMap, rebuildAllSummaries,
} from './core.js';

const DEFAULT_CF_ACCOUNT_ID = 'bf411663ab2f1ced269542eaf3369104';
const DEFAULT_CF_DB_ID = '52727cc9-9e40-49d0-92f1-a1b9eb3758fd';

// Cloudflare D1 Free Tier Quotas
const D1_DAILY_READ_LIMIT = 5000000;
const D1_DAILY_WRITE_LIMIT = 100000;
const D1_STORAGE_LIMIT_BYTES = 500 * 1024 * 1024; // 500 MB

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

// -------------------------------------------------------------------
// 1. D1 ANALYTICS & LIVE QUOTA METRICS (/api/system/d1-metrics)
// -------------------------------------------------------------------
export async function handleSystemD1Metrics(c) {
  const { env } = c;
  const accountId = str(env.CF_ACCOUNT_ID) || DEFAULT_CF_ACCOUNT_ID;
  const databaseId = str(env.CF_DATABASE_ID) || DEFAULT_CF_DB_ID;
  const cfToken = str(env.CF_API_TOKEN);

  // Instant local D1 stats (13 rows + live SQLite size_after metadata)
  const [versionsRes, sizeProbe] = await env.DB.batch([
    env.DB.prepare(`SELECT table_name, version, row_count, updated_at FROM "book_versions"`),
    env.DB.prepare(`SELECT 1 AS ok`),
  ]);

  let totalTrackedRows = 0;
  let lastDataUpdate = '';
  (versionsRes.results || []).forEach(r => {
    totalTrackedRows += Number(r.row_count || 0);
    if (r.updated_at && String(r.updated_at) > lastDataUpdate) {
      lastDataUpdate = String(r.updated_at);
    }
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
        headers: {
          'Authorization': `Bearer ${cfToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          variables: { accountTag: accountId, start: start30d, end: todayUtc, databaseId },
        }),
      });

      const gqlJson = await gqlRes.json();
      if (!gqlRes.ok || (gqlJson.errors && gqlJson.errors.length)) {
        analyticsError = gqlJson.errors?.[0]?.message || `Cloudflare GraphQL HTTP ${gqlRes.status}`;
      } else {
        const acc = gqlJson?.data?.viewer?.accounts?.[0];
        const groups = acc?.d1AnalyticsAdaptiveGroups || [];
        groups.forEach(g => {
          const rRows = Number(g?.sum?.rowsRead || 0);
          const wRows = Number(g?.sum?.rowsWritten || 0);
          const rQ = Number(g?.sum?.readQueries || 0);
          const wQ = Number(g?.sum?.writeQueries || 0);

          totalRead30d += rRows;
          totalWrite30d += wRows;
          totalReadQueries30d += rQ;
          totalWriteQueries30d += wQ;

          if (g?.dimensions?.date === todayUtc) {
            todayRead += rRows;
            todayWrite += wRows;
            todayReadQueries += rQ;
            todayWriteQueries += wQ;
          }
        });

        const storageList = acc?.d1StorageAdaptiveGroups || [];
        const gqlBytes = Number(storageList[0]?.max?.databaseSizeBytes || 0);
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
    gasConfigured: Boolean(str(env.GAS_WEBHOOK_URL)),
    todayUtc,
    todayMM: todayMM(),
    windowStartUtc: start30d,
    lastDataUpdate,
    totalTrackedRows,
    today: {
      rowsRead: todayRead,
      rowsReadLimit: D1_DAILY_READ_LIMIT,
      rowsReadPct: readUsedPct,
      rowsReadRemainingPct: roundMoney(100 - readUsedPct),
      rowsWritten: todayWrite,
      rowsWrittenLimit: D1_DAILY_WRITE_LIMIT,
      rowsWrittenPct: writeUsedPct,
      rowsWrittenRemainingPct: roundMoney(100 - writeUsedPct),
      readQueries: todayReadQueries,
      writeQueries: todayWriteQueries,
    },
    total30d: {
      rowsRead: totalRead30d,
      rowsWritten: totalWrite30d,
      readQueries: totalReadQueries30d,
      writeQueries: totalWriteQueries30d,
    },
    storage: {
      usedBytes: storageBytes,
      usedMB: Math.round((storageBytes / (1024 * 1024)) * 100) / 100,
      limitMB: 500,
      usedPct: storageUsedPct,
      remainingPct: roundMoney(100 - storageUsedPct),
    },
  });
}

// -------------------------------------------------------------------
// 2. MULTI-SHEET FY EXCEL EXPORT DATA (/api/system/export-excel?fy=2026|ALL)
// -------------------------------------------------------------------
export async function handleSystemExportExcel(c) {
  const { env, url, user } = c;
  const rawFy = toEngDigits(str(url.searchParams.get('fy') || 'ALL')).toUpperCase();
  const isAll = rawFy === 'ALL' || rawFy === '';
  if (!isAll && !/^\d{4}$/.test(rawFy)) {
    throw new HttpError(400, 'Invalid FY parameter (use ALL or YYYY e.g. 2026)');
  }

  const maskPii = isViewer(user);
  const fyStart = isAll ? '' : `${rawFy}-01-01`;
  const fyEnd = isAll ? '' : `${rawFy}-12-31`;
  const fyStartYm = isAll ? '' : `${rawFy}-01`;

  // Fetch available years + opening balances (for filtered FY)
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

  // Fetch all 10 ledgers + Inventory + 2 Yogi tables in one atomic batch
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
        no: idx + 1,
        date: row.date || '',
        title: row.title || '',
        description: row.description || '',
        income: inc,
        expense: exp,
        balance: running,
        sub_title: row.sub_title || '',
        voucher_no: row.voucher_no || '',
        receiver: row.receiver || '',
        month_year: row.month_year || formatMonthYear(row.date),
        book_name: tbl,
      };
    });

    summary.push({
      book_name: tbl,
      opening_balance: opening,
      total_income: totalInc,
      total_expense: totalExp,
      closing_balance: running,
      row_count: rawRows.length,
    });
  });

  const invRaw = allRes[2 + LEDGER_TABLES.length].results || [];
  sheets['Inventory'] = invRaw.map((row, idx) => ({
    no: idx + 1,
    date: row.date || '',
    location: row.location || '',
    category: row.category || '',
    description: row.description || '',
    unit: row.unit || '',
    qty: parseFloat(row.qty) || 0,
    remark: row.remark || '',
    month_year: row.month_year || formatMonthYear(row.date),
  }));

  const mapYogiRows = (rows) => rows.map((row, idx) => ({
    no: idx + 1,
    start_date: row.start_date || '',
    end_date: row.end_date || '',
    yogi_type: row.yogi_type || '',
    name: row.name || '',
    father_name: row.father_name || '',
    nrc: maskPii ? maskNrc(row.nrc) : (row.nrc || ''),
    dob: maskPii ? '' : (row.dob || ''),
    age: row.age || 0,
    gender: row.gender || '',
    yogi_phone: maskPii ? maskPhone(row.yogi_phone) : (row.yogi_phone || ''),
    home_phone: maskPii ? maskPhone(row.home_phone) : (row.home_phone || ''),
    address: maskPii ? '' : (row.address || ''),
    status: (!str(row.end_date) || str(row.end_date) === '-') ? 'Active' : 'Inactive',
  }));

  sheets['Permanent Yogi'] = mapYogiRows(allRes[2 + LEDGER_TABLES.length + 1].results || []);
  sheets['Camp Yogi'] = mapYogiRows(allRes[2 + LEDGER_TABLES.length + 2].results || []);

  return c.J({
    success: true,
    fy: isAll ? 'ALL' : rawFy,
    exportedAt: new Date().toISOString(),
    exportedBy: user.u,
    availableYears,
    summary,
    sheets,
  });
}

// -------------------------------------------------------------------
// 3. DAILY CHANGES DETECTOR (/api/system/daily-changes)
//    Reads only 13 rows (book_versions) on quiet days!
// -------------------------------------------------------------------
export async function handleSystemDailyChanges(c) {
  const { env, url } = c;
  const mode = str(url.searchParams.get('mode')).toLowerCase();
  let targetDate = toEngDigits(str(url.searchParams.get('date')));
  if (!targetDate) {
    targetDate = (mode === 'yesterday') ? yesterdayMM() : todayMM();
  }
  if (!isValidDateStr(targetDate)) {
    throw new HttpError(400, 'Invalid date parameter (YYYY-MM-DD)');
  }

  const { startUtc, endUtc } = mmDateToUtcRange(targetDate);
  const versionsMap = await getAllVersionsMap(env);
  const fingerprint = buildVersionFingerprint(versionsMap);

  // Fast 13-row pre-filter: only scan tables updated on or after startUtc
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

  // Also check audit_logs for deletions/actions on targetDate
  let auditActions = [];
  try {
    const auditRes = await env.DB.prepare(
      `SELECT actor, role, action, target_table, target_uid, summary, created_at
       FROM "audit_logs"
       WHERE created_at >= ? AND created_at <= ?
         AND action NOT IN ('REBUILD_SUMMARIES', 'CHANGE_PASSWORD')
       ORDER BY id DESC LIMIT 100`
    ).bind(startUtc, endUtc).all();
    auditActions = auditRes.results || [];
  } catch (_) { /* ignore if created_at column not present */ }

  const hasChanges = totalChanged > 0 || auditActions.length > 0;

  return c.J({
    success: true,
    date: targetDate,
    utcRange: { startUtc, endUtc },
    hasChanges,
    totalChanged,
    auditCount: auditActions.length,
    fingerprint,
    byTable,
    auditActions,
  });
}

// -------------------------------------------------------------------
// 4. FULL SQL DUMP (/api/system/sql-dump) — Admin or GAS Secret Only
// -------------------------------------------------------------------
export async function handleSystemSqlDump(c) {
  const { env, url, user } = c;
  if (!isAdmin(user)) {
    throw new HttpError(403, 'Admin တစ်ဦးတည်းသာ SQL Dump ထုတ်ယူခွင့် ရှိပါသည်။');
  }

  const versionsMap = await getAllVersionsMap(env);
  const fingerprint = buildVersionFingerprint(versionsMap);

  // Ultra-cheap 13-row check mode so GAS skips backup if nothing changed
  if (url.searchParams.get('check_only') === '1') {
    const totalRows = Object.values(versionsMap).reduce((s, v) => s + Number(v.row_count || 0), 0);
    return c.J({ success: true, checkOnly: true, fingerprint, totalRows, date: todayMM() });
  }

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
    `-- Exported By: ${user.u}`,
    `-- Fingerprint: ${fingerprint}`,
    `-- ===================================================================`,
    `PRAGMA foreign_keys = OFF;`,
    `BEGIN TRANSACTION;`,
    ``,
  ];

  // 1. Schema DDL (excluding sensitive auth tables from data dump, keep full schema safe)
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

  // 2. Data Inserts for all 13 ERP Tables
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

  lines.push(`COMMIT;`);
  lines.push(`PRAGMA foreign_keys = ON;`);

  const sql = lines.join('\n');
  const filename = `Sasana_ERP_D1_Backup_${todayMM()}.sql`;

  if (url.searchParams.get('format') === 'raw') {
    return new Response(sql, {
      status: 200,
      headers: {
        'Content-Type': 'application/sql; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  }

  return c.J({
    success: true,
    generatedAt: new Date().toISOString(),
    date: todayMM(),
    filename,
    fingerprint,
    totalRows,
    sql,
  });
}

// -------------------------------------------------------------------
// 5. GOOGLE APPS SCRIPT WEBHOOK TRIGGERS (Manual Mail & Drive Backup)
// -------------------------------------------------------------------
async function callGasWebhook(env, payload) {
  const gasUrl = str(env.GAS_WEBHOOK_URL);
  const gasSecret = str(env.GAS_SECRET);
  if (!gasUrl || !gasSecret) {
    throw new HttpError(503, 'Google Apps Script (GAS_WEBHOOK_URL / GAS_SECRET) မချိတ်ဆက်ရသေးပါ။ Cloudflare Worker Secrets ထဲတွင် ထည့်သွင်းပေးပါ။');
  }

  const res = await fetch(gasUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    redirect: 'follow',
    body: JSON.stringify({ ...payload, secret: gasSecret }),
  });

  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (_) { }

  if (!res.ok || !json) {
    throw new HttpError(502, `GAS Webhook Error (HTTP ${res.status}): ${text.slice(0, 180)}`);
  }
  if (!json.success) {
    throw new HttpError(502, json.error || 'GAS operation failed');
  }
  return json;
}

export async function handleSystemTriggerMail(c) {
  const { env, user } = c;
  let body = {};
  try { body = await readJson(c.request); } catch (_) { body = {}; }

  const fy = toEngDigits(str(body.fy || todayMM().slice(0, 4))).toUpperCase();
  const date = toEngDigits(str(body.date || todayMM()));
  const force = body.force !== false; // Manual click defaults to force send

  const gasRes = await callGasWebhook(env, {
    action: 'send_daily_mail',
    fy,
    date,
    force,
    triggeredBy: `${user.u} (${user.r})`,
  });

  await env.DB.batch([
    auditStmt(env, user, 'MANUAL_MAIL', 'SYSTEM', date, `fy=${fy}, sent=${gasRes.sent !== false}`),
  ]);

  return c.J({ success: true, ...gasRes });
}

export async function handleSystemTriggerDriveBackup(c) {
  const { env, user } = c;
  let body = {};
  try { body = await readJson(c.request); } catch (_) { body = {}; }

  const force = body.force === true; // Respects "only backup if new data" unless force=true

  const gasRes = await callGasWebhook(env, {
    action: 'drive_sql_backup',
    mode: 'manual',
    force,
    triggeredBy: `${user.u} (${user.r})`,
  });

  await env.DB.batch([
    auditStmt(env, user, 'DRIVE_BACKUP', 'SYSTEM', todayMM(), gasRes.skipped ? 'Skipped (no new data)' : (gasRes.fileName || 'Saved')),
  ]);

  return c.J({ success: true, ...gasRes });
}

// -------------------------------------------------------------------
// 6. EXISTING ADMIN ENDPOINTS (Moved here cleanly from worker.js)
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

export async function handleAdminAuditLogs(c) {
  if (!isAdmin(c.user)) throw new HttpError(403, 'Admin တစ်ဦးတည်းသာ ကြည့်ရှုခွင့် ရှိပါသည်။');
  const limit = Math.min(200, Math.max(10, parseInt(c.url.searchParams.get('limit') || '50', 10) || 50));
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM "audit_logs" ORDER BY id DESC LIMIT ?`
  ).bind(limit).all();
  return c.J({ success: true, data: results || [] });
}
