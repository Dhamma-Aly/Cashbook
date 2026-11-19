// ===================================================================
// Sasana_Auto_Mail_Backup.gs — Sāsana ERP Automation Engine (v1.0)
// 1. Daily 12:00 AM (MMT) Auto Mail -> dhammaaly@gmail.com (Only if new entries)
// 2. Weekly (Sunday) + Quarterly (Jan/Apr/Jul/Oct 1) Google Drive SQL .zip Backup
//    (Only if new data exists via 13-row D1 version fingerprint check)
// 3. Web App Webhook (doPost) for Dashboard Manual Mail & Drive Backup Buttons
// ===================================================================

const CONFIG = {
  API_BASE: 'https://cashbook-api.dhammaaly.workers.dev',
  // ⚠️ အောက်ပါ Secret ကို စာလုံး ၃၂ လုံးအထက် ပြောင်းထည့်ပြီး Cloudflare Worker Secret (GAS_SECRET) မှာပါ အတူတူ ထည့်ပေးပါ
  GAS_SECRET: 'CHANGE_ME_TO_A_32_PLUS_CHAR_SECRET_KEY_2026',
  MAIL_TO: 'dhammaaly@gmail.com',
  DRIVE_ROOT_FOLDER: 'Sasana_ERP_Backups',
  TIMEZONE: 'Asia/Yangon',
  WEEKLY_KEEP_COUNT: 8, // Weekly folder မှာ နောက်ဆုံး ၈ ပတ်စာပဲ ထားပြီး အဟောင်းရှင်းမည်
};

// ===================================================================
// 1. ONE-CLICK AUTO TRIGGER SETUP (ပထမဆုံး တစ်ကြိမ်သာ Run ရန်)
// ===================================================================
function setupAutoTriggers() {
  // Remove old triggers of these handlers to avoid duplicates
  const managed = ['runAutoDailyMail', 'runWeeklyDriveBackup', 'runQuarterlyDriveBackup'];
  ScriptApp.getProjectTriggers().forEach(t => {
    if (managed.indexOf(t.getHandlerFunction()) !== -1) {
      ScriptApp.deleteTrigger(t);
    }
  });

  // 1. Daily Mail — နေ့စဉ် ည ၁၂:၀၀ – ၁:၀၀ (Asia/Yangon)
  ScriptApp.newTrigger('runAutoDailyMail')
    .timeBased()
    .everyDays(1)
    .atHour(0)
    .inTimezone(CONFIG.TIMEZONE)
    .create();

  // 2. Weekly Drive Backup — အပတ်စဉ် တနင်္ဂနွေ ည ၁၂:၀၀ – ၁:၀၀ (Asia/Yangon)
  ScriptApp.newTrigger('runWeeklyDriveBackup')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.SUNDAY)
    .atHour(0)
    .inTimezone(CONFIG.TIMEZONE)
    .create();

  // 3. Quarterly Archive Backup — လဆန်း ၁ ရက်နေ့တိုင်း စစ်ပြီး Jan/Apr/Jul/Oct မှသာ သိမ်းမည်
  ScriptApp.newTrigger('runQuarterlyDriveBackup')
    .timeBased()
    .onMonthDay(1)
    .atHour(0)
    .inTimezone(CONFIG.TIMEZONE)
    .create();

  Logger.log('✅ Sāsana ERP Auto Triggers (Daily Mail + Weekly & Quarterly Drive Backup) installed!');
}

// ===================================================================
// 2. SCHEDULED HANDLERS (Auto Cron Jobs)
// ===================================================================
function runAutoDailyMail() {
  // ည ၁၂:၀၀ ကျော်ချိန် run တဲ့အတွက် ပြီးခဲ့တဲ့နေ့ (yesterday MMT) စာရင်းအသစ် ရှိမရှိ စစ်မည်
  const res = sendDailyMailCore({ mode: 'yesterday', force: false, triggeredBy: 'Auto 12:00 AM' });
  Logger.log('[Auto Daily Mail] ' + JSON.stringify(res));
}

function runWeeklyDriveBackup() {
  const res = runDriveSqlBackupCore({ mode: 'weekly', force: false, triggeredBy: 'Auto Weekly' });
  Logger.log('[Auto Weekly Backup] ' + JSON.stringify(res));
}

