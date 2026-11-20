// ===================================================================
// SĀSANA ERP - CLOUDFLARE WORKER API (worker.js) — v7.2 (Zero-GAS Native) 
// Core Utilities -> ./core.js | System/Metrics/Excel/ZIP/Resend -> ./system.js  
// ===================================================================

import {
  TOKEN_TTL_MS, LOGIN_MAX_FAILS, LOGIN_LOCK_MS, TRF_RE,
  TABLE_MAP, LEDGER_TABLES, BANK_TABLES, ALL_SHEETS, BANK_SHEETS, USERS, YOGI_CATS,
  HttpError, str, toEngDigits, roundMoney, num, todayMM, isValidDateStr, assertValidUid,
  formatMonthYear, ledgerTable, resolveYogiTable, readJson, parseKey, keyWhere, changes,
  hashPassword, verifyPassword, signToken, verifyToken,
  isAdmin, isViewer, canDeleteRole, corsHeaders,
  normLedger, normInventory, normYogi, NORM, maskNrc, maskPhone,
  upsertStmt, updateStmt, ledgerSummaryDeltaStmt, cleanupEmptySummaryStmt,
  bumpVersionStmt, rebuildTableSummaryStmts,
  auditStmt, getTableVersion, getAllVersionsMap, runBatches,
} from './core.js';

import {
  runScheduledAutomation,
  handleSystemD1Metrics,
  handleSystemExportExcel,
  handleSystemDailyChanges,
  handleSystemSqlDump,
  handleSystemTriggerMail,
  handleSystemTriggerDriveBackup,
  handleAdminRebuildSummaries,
  handleAdminBackup,
  handleAdminAuditLogs,
} from './system.js';

// -------------------------------------------------------------------
// Transfer & Book Helpers
// -------------------------------------------------------------------
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
      id: row.id, no: idx + 1, uniqueId: uid, unique_id: uid,
      sheet_name: rawSheet, date: row.date, entry_date: row.date,
      category: row.title || (inc > 0 ? 'ဝင်ငွေ' : 'ထွက်ငွေ'), title: row.title || '',
      subcategory: row.sub_title || '-', sub_title: row.sub_title || '',
      voucher_no: row.voucher_no || '', description: row.description || '', receiver: row.receiver || '',
      income: inc, expense: exp, balance: running,
      month_year: row.month_year || formatMonthYear(row.date), book_name: row.book_name || table,
    };
  });
  return {
    success: true, book: table, version: currentVersion, data,
    kpis: { totalIncome, totalExpense, balance: running, count: rows.length },
  };
}

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

  if (BANK_TABLES.has(src)) {
    const targetBank = resolveExplicitBank(target);
    const isWithdrawalToSchool = explicitType === 'BANK_WITHDRAWAL' ||
      b.title === 'ဘဏ်ထုတ်ငွေ' || target === '1General Book' || target === '4GB' ||
      target === 'ကျောင်းရန်ပုံငွေ စာအုပ်' || (!targetBank && USERS.includes(target));

    if (isWithdrawalToSchool) {
      const destUser = USERS.includes(target) ? target : (USERS.includes(b.receiver) ? b.receiver : 'User 1');
      const desc = str(b.description) || 'ကျောင်းအသုံးစရိတ် ထုတ်ပေးခြင်း (ဘဏ်မှရရှိငွေ)';
      return {
        gid,
        rows: [
          mk(src, 'OUT', { title: 'ဘဏ်ထုတ်ငွေ', sub_title: 'ကျောင်းရန်ပုံငွေ စာအုပ်', description: desc, expense: amt, receiver: destUser }),
          mk('1General Book', 'IN', { title: 'ဘဏ်ထုတ်ငွေ', sub_title: `${src} မှ ထုတ်ယူရရှိ`, description: desc, income: amt, receiver: destUser }),
        ],
      };
    }

    if (!targetBank) throw new HttpError(400, `Unknown transfer target for bank: "${target}"`);
    if (targetBank === src) throw new HttpError(400, 'မူရင်းဘဏ်စာရင်းနှင့် လွှဲပြောင်းမည့် ဘဏ်စာရင်း မတူညီရပါ။');

    return {
      gid,
      rows: [
        mk(src, 'OUT', { sub_title: `${targetBank} သို့ လွှဲပြောင်း`, description: str(b.description) || `${targetBank} သို့ ဘဏ်စာရင်းပြောင်း လွှဲပို့ခြင်း`, expense: amt, receiver: 'Bank' }),
        mk(targetBank, 'IN', { title: 'စာရင်းပြောင်း', sub_title: `${src} မှ လွှဲပြောင်းရရှိ`, description: `${src} မှ စာရင်းပြောင်း ရရှိခြင်း`, income: amt, receiver: 'Bank' }),
      ],
    };
  }

  const targetUser = USERS.find(u => target === u || target.startsWith(`${u} `));
  if (explicitType === 'USER_TO_USER' || (targetUser && !target.includes('Bank') && !target.includes('ဘဏ်'))) {
    if (!targetUser) throw new HttpError(400, `Invalid target user: "${target}"`);
    if (!USERS.includes(sender)) throw new HttpError(400, `Invalid sender user: "${sender}"`);
    if (targetUser === sender) throw new HttpError(400, 'လွှဲပို့သူနှင့် လက်ခံသူ User မတူညီရပါ။');
    return {
      gid,
      rows: [
        mk(src, 'OUT', { sub_title: `${targetUser} သို့ လွှဲပြောင်း`, description: str(b.description) || `${targetUser} ထံ စာရင်းပြောင်း ပေးပို့ခြင်း`, expense: amt, receiver: sender }),
        mk(src, 'IN', { sub_title: `${sender} ထံမှ လွှဲပြောင်းရရှိ`, description: str(b.description) ? `${str(b.description)} (ရရှိ)` : `${sender} ထံမှ စာရင်းပြောင်း ရရှိခြင်း`, income: amt, receiver: targetUser }),
      ],
    };
  }

  const targetBank = resolveExplicitBank(target);
  if (!targetBank) throw new HttpError(400, `Unknown transfer target: "${target}"`);
  return {
    gid,
    rows: [
      mk(src, 'OUT', { sub_title: 'ဘဏ်အပ်နှံခြင်း', description: str(b.description) || `${targetBank} သို့ ဘဏ်အပ်နှံခြင်း`, expense: amt, receiver: sender }),
      mk(targetBank, 'IN', { title: 'ဘဏ်အပ်ငွေ', sub_title: 'ဘဏ်အပ်နှံခြင်း', description: `${src} [${sender}] မှ ဘဏ်အပ်ငွေ ရရှိခြင်း`, income: amt, receiver: 'Bank' }),
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
    oldRows.forEach(oldRow => { stmts.push(ledgerSummaryDeltaStmt(env, t, oldRow, -1)); });
    if (isEditOrReplace || !rows.some(([rt]) => rt === t)) {
      stmts.push(env.DB.prepare(`DELETE FROM "${t}" WHERE unique_id IN (?, ?)`).bind(...ids));
      if (!rows.some(([rt]) => rt === t)) stmts.push(bumpVersionStmt(env, t, -oldRows.length));
    }
  });

  const deltaPerTable = {};
  existingChecks.forEach((res, idx) => { deltaPerTable[LEDGER_TABLES[idx]] = -(res.results?.length || 0); });

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

// -------------------------------------------------------------------
// Transfer, Ledger Entries & Bulk Import Handlers
// -------------------------------------------------------------------
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
        ...body, transfer_type: 'BANK_WITHDRAWAL', target: '1General Book',
        amount: body.amount || body.expense, receiver: body.receiver || 'User 1',
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
    await env.DB.batch([
      updateStmt(env, table, newRow, key),
      ledgerSummaryDeltaStmt(env, table, existing, -1),
      ledgerSummaryDeltaStmt(env, table, newRow, +1),
      cleanupEmptySummaryStmt(env, table),
      bumpVersionStmt(env, table, 0),
      auditStmt(env, user, 'UPDATE_LEDGER', table, existing.unique_id || val, `${newRow.date} | ${newRow.title} | ${newRow.income || newRow.expense}`),
    ]);
    return c.J({ success: true });
  }

  if (method === 'DELETE') {
    if (!canDeleteRole(user)) throw new HttpError(403, 'ဖျက်သိမ်းခွင့် မရှိပါ။');
    const trf = key.uid && TRF_RE.exec(key.uid);
    if (trf) return c.J({ success: true, deleted: await deleteTransferGroup(env, trf[1], user) });

    const [where, val] = keyWhere(key);
    const existing = await env.DB.prepare(`SELECT * FROM "${table}" WHERE ${where} LIMIT 1`).bind(val).first();
    if (!existing) return c.J({ success: true, deleted: 0 });

    await env.DB.batch([
      env.DB.prepare(`DELETE FROM "${table}" WHERE ${where}`).bind(val),
      ledgerSummaryDeltaStmt(env, table, existing, -1),
      cleanupEmptySummaryStmt(env, table),
      bumpVersionStmt(env, table, -1),
      auditStmt(env, user, 'DELETE_LEDGER', table, existing.unique_id || val, `${existing.date} | ${existing.title} | ${existing.income || existing.expense}`),
    ]);
    return c.J({ success: true, deleted: 1 });
  }
  throw new HttpError(405, 'Method not allowed');
}