function runQuarterlyDriveBackup() {
  const month = Number(Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'M'));
  // Run only on Quarter starts: Jan (1), Apr (4), Jul (7), Oct (10)
  if ([1, 4, 7, 10].indexOf(month) === -1) {
    Logger.log('[Quarterly Archive] Skipped (Month ' + month + ' is not quarter start)');
    return;
  }
  const res = runDriveSqlBackupCore({ mode: 'archive', force: false, triggeredBy: 'Auto Quarterly Archive' });
  Logger.log('[Auto Quarterly Archive] ' + JSON.stringify(res));
}

// ===================================================================
// 3. WEBHOOK RECEIVER FOR DASHBOARD MANUAL BUTTONS (doPost)
// ===================================================================
function doPost(e) {
  try {
    const raw = (e && e.postData && e.postData.contents) ? e.postData.contents : '{}';
    const body = JSON.parse(raw);

    if (!body || body.secret !== CONFIG.GAS_SECRET) {
      return jsonOut({ success: false, error: 'Unauthorized GAS secret' });
    }

    if (body.action === 'send_daily_mail') {
      return jsonOut(sendDailyMailCore({
        fy: body.fy || '',
        date: body.date || '',
        force: body.force !== false,
        triggeredBy: body.triggeredBy || 'Manual Dashboard',
      }));
    }

    if (body.action === 'drive_sql_backup') {
      return jsonOut(runDriveSqlBackupCore({
        mode: body.mode || 'manual',
        force: body.force === true,
        triggeredBy: body.triggeredBy || 'Manual Dashboard',
      }));
    }

    return jsonOut({ success: false, error: 'Unknown action: ' + String(body.action || '') });
  } catch (err) {
    return jsonOut({ success: false, error: err.message || String(err) });
  }
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ===================================================================
// 4. API HELPER (Calls Cloudflare Worker using X-GAS-Secret)
// ===================================================================
function callWorkerGet(path) {
  const res = UrlFetchApp.fetch(CONFIG.API_BASE + path, {
    method: 'get',
    headers: { 'X-GAS-Secret': CONFIG.GAS_SECRET },
    muteHttpExceptions: true,
  });
  const code = res.getResponseCode();
  const text = res.getContentText();
  let data = null;
  try { data = JSON.parse(text); } catch (_) {}
  if (code < 200 || code >= 300 || !data || !data.success) {
    throw new Error((data && data.error) || ('Worker HTTP ' + code + ': ' + text.slice(0, 160)));
  }
  return data;
}

// ===================================================================
// 5. DAILY MAIL ENGINE (Multi-Sheet .xlsx Attachment + Change Summary)
// ===================================================================
function sendDailyMailCore(opts) {
  const mode = opts.mode || '';
  const dateParam = opts.date || '';
  const force = opts.force === true;
  const triggeredBy = opts.triggeredBy || 'System';

  const qs = dateParam
    ? ('?date=' + encodeURIComponent(dateParam))
    : (mode ? ('?mode=' + encodeURIComponent(mode)) : '');

  const changes = callWorkerGet('/api/system/daily-changes' + qs);
  const reportDate = changes.date || Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd');

  // Auto mode: စာရင်းအသစ် မရှိရင် Mail မပို့ဘဲ ရပ်မည်
  if (!force && !changes.hasChanges) {
    return {
      success: true,
      sent: false,
      skipped: true,
      date: reportDate,
      message: reportDate + ' ရက်နေ့အတွက် စာရင်းအသစ် မရှိသဖြင့် Mail မပို့ပါ။',
    };
  }

  const fy = opts.fy || reportDate.slice(0, 4);
  const xlsxBlob = buildMultiSheetXlsxBlob(fy, reportDate);

  const subject = `[Sāsana ERP] နေ့စဉ်ငွေစာရင်း အစီရင်ခံစာ (${reportDate}) — FY ${fy}`;
  const htmlBody = buildDailyMailHtml(changes, fy, triggeredBy);
  const plainBody = `ဓမ္မအလင်းရောင်တောရရိပ်သာ - Sāsana ERP\nရက်စွဲ: ${reportDate}\nစာရင်းအသစ်/ပြင်ဆင်မှု: ${changes.totalChanged || 0} ကြောင်း\nExcel ဖိုင်အား Attachment တွင် ပူးတွဲပေးပို့ထားပါသည်။`;

  GmailApp.sendEmail(CONFIG.MAIL_TO, subject, plainBody, {
    htmlBody: htmlBody,
    attachments: [xlsxBlob],
    name: 'Sāsana ERP Auto Mail',
  });

  return {
    success: true,
    sent: true,
    date: reportDate,
    fy: fy,
    totalChanged: changes.totalChanged || 0,
    message: `${CONFIG.MAIL_TO} သို့ ${reportDate} (FY: ${fy}) Excel တွဲ၍ Mail ပေးပို့ပြီးပါပြီ (စာရင်းအသစ် ${changes.totalChanged || 0} ကြောင်း)။`,
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

      list.slice(0, 30).forEach(r => {
        const dt = r.date || r.start_date || '';
        const title = r.title || r.category || r.yogi_type || '-';
        const desc = r.description || r.name || '-';
        const inc = r.income ? Number(r.income).toLocaleString() : '-';
        const exp = r.expense ? Number(r.expense).toLocaleString() : (r.qty !== undefined ? ('Qty: ' + r.qty) : '-');
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

function escapeHtml(v) {
  return String(v === null || v === undefined ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// -------------------------------------------------------------------
// Native Multi-Sheet Excel (.xlsx) Builder via Temporary Google Sheet
// -------------------------------------------------------------------
function buildMultiSheetXlsxBlob(fy, dateStr) {
  const data = callWorkerGet('/api/system/export-excel?fy=' + encodeURIComponent(fy || 'ALL'));
  const ss = SpreadsheetApp.create('TEMP_Sasana_ERP_' + Date.now());
  const ssId = ss.getId();

  try {
    // 1. Summary Sheet
    const defaultSheet = ss.getSheets()[0];
    defaultSheet.setName('Summary');

    const sumHeader = [['စဉ်', 'စာအုပ်အမည် (Book)', 'စာရင်းဖွင့်လက်ကျန်', 'စုစုပေါင်းဝင်ငွေ', 'စုစုပေါင်းထွက်ငွေ', 'လက်ကျန်ငွေ', 'စာကြောင်းရေ']];
    const sumBody = (data.summary || []).map((s, idx) => [
      idx + 1, s.book_name, s.opening_balance, s.total_income, s.total_expense, s.closing_balance, s.row_count,
    ]);
    const allSum = sumHeader.concat(sumBody);
    defaultSheet.getRange(1, 1, allSum.length, sumHeader[0].length).setValues(allSum);
    defaultSheet.getRange(1, 1, 1, sumHeader[0].length).setFontWeight('bold').setBackground('#fef3c7');
    if (sumBody.length > 0) {
      defaultSheet.getRange(2, 3, sumBody.length, 4).setNumberFormat('#,##0');
    }

    // 2. All 13 Data Sheets
    const sheetsMap = data.sheets || {};
    Object.keys(sheetsMap).forEach(tblName => {
      const rows = sheetsMap[tblName] || [];
      const safeName = String(tblName).replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31);
      const sh = ss.insertSheet(safeName);

      let header, body, moneyCols = [];
      if (tblName === 'Inventory') {
        header = ['စဉ်', 'ရက်စွဲ', 'တည်နေရာ', 'အမျိုးအစား', 'အကြောင်းအရာ', 'ရေတွက်ပုံ', 'အရေအတွက်', 'မှတ်ချက်', 'လနှစ်'];
        body = rows.map(r => [r.no, r.date, r.location, r.category, r.description, r.unit, r.qty, r.remark, r.month_year]);
      } else if (tblName === 'Permanent Yogi' || tblName === 'Camp Yogi') {
        header = ['စဉ်', 'စတင်ရက်', 'ထွက်ရက်', 'အမျိုးအစား', 'ယောဂီအမည်', 'အဘအမည်', 'မှတ်ပုံတင်', 'မွေးသက္ကရာဇ်', 'အသက်', 'ကျား/မ', 'ယောဂီဖုန်း', 'အိမ်ဖုန်း', 'နေရပ်လိပ်စာ', 'အခြေအနေ'];
        body = rows.map(r => [r.no, r.start_date, r.end_date, r.yogi_type, r.name, r.father_name, r.nrc, r.dob, r.age, r.gender, r.yogi_phone, r.home_phone, r.address, r.status]);
      } else {
        header = ['စဉ်', 'ရက်စွဲ', 'ခေါင်းစဉ်', 'အကြောင်းအရာ', 'ဝင်ငွေ', 'ထွက်ငွေ', 'လက်ကျန်', 'ခေါင်းစဉ်ခွဲ', 'ဘောင်ချာ', 'လက်ခံသူ', 'လနှစ်', 'စာအုပ်အမည်'];
        body = rows.map(r => [r.no, r.date, r.title, r.description, r.income, r.expense, r.balance, r.sub_title, r.voucher_no, r.receiver, r.month_year, r.book_name]);
        moneyCols = [5, 3]; // start col 5, 3 cols (income, expense, balance)
      }

      const full = [header].concat(body);
      sh.getRange(1, 1, full.length, header.length).setValues(full);
      sh.getRange(1, 1, 1, header.length).setFontWeight('bold').setBackground('#e2e8f0');
      if (moneyCols.length === 2 && body.length > 0) {
        sh.getRange(2, moneyCols[0], body.length, moneyCols[1]).setNumberFormat('#,##0');
      }
    });

    SpreadsheetApp.flush();

    const exportUrl = 'https://docs.google.com/spreadsheets/d/' + ssId + '/export?format=xlsx';
    const resp = UrlFetchApp.fetch(exportUrl, {
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
      muteHttpExceptions: true,
    });
    if (resp.getResponseCode() !== 200) {
      throw new Error('Excel export HTTP ' + resp.getResponseCode());
    }

    const fileName = `Sasana_ERP_FY_${data.fy || fy}_${dateStr}.xlsx`;
    return resp.getBlob().setName(fileName);
  } finally {
    // Always clean up temporary Google Sheet
    try { DriveApp.getFileById(ssId).setTrashed(true); } catch (_) {}
  }
}

// ===================================================================
// 6. GOOGLE DRIVE SQL (.zip) BACKUP ENGINE (Only Saves When Data Changed)
// ===================================================================
function getOrCreateSubFolder(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function pruneOldFiles(folder, keepCount) {
  const list = [];
  const it = folder.getFiles();
  while (it.hasNext()) list.push(it.next());
  if (list.length <= keepCount) return;

  list.sort((a, b) => b.getDateCreated().getTime() - a.getDateCreated().getTime());
  for (let i = keepCount; i < list.length; i++) {
    list[i].setTrashed(true);
  }
}

function runDriveSqlBackupCore(opts) {
  const mode = String(opts.mode || 'manual').toLowerCase(); // 'weekly' | 'archive' | 'manual'
  const force = opts.force === true;
  const props = PropertiesService.getScriptProperties();
  const fpKey = (mode === 'archive') ? 'LAST_ARCHIVE_FINGERPRINT' : 'LAST_BACKUP_FINGERPRINT';

  // Step 1: Ultra-cheap 13-row fingerprint check
  const check = callWorkerGet('/api/system/sql-dump?check_only=1');
  const prevFp = props.getProperty(fpKey) || '';

  if (!force && prevFp && check.fingerprint === prevFp) {
    return {
      success: true,
      skipped: true,
      mode: mode,
      message: 'နောက်ဆုံး Backup သိမ်းထားချိန်မှစ၍ ဒေတာအသစ် မရှိသေးပါသဖြင့် Backup အပို မသိမ်းပါ။',
    };
  }

  // Step 2: Pull full SQL Dump from Worker D1
  const dump = callWorkerGet('/api/system/sql-dump');
  const stamp = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd_HHmm');
  const sqlName = `Sasana_ERP_D1_${stamp}.sql`;
  const zipName = `Sasana_ERP_D1_${mode.toUpperCase()}_${stamp}.zip`;

  const sqlBlob = Utilities.newBlob(dump.sql, 'application/sql', sqlName);
  const zipBlob = Utilities.zip([sqlBlob], zipName);

  // Step 3: Save to Google Drive -> Sasana_ERP_Backups / (Weekly | Archive | Manual)
  const rootFolder = getOrCreateSubFolder(DriveApp.getRootFolder(), CONFIG.DRIVE_ROOT_FOLDER);
  const subName = mode === 'weekly' ? 'Weekly' : (mode === 'archive' ? 'Archive' : 'Manual');
  const targetFolder = getOrCreateSubFolder(rootFolder, subName);

  const savedFile = targetFolder.createFile(zipBlob);
  if (mode === 'weekly') {
    pruneOldFiles(targetFolder, CONFIG.WEEKLY_KEEP_COUNT);
  }

  // Save latest fingerprint
  props.setProperty(fpKey, dump.fingerprint || check.fingerprint || '');
  if (mode === 'manual') {
    props.setProperty('LAST_BACKUP_FINGERPRINT', dump.fingerprint || check.fingerprint || '');
  }

  return {
    success: true,
    skipped: false,
    mode: mode,
    folder: CONFIG.DRIVE_ROOT_FOLDER + '/' + subName,
    fileName: zipName,
    fileUrl: savedFile.getUrl(),
    totalRows: dump.totalRows || 0,
    message: `Google Drive (${CONFIG.DRIVE_ROOT_FOLDER}/${subName}) ထဲသို့ ${zipName} (${dump.totalRows || 0} rows) သိမ်းဆည်းပြီးပါပြီ။`,
  };
}