async function handleBulkImport(c) {
  const { env, user } = c;
  if (!isAdmin(user)) throw new HttpError(403, 'Admin တစ်ဦးတည်းသာ Bulk Import ပြုလုပ်ခွင့် ရှိပါသည်။');

  const b = await readJson(c.request);
  const rawTable = str(b.table);
  const clearExisting = b.clearExisting === true;
  const rawRows = Array.isArray(b.rows) ? b.rows : [];

  let table, kind;
  if (TABLE_MAP[rawTable]) { table = TABLE_MAP[rawTable]; kind = 'ledger'; }
  else if (rawTable === 'Inventory') { table = 'Inventory'; kind = 'inventory'; }
  else if (['Permanent Yogi', 'Camp Yogi', '12Yogi', '13Yogi'].includes(rawTable)) { table = resolveYogiTable(rawTable); kind = 'yogi'; }
  else throw new HttpError(400, `Unknown or invalid table: "${rawTable}"`);

  const normalizedRows = rawRows.map((item, idx) => {
    const rowData = { ...item };
    if (rowData.no === undefined) rowData.no = idx + 1;
    if (!rowData.description && rowData.title) rowData.description = rowData.title;
    return NORM[kind](rowData, table);
  });

  if (clearExisting) await env.DB.prepare(`DELETE FROM "${table}"`).run();

  const CHUNK_SIZE = 70;
  for (let i = 0; i < normalizedRows.length; i += CHUNK_SIZE) {
    await env.DB.batch(normalizedRows.slice(i, i + CHUNK_SIZE).map(r => upsertStmt(env, table, r)));
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
// Inventory, Yogi & Report Formatters
// -------------------------------------------------------------------
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
      yogi_phone: phoneVal, phone: phoneVal, home_phone: homeVal,
      address: maskPii ? '' : (row.address || ''), status: isActive ? 'Active' : 'Inactive', book_name: table,
    };
  });
  return {
    success: true, sheet: rawSheet, book: table, version, data,
    kpis: { totalMonks: monks, totalNuns: nuns, totalMales: males, totalFemales: females, totalActiveYogis: active, totalInactiveYogis: inactive, totalCount: rows.length },
  };
}

// -------------------------------------------------------------------
// Auth, Versions, Bootstrap & Offline Sync Handlers
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

  if (row && Number(row.active ?? 1) !== 1) throw new HttpError(403, 'ဤအကောင့်ကို ယာယီပိတ်ထားပါသည်။');

  const allowLegacy = c.env.ALLOW_LEGACY_PASSWORD_UPGRADE !== '0';
  const check = row ? await verifyPassword(password, String(row.password || ''), allowLegacy) : { ok: false };

  if (!check.ok) {
    await c.env.DB.batch(rateKeys.map((k, idx) => {
      const curFails = Number(lockRows[idx]?.results?.[0]?.fail_count || 0) + 1;
      const lockedUntil = curFails >= LOGIN_MAX_FAILS ? now + LOGIN_LOCK_MS : 0;
      return c.env.DB.prepare(
        `INSERT INTO "login_attempts" (key, fail_count, locked_until, updated_at)
         VALUES (?, ?, ?, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET fail_count = excluded.fail_count, locked_until = excluded.locked_until, updated_at = datetime('now')`
      ).bind(k, curFails >= LOGIN_MAX_FAILS ? 0 : curFails, lockedUntil);
    }));
    throw new HttpError(401, 'အသုံးပြုသူအမည် သို့မဟုတ် လျှို့ဝှက်နံပါတ် မှားယွင်းနေပါသည်။');
  }

  const postLoginStmts = [c.env.DB.prepare(`DELETE FROM "login_attempts" WHERE key IN (?, ?)`).bind(...rateKeys)];
  if (check.upgrade) {
    postLoginStmts.push(c.env.DB.prepare(`UPDATE "users" SET password = ? WHERE id = ?`).bind(await hashPassword(password), row.id));
  }
  await c.env.DB.batch(postLoginStmts);

  const role = row.role || 'Staff';
  const tv = Number(row.token_version ?? 1);
  const token = await signToken(c.env, { uid: row.id, u: row.username, r: role, tv, exp: now + TOKEN_TTL_MS });
  return c.J({ success: true, token, user: { id: row.id, username: row.username, role, name: row.name || row.username }, expiresInMs: TOKEN_TTL_MS });
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
    c.env.DB.prepare(`UPDATE "users" SET password = ?, token_version = ? WHERE id = ?`).bind(await hashPassword(newPw), nextTv, row.id),
    auditStmt(c.env, c.user, 'CHANGE_PASSWORD', 'users', row.id, `Password changed & old tokens revoked for ${row.username}`),
  ]);

  const token = await signToken(c.env, { uid: row.id, u: row.username, r: row.role, tv: nextTv, exp: Date.now() + TOKEN_TTL_MS });
  return c.J({ success: true, token, expiresInMs: TOKEN_TTL_MS });
}

async function handleVersions(c) {
  return c.J({ success: true, versions: await getAllVersionsMap(c.env), timestamp: Date.now() });
}

async function handleBootstrap(c) {
  const { env, url, user } = c;
  let clientVersions = {};
  const vParam = url.searchParams.get('versions');
  if (vParam) { try { clientVersions = JSON.parse(vParam) || {}; } catch (_) { clientVersions = {}; } }

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
    success: true, timestamp: Date.now(), versions: serverVersions, unchangedBooks, books: booksPayload,
    ...(invF ? { inventory: invF.data, inventoryKpis: invF.kpis } : {}),
    yogi: { ...(permF ? { '12Yogi': permF.data } : {}), ...(campF ? { '13Yogi': campF.data } : {}) },
    yogiKpis: { ...(permF ? { '12Yogi': permF.kpis } : {}), ...(campF ? { '13Yogi': campF.kpis } : {}) },
  });
}

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
      if (action === 'DELETE' && !canDeleteRole(user)) throw new HttpError(403, 'ဖျက်သိမ်းခွင့် မရှိပါ။');

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

          const isTransferOrWithdrawal = TRF_RE.test(str(dataObj.unique_id)) || dataObj.title === 'စာရင်းပြောင်း' ||
            (BANK_TABLES.has(table) && (dataObj.title === 'ဘဏ်ထုတ်ငွေ' || str(dataObj.sub_title).includes('ကျောင်းရန်ပုံငွေ')) && str(dataObj.type) !== 'ဝင်ငွေ');

          if (isTransferOrWithdrawal) {
            const gid = await applyTransferAtomic(env, user, dataObj, table, action === 'UPDATE');
            results.push({ qid, unique_id: `${gid}_OUT`, status: 'synced' });
          } else {
            const targetUid = str(dataObj.unique_id);
            const existing = targetUid ? await env.DB.prepare(`SELECT * FROM "${table}" WHERE unique_id = ? LIMIT 1`).bind(targetUid).first() : null;
            if (action === 'UPDATE' && !existing) throw new HttpError(404, 'Record no longer exists on server');
            const row = normLedger(dataObj, table, existing);
            const stmts = [];
            if (existing) stmts.push(ledgerSummaryDeltaStmt(env, table, existing, -1));
            stmts.push(upsertStmt(env, table, row), ledgerSummaryDeltaStmt(env, table, row, +1), cleanupEmptySummaryStmt(env, table), bumpVersionStmt(env, table, existing ? 0 : 1), auditStmt(env, user, `SYNC_${action}_LEDGER`, table, row.unique_id, `${row.date} | ${row.title} | ${row.income || row.expense}`));
            await env.DB.batch(stmts);
            results.push({ qid, unique_id: row.unique_id, status: 'synced' });
          }
        } else if (action === 'DELETE') {
          if (!uid) throw new HttpError(400, 'unique_id required');
          const trf = TRF_RE.exec(uid);
          if (trf) await deleteTransferGroup(env, trf[1], user);
          else {
            const existing = await env.DB.prepare(`SELECT * FROM "${table}" WHERE unique_id = ? LIMIT 1`).bind(uid).first();
            if (existing) {
              await env.DB.batch([
                env.DB.prepare(`DELETE FROM "${table}" WHERE unique_id = ?`).bind(uid),
                ledgerSummaryDeltaStmt(env, table, existing, -1), cleanupEmptySummaryStmt(env, table),
                bumpVersionStmt(env, table, -1), auditStmt(env, user, 'SYNC_DELETE_LEDGER', table, uid, `${existing.date} | ${existing.title}`),
              ]);
            }
          }
          results.push({ qid, unique_id: uid, status: 'deleted' });
        } else throw new HttpError(400, `Unknown action: ${action}`);
      } else if (kind === 'inventory') {
        if (action === 'CREATE' || action === 'UPDATE') {
          const targetUid = str(uid || item.data?.unique_id);
          if (targetUid) assertValidUid(targetUid);
          const existing = targetUid ? await env.DB.prepare(`SELECT * FROM "Inventory" WHERE unique_id = ? LIMIT 1`).bind(targetUid).first() : null;
          if (action === 'UPDATE' && !existing) throw new HttpError(404, 'Item no longer exists on server');
          const row = normInventory({ ...(item.data || {}), unique_id: targetUid }, existing);
          await env.DB.batch([upsertStmt(env, 'Inventory', row), bumpVersionStmt(env, 'Inventory', existing ? 0 : 1), auditStmt(env, user, `SYNC_${action}_INV`, 'Inventory', row.unique_id, row.description)]);
          results.push({ qid, unique_id: row.unique_id, status: 'synced' });
        } else if (action === 'DELETE') {
          if (!uid) throw new HttpError(400, 'unique_id required');
          const r = await env.DB.prepare(`DELETE FROM "Inventory" WHERE unique_id = ?`).bind(uid).run();
          if (changes(r) > 0) await env.DB.batch([bumpVersionStmt(env, 'Inventory', -changes(r)), auditStmt(env, user, 'SYNC_DELETE_INV', 'Inventory', uid, 'Deleted via offline sync')]);
          results.push({ qid, unique_id: uid, status: 'deleted' });
        } else throw new HttpError(400, `Unknown action: ${action}`);
      } else if (kind === 'yogi') {
        if (action === 'CREATE' || action === 'UPDATE') {
          const targetUid = str(uid || item.data?.unique_id);
          if (targetUid) assertValidUid(targetUid);
          const existing = targetUid ? await env.DB.prepare(`SELECT * FROM "${table}" WHERE unique_id = ? LIMIT 1`).bind(targetUid).first() : null;
          if (action === 'UPDATE' && !existing) throw new HttpError(404, 'Yogi no longer exists on server');
          const row = normYogi({ ...(item.data || {}), unique_id: targetUid }, table, existing);
          await env.DB.batch([upsertStmt(env, table, row), bumpVersionStmt(env, table, existing ? 0 : 1), auditStmt(env, user, `SYNC_${action}_YOGI`, table, row.unique_id, row.name)]);
          results.push({ qid, unique_id: row.unique_id, status: 'synced' });
        } else if (action === 'DELETE') {
          if (!uid) throw new HttpError(400, 'unique_id required');
          const delRes = await env.DB.batch([
            env.DB.prepare(`DELETE FROM "Permanent Yogi" WHERE unique_id = ?`).bind(uid),
            env.DB.prepare(`DELETE FROM "Camp Yogi" WHERE unique_id = ?`).bind(uid),
          ]);
          const vers = [];
          if (changes(delRes[0]) > 0) vers.push(bumpVersionStmt(env, 'Permanent Yogi', -changes(delRes[0])), auditStmt(env, user, 'SYNC_DELETE_YOGI', 'Permanent Yogi', uid, 'Deleted via offline sync'));
          if (changes(delRes[1]) > 0) vers.push(bumpVersionStmt(env, 'Camp Yogi', -changes(delRes[1])), auditStmt(env, user, 'SYNC_DELETE_YOGI', 'Camp Yogi', uid, 'Deleted via offline sync'));
          if (vers.length) await env.DB.batch(vers);
          results.push({ qid, unique_id: uid, status: 'deleted' });
        } else throw new HttpError(400, `Unknown action: ${action}`);
      }
    } catch (e) {
      results.push({ qid, unique_id: uid, status: 'error', error: e.message });
    }
  }
  const failed = results.filter(r => r.status === 'error').length;
  return c.J({ success: true, count: results.length, failed, results });
}

// -------------------------------------------------------------------
// Home Summary, Inventory, Yogi & Annual Report Handlers
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
    ['2Meal Book', 'ဆွမ်းပဒေသာပင် စာအုပ်'], ['5Electronic Book', 'လျှပ်စစ်ပဒေသာပင် စာအုပ်'],
    ['6Medical Book', 'ဆေးပဒေသာပင် စာအုပ်'], ['7Other Book', 'အထွေထွေရန်ပုံငွေစာအုပ်'],
  ];
  const padethaTotals = {};
  padethaDefs.forEach(([t]) => { padethaTotals[t] = { income: 0, expense: 0 }; });

  let totalFund = 0, totalBank = 0, totalCash = 0, totalCount = 0;

  try {
    const [sumRes, pRes, kRes] = await env.DB.batch([
      env.DB.prepare(
        `SELECT book_name, receiver, title, sub_title,
                COALESCE(SUM(total_income), 0) as inc, COALESCE(SUM(total_expense), 0) as exp, COALESCE(SUM(row_count), 0) as cnt
         FROM "ledger_summary" WHERE row_count > 0 GROUP BY book_name, receiver, title, sub_title`
      ),
      env.DB.prepare(`SELECT yogi_type, name, gender FROM "Permanent Yogi" WHERE (end_date IS NULL OR end_date = '' OR end_date = '-')`),
      env.DB.prepare(`SELECT yogi_type, name, gender FROM "Camp Yogi" WHERE (end_date IS NULL OR end_date = '' OR end_date = '-')`),
    ]);

    (sumRes.results || []).forEach(row => {
      const tbl = str(row.book_name), sheet = tableToSheet[tbl];
      if (!sheet) return;
      const receiver = str(row.receiver), t = str(row.title), st = str(row.sub_title);
      const inc = parseFloat(row.inc) || 0, exp = parseFloat(row.exp) || 0;
      const net = roundMoney(inc - exp), cnt = parseInt(row.cnt, 10) || 0;

      totalCount += cnt;
      if (BANK_SHEETS.includes(sheet)) {
        fundSummary[sheet].bankBalance = roundMoney(fundSummary[sheet].bankBalance + net);
        totalBank = roundMoney(totalBank + net);
      } else {
        if (receiver.includes('User 2') || receiver.includes('User2')) fundSummary[sheet].user2Balance = roundMoney(fundSummary[sheet].user2Balance + net);
        else if (receiver.includes('User 3') || receiver.includes('User3')) fundSummary[sheet].user3Balance = roundMoney(fundSummary[sheet].user3Balance + net);
        else fundSummary[sheet].user1Balance = roundMoney(fundSummary[sheet].user1Balance + net);
        totalCash = roundMoney(totalCash + net);
      }
      fundSummary[sheet].totalBalance = roundMoney(fundSummary[sheet].totalBalance + net);
      totalFund = roundMoney(totalFund + net);

      if (padethaTotals[tbl]) {
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
      const bucket = target[classifyYogi(row)] || target['လူပုဂ္ဂိုလ်'];
      if (str(row.gender) === 'မ') bucket.female++; else bucket.male++;
      bucket.total++;
    });
    addYogi(pRes.results, resident);
    addYogi(kRes.results, retreat);

    return c.J({ success: true, kpis: { totalFund, totalBank, totalCash, totalCount }, fundSummary, padethaSummary, yogiSummary: { resident, retreat } });
  } catch (e) {
    console.error('[Dashboard Summary Error]', e);
    throw new HttpError(500, 'Dashboard summary error');
  }
}

async function handleInventory(c) {
  const { url, method, env, user } = c;
  if (method === 'GET') {
    const knownV = url.searchParams.get('known_version');
    const sv = await getTableVersion(env, 'Inventory');
    if (knownV !== null && Number(knownV) === sv) return c.J({ success: true, book: 'Inventory', version: sv, unchanged: true });
    const { results } = await env.DB.prepare(`SELECT * FROM "Inventory" ORDER BY date ASC, id ASC`).all();
    return c.J(formatInventory(results || [], sv));
  }

  const body = (method === 'POST' || method === 'PUT') ? await readJson(c.request) : null;
  if (method === 'POST') {
    const row = normInventory(body);
    const existing = await env.DB.prepare(`SELECT id FROM "Inventory" WHERE unique_id = ? LIMIT 1`).bind(row.unique_id).first();
    await env.DB.batch([upsertStmt(env, 'Inventory', row), bumpVersionStmt(env, 'Inventory', existing ? 0 : 1), auditStmt(env, user, existing ? 'UPSERT_INV' : 'CREATE_INV', 'Inventory', row.unique_id, `${row.description} (${row.qty})`)]);
    return c.J({ success: true, unique_id: row.unique_id });
  }

  const key = parseKey(body, url.searchParams);
  if (!key) throw new HttpError(400, 'unique_id or id required');

  if (method === 'PUT') {
    const [where, val] = keyWhere(key);
    const existing = await env.DB.prepare(`SELECT * FROM "Inventory" WHERE ${where} LIMIT 1`).bind(val).first();
    if (!existing) throw new HttpError(404, 'Item not found');
    const row = normInventory({ ...body, unique_id: existing.unique_id || key.uid }, existing);
    await env.DB.batch([updateStmt(env, 'Inventory', row, key), bumpVersionStmt(env, 'Inventory', 0), auditStmt(env, user, 'UPDATE_INV', 'Inventory', existing.unique_id || val, `${row.description} (${row.qty})`)]);
    return c.J({ success: true });
  }

  if (method === 'DELETE') {
    if (!canDeleteRole(user)) throw new HttpError(403, 'ဖျက်သိမ်းခွင့် မရှိပါ။');
    const [where, val] = keyWhere(key);
    const existing = await env.DB.prepare(`SELECT id, unique_id, description FROM "Inventory" WHERE ${where} LIMIT 1`).bind(val).first();
    if (!existing) return c.J({ success: true, deleted: 0 });
    await env.DB.batch([env.DB.prepare(`DELETE FROM "Inventory" WHERE ${where}`).bind(val), bumpVersionStmt(env, 'Inventory', -1), auditStmt(env, user, 'DELETE_INV', 'Inventory', existing.unique_id || val, existing.description)]);
    return c.J({ success: true, deleted: 1 });
  }
  throw new HttpError(405, 'Method not allowed');
}

async function findYogiTableAndRow(env, key, explicitSheet) {
  const [where, val] = keyWhere(key);
  if (explicitSheet) {
    const tbl = resolveYogiTable(explicitSheet);
    const row = await env.DB.prepare(`SELECT * FROM "${tbl}" WHERE ${where} LIMIT 1`).bind(val).first();
    return row ? { table: tbl, row } : null;
  }
  if (!key.uid) throw new HttpError(400, 'sheet_type or unique_id required for numeric ID lookup');
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
    if (knownV !== null && Number(knownV) === sv) return c.J({ success: true, sheet: raw, book: table, version: sv, unchanged: true });
    const { results } = await env.DB.prepare(`SELECT * FROM "${table}" ORDER BY start_date ASC, id ASC`).all();
    return c.J(formatYogi(results || [], raw, table, sv, isViewer(user)));
  }

  const body = (method === 'DELETE') ? null : await readJson(c.request);
  const explicit = str(body?.sheet_type || body?.sheet || sheetParam);

  if (method === 'POST') {
    const table = resolveYogiTable(explicit || '12Yogi');
    const row = normYogi(body, table);
    const existing = await env.DB.prepare(`SELECT id FROM "${table}" WHERE unique_id = ? LIMIT 1`).bind(row.unique_id).first();
    await env.DB.batch([upsertStmt(env, table, row), bumpVersionStmt(env, table, existing ? 0 : 1), auditStmt(env, user, existing ? 'UPSERT_YOGI' : 'CREATE_YOGI', table, row.unique_id, row.name)]);
    return c.J({ success: true, unique_id: row.unique_id });
  }

  const key = parseKey(body, url.searchParams);
  if (!key) throw new HttpError(400, 'unique_id or id required');
  if (method === 'DELETE' && !canDeleteRole(user)) throw new HttpError(403, 'ဖျက်သိမ်းခွင့် မရှိပါ။');

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
    await env.DB.batch([updateStmt(env, table, row, key), bumpVersionStmt(env, table, 0), auditStmt(env, user, 'UPDATE_YOGI', table, existingRow.unique_id || val, row.name)]);
    return c.J({ success: true });
  }

  if (method === 'DELETE') {
    await env.DB.batch([env.DB.prepare(`DELETE FROM "${table}" WHERE ${where}`).bind(val), bumpVersionStmt(env, table, -1), auditStmt(env, user, 'DELETE_YOGI', table, existingRow.unique_id || val, existingRow.name)]);
    return c.J({ success: true, deleted: 1 });
  }
  throw new HttpError(405, 'Method not allowed');
}

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
    `SELECT ym, title, sub_title, COALESCE(SUM(total_income), 0) as income, COALESCE(SUM(total_expense), 0) as expense
     FROM "ledger_summary" WHERE book_name = ? AND row_count > 0 AND ym <= ?
     GROUP BY ym, title, sub_title ORDER BY ym ASC`
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
      if (t === 'စာရင်းဖွင့်' || st === 'စာရင်းဖွင့်လက်ကျန်') manualOpeningsCurrentYear[rMonth] = roundMoney(manualOpeningsCurrentYear[rMonth] + inc);
      else if (inc > 0) add(incRows, dynInc, 'ဝင်ငွေ', 'အခြားဝင်ငွေ', t, st, txt, rMonth, inc);
      if (exp > 0) add(expRows, dynExp, 'ထွက်ငွေ', 'အခြားထွက်ငွေ', t, st, txt, rMonth, exp);
    }
  });

  const openingBalances = Array(12).fill(0);
  openingBalances[0] = runningBalance;
  for (let i = 1; i < 12; i++) openingBalances[i] = roundMoney(openingBalances[i - 1] + monthlyNetCurrentYear[i - 1]);

  const openingRow = incRows.find(r => r.category === 'စာရင်းဖွင့်' && r.subcategory === 'စာရင်းဖွင့်လက်ကျန်');
  if (openingRow) for (let i = 0; i < 12; i++) openingRow.months[i] = roundMoney(openingBalances[i] + manualOpeningsCurrentYear[i]);

  Object.values(dynInc).forEach(x => { incRows.push(x); });
  Object.values(dynExp).forEach(x => { expRows.push(x); });

  const sortReportRows = (rows, predefinedList) => {
    const catOrder = [...new Set(predefinedList.map(x => x.category))];
    rows.sort((a, b) => {
      let catA = catOrder.indexOf(a.category), catB = catOrder.indexOf(b.category);
      if (catA === -1) catA = 999; if (catB === -1) catB = 999;
      if (catA !== catB) return catA - catB;
      let subA = predefinedList.findIndex(x => x.category === a.category && x.subcategory === a.subcategory);
      let subB = predefinedList.findIndex(x => x.category === b.category && x.subcategory === b.subcategory);
      if (subA === -1) subA = 999; if (subB === -1) subB = 999;
      return subA !== subB ? subA - subB : a.subcategory.localeCompare(b.subcategory);
    });
    rows.forEach((r, i) => { r.srNo = i + 1; });
  };

  sortReportRows(incRows, PREDEFINED_INCOME);
  sortReportRows(expRows, PREDEFINED_EXPENSE);

  const incomeTotals = Array(12).fill(0), expenseTotals = Array(12).fill(0);
  let grandIncomeTotal = 0, grandExpenseTotal = 0;

  incRows.forEach(r => {
    delete r.keywords;
    r.months.forEach((a, i) => { incomeTotals[i] = roundMoney(incomeTotals[i] + a); });
    r.total = (r.category === 'စာရင်းဖွင့်' && r.subcategory === 'စာရင်းဖွင့်လက်ကျန်')
      ? roundMoney(openingBalances[0] + manualOpeningsCurrentYear.reduce((a, b) => a + b, 0))
      : roundMoney(r.months.reduce((a, b) => a + b, 0));
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

  // System Control Center Endpoints (Pure Cloudflare Worker + Resend API)
  if (path === '/api/system/d1-metrics' && method === 'GET') return handleSystemD1Metrics(c);
  if (path === '/api/system/export-excel' && method === 'GET') return handleSystemExportExcel(c);
  if (path === '/api/system/daily-changes' && method === 'GET') return handleSystemDailyChanges(c);
  if (path === '/api/system/sql-dump' && method === 'GET') return handleSystemSqlDump(c);
  if (path === '/api/system/trigger-mail' && method === 'POST') return handleSystemTriggerMail(c);
  if (path === '/api/system/trigger-drive-backup' && method === 'POST') return handleSystemTriggerDriveBackup(c);

  // Admin Tools
  if (path === '/api/admin/rebuild-summaries' && method === 'POST') return handleAdminRebuildSummaries(c);
  if (path === '/api/admin/backup' && method === 'GET') return handleAdminBackup(c);
  if (path === '/api/admin/audit-logs' && method === 'GET') return handleAdminAuditLogs(c);

  throw new HttpError(404, 'Endpoint not found');
}

// ===================================================================
// 🌟 EXPORT DEFAULT ENTRY POINT (HTTP + 12:00 AM MMT Auto Cron)
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
    ctx.waitUntil(runScheduledAutomation(env));
  },
};
// === END OF worker.js ===
