// ===================================================================
// SĀSANA ERP - ALL-IN-ONE ENTERPRISE WORKER ENGINE (worker.js)
// Zero External Imports - 100% Bulletproof Batch Engine
// Features: Auto-Bootstrap Preload, Offline Sync, 13 D1 Tables Support, 4-Padetha Summary
// ===================================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

const jsonCorsHeaders = {
  ...corsHeaders,
  'Content-Type': 'application/json; charset=utf-8',
};

function isValidToken(request) {
  const authHeader = request.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return false;
  const token = authHeader.substring(7).trim();
  return Boolean(token && token.startsWith("tok_"));
}

function formatMonthYear(dateStr) {
  if (!dateStr) return "-";
  const d = new Date(dateStr.length === 7 ? `${dateStr}-01` : dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[d.getMonth()]}-${String(d.getFullYear()).slice(-2)}`;
}

const TABLE_MAP = {
  '1CB': '1CB Bank (General)',
  '2CB': '2CB Bank (Meal)',
  '3CB': '3CB Bank (UZ)',
  '4GB': '1General Book',
  '5FB': '2Meal Book',
  '6HB': '3Hall Book',
  '7PB': '4Pagoda Book',
  '8EB': '5Electronic Book',
  '9MB': '6Medical Book',
  '10GB': '7Other Book',
  '1CB Bank (General)': '1CB Bank (General)',
  '2CB Bank (Meal)': '2CB Bank (Meal)',
  '3CB Bank (UZ)': '3CB Bank (UZ)',
  '1General Book': '1General Book',
  '2Meal Book': '2Meal Book',
  '3Hall Book': '3Hall Book',
  '4Pagoda Book': '4Pagoda Book',
  '5Electronic Book': '5Electronic Book',
  '6Medical Book': '6Medical Book',
  '7Other Book': '7Other Book'
};

const TRANSFER_TARGET_BANKS = {
  '4GB': '1CB Bank (General)',
  '1General Book': '1CB Bank (General)',
  '5FB': '2CB Bank (Meal)',
  '2Meal Book': '2CB Bank (Meal)',
  '8EB': '2CB Bank (Meal)',
  '5Electronic Book': '2CB Bank (Meal)',
  '9MB': '2CB Bank (Meal)',
  '6Medical Book': '2CB Bank (Meal)',
  '10GB': '2CB Bank (Meal)',
  '7Other Book': '2CB Bank (Meal)'
};

function resolveYogiTable(sheetOrTable) {
  const s = String(sheetOrTable || '').trim();
  if (s === '13Yogi' || s === 'Camp Yogi' || s.includes('စခန်းဝင်')) return 'Camp Yogi';
  return 'Permanent Yogi';
}

async function queryBookEntries(env, tableName, rawSheet) {
  const { results } = await env.DB.prepare(
    `SELECT * FROM "${tableName}" ORDER BY date ASC, id ASC`
  ).all();

  let runningBalance = 0, totalIncome = 0, totalExpense = 0;
  const formatted = (results || []).map((row, idx) => {
    const inc = parseFloat(row.income) || 0, exp = parseFloat(row.expense) || 0;
    totalIncome += inc; totalExpense += exp; runningBalance += (inc - exp);
    const uid = row.unique_id || `CB-${row.id}`;
    return {
      id: row.id, no: row.no || (idx + 1), uniqueId: uid, unique_id: uid,
      sheet_name: rawSheet, date: row.date, entry_date: row.date,
      category: row.title || (inc > 0 ? 'ဝင်ငွေ' : 'ထွက်ငွေ'), title: row.title || '',
      subcategory: row.sub_title || '-', sub_title: row.sub_title || '',
      voucher_no: row.voucher_no || '', description: row.description || '', receiver: row.receiver || '',
      income: inc, expense: exp, balance: runningBalance,
      month_year: row.month_year || formatMonthYear(row.date), book_name: row.book_name || tableName
    };
  });

  return {
    book: tableName,
    data: formatted,
    kpis: { totalIncome, totalExpense, balance: runningBalance, count: results.length }
  };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const method = request.method;

    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    try {
      // -------------------------------------------------------------
      // 2. AUTHENTICATION: POST /api/login
      // -------------------------------------------------------------
      if (pathname === '/api/login' && method === 'POST') {
        const body = await request.json();
        const username = (body.username || '').trim();
        const password = (body.password || '').trim();

        if (!username || !password) {
          return new Response(JSON.stringify({ success: false, error: 'Username and password required' }), {
            status: 400, headers: jsonCorsHeaders
          });
        }

        const { results } = await env.DB.prepare(
          `SELECT id, username, role FROM users WHERE username = ? AND password = ? LIMIT 1`
        ).bind(username, password).all();

        if (results && results.length > 0) {
          const user = results[0];
          const token = `tok_${user.id}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
          return new Response(JSON.stringify({
            success: true,
            token,
            user: { 
              id: user.id, 
              username: user.username, 
              role: user.role || 'Staff', 
              name: user.username 
            },
            expiresInMs: 24 * 60 * 60 * 1000
          }), { headers: jsonCorsHeaders });
        } else {
          return new Response(JSON.stringify({
            success: false, error: 'အသုံးပြုသူအမည် သို့မဟုတ် လျှို့ဝှက်နံပါတ် မှားယွင်းနေပါသည်။'
          }), { status: 401, headers: jsonCorsHeaders });
        }
      }

      if (!isValidToken(request)) {
        return new Response(JSON.stringify({
          success: false, error: 'Unauthorized: မလုပ်ဆောင်မီ Login ပြန်လည်ဝင်ရောက်ပေးပါခင်ဗျာ။'
        }), { status: 401, headers: jsonCorsHeaders });
      }

      // -------------------------------------------------------------
      // 3. BOOTSTRAP PRELOAD API: GET /api/bootstrap
      // -------------------------------------------------------------
      if (pathname === '/api/bootstrap' && method === 'GET') {
        const ALL_SHEETS = ['1CB', '2CB', '3CB', '4GB', '5FB', '6HB', '7PB', '8EB', '9MB', '10GB'];

        const bookPromises = ALL_SHEETS.map(code => queryBookEntries(env, TABLE_MAP[code], code));
        const invPromise = env.DB.prepare(`SELECT * FROM "Inventory" ORDER BY date ASC, id ASC`).all();
        const permYogiPromise = env.DB.prepare(`SELECT * FROM "Permanent Yogi" ORDER BY start_date ASC, id ASC`).all();
        const campYogiPromise = env.DB.prepare(`SELECT * FROM "Camp Yogi" ORDER BY start_date ASC, id ASC`).all();

        const [bookResults, invRes, permYogiRes, campYogiRes] = await Promise.all([
          Promise.all(bookPromises),
          invPromise,
          permYogiPromise,
          campYogiPromise
        ]);

        const booksPayload = {};
        ALL_SHEETS.forEach((code, idx) => {
          booksPayload[code] = bookResults[idx];
        });

        return new Response(JSON.stringify({
          success: true,
          timestamp: Date.now(),
          books: booksPayload,
          inventory: invRes.results || [],
          yogi: {
            '12Yogi': permYogiRes.results || [],
            '13Yogi': campYogiRes.results || []
          }
        }), { headers: jsonCorsHeaders });
      }

      // -------------------------------------------------------------
      // 4. OFFLINE BATCH SYNC: POST /api/sync
      // -------------------------------------------------------------
      if (pathname === '/api/sync' && method === 'POST') {
        const { queue } = await request.json();
        const results = [];
        for (const item of (queue || [])) {
          try {
            const { action, table, data, unique_id } = item;
            if (!table || !unique_id) continue;
            if (action === 'CREATE') {
              const keys = Object.keys(data).filter(k => k !== 'id');
              const placeholders = keys.map(() => '?').join(', ');
              const values = keys.map(k => data[k]);
              const colNames = keys.map(k => `"${k}"`).join(', ');
              await env.DB.prepare(`INSERT OR REPLACE INTO "${table}" (${colNames}) VALUES (${placeholders})`).bind(...values).run();
              results.push({ unique_id, status: 'synced' });
            } else if (action === 'DELETE') {
              await env.DB.prepare(`DELETE FROM "${table}" WHERE unique_id = ?`).bind(unique_id).run();
              results.push({ unique_id, status: 'deleted' });
            }
          } catch (e) {
            results.push({ unique_id: item.unique_id, status: 'error', error: e.message });
          }
        }
        return new Response(JSON.stringify({ success: true, count: results.length, results }), { headers: jsonCorsHeaders });
      }

      // -------------------------------------------------------------
      // 🌟 5. HOME DASHBOARD: GET /api/home-summary (Fund + 4-Padetha + Yogi)
      // -------------------------------------------------------------
      if (pathname === '/api/home-summary' && method === 'GET') {
        const BANK_SHEETS = ['1CB', '2CB', '3CB'];
        const ALL_SHEETS = ['1CB', '2CB', '3CB', '4GB', '5FB', '6HB', '7PB', '8EB', '9MB', '10GB'];

        const fundSummary = {};
        ALL_SHEETS.forEach(s => {
          fundSummary[s] = { bankBalance: 0, user1Balance: 0, user2Balance: 0, user3Balance: 0, totalBalance: 0 };
        });

        let totalFund = 0, totalBank = 0, totalCash = 0, totalCount = 0;

        // ၁။ စာအုပ် ၁၀ အုပ်လုံး၏ ရန်ပုံငွေများ တွက်ချက်ခြင်း
        try {
          const batchStatements = ALL_SHEETS.map(sheet => {
            const tbl = TABLE_MAP[sheet];
            if (BANK_SHEETS.includes(sheet)) {
              return env.DB.prepare(`SELECT '${sheet}' as sheet_code, '' as receiver, COALESCE(SUM(COALESCE(income,0) - COALESCE(expense,0)), 0) as net_amount, COUNT(*) as row_count FROM "${tbl}"`);
            } else {
              return env.DB.prepare(`SELECT '${sheet}' as sheet_code, COALESCE(receiver, 'User 1') as receiver, COALESCE(SUM(COALESCE(income,0) - COALESCE(expense,0)), 0) as net_amount, COUNT(*) as row_count FROM "${tbl}" GROUP BY receiver`);
            }
          });

          const batchResults = await env.DB.batch(batchStatements);

          batchResults.forEach((res, idx) => {
            const sheet = ALL_SHEETS[idx];
            (res.results || []).forEach(row => {
              const receiver = String(row.receiver || '').trim();
              const amount = parseFloat(row.net_amount) || 0;
              totalCount += parseInt(row.row_count) || 0;

              if (BANK_SHEETS.includes(sheet)) {
                fundSummary[sheet].bankBalance += amount;
                totalBank += amount;
              } else {
                if (receiver.includes('User 2') || receiver.includes('User2')) fundSummary[sheet].user2Balance += amount;
                else if (receiver.includes('User 3') || receiver.includes('User3')) fundSummary[sheet].user3Balance += amount;
                else fundSummary[sheet].user1Balance += amount;
                totalCash += amount;
              }
              fundSummary[sheet].totalBalance += amount;
              totalFund += amount;
            });
          });
        } catch (fundErr) {
          console.error('[Dashboard Fund Batch Error]:', fundErr);
        }

        // 🌟 ၂။ ပဒေသာပင် ၄ အုပ်၏ (ဝင်ငွေ၊ ဘဏ်အပ်နှံ၊ လက်ကျန်) သီးသန့် တွက်ချက်ခြင်း
        let padethaSummary = [];
        try {
          const padethaSql = `
            SELECT '2Meal Book' as table_name, 'ဆွမ်းပဒေသာပင် စာအုပ်' as title, COALESCE(SUM(COALESCE(income,0)), 0) as income, COALESCE(SUM(COALESCE(expense,0)), 0) as expense FROM "2Meal Book"
            UNION ALL
            SELECT '5Electronic Book', 'လျှပ်စစ်ပဒေသာပင် စာအုပ်', COALESCE(SUM(COALESCE(income,0)), 0), COALESCE(SUM(COALESCE(expense,0)), 0) FROM "5Electronic Book"
            UNION ALL
            SELECT '6Medical Book', 'ဆေးပဒေသာပင် စာအုပ်', COALESCE(SUM(COALESCE(income,0)), 0), COALESCE(SUM(COALESCE(expense,0)), 0) FROM "6Medical Book"
            UNION ALL
            SELECT '7Other Book', 'အထွေထွေရန်ပုံငွေစာအုပ်', COALESCE(SUM(COALESCE(income,0)), 0), COALESCE(SUM(COALESCE(expense,0)), 0) FROM "7Other Book"
          `;
          const { results: padethaRows } = await env.DB.prepare(padethaSql).all();
          padethaSummary = (padethaRows || []).map(r => ({
            table_name: r.table_name,
            title: r.title,
            income: parseFloat(r.income) || 0,
            expense: parseFloat(r.expense) || 0,
            balance: (parseFloat(r.income) || 0) - (parseFloat(r.expense) || 0)
          }));
        } catch (padethaErr) {
          console.error('[Dashboard Padetha Error]:', padethaErr);
        }

        // ၃။ ယောဂီ ပေါင်းချုပ် တွက်ချက်ခြင်း
        const YOGI_CATS = ['ရဟန်း', 'ကိုရင်', 'သီလရှင်', 'လူပုဂ္ဂိုလ်', 'ဝေယျာဝိစ္စ'];
        const residentMatrix = {}, retreatMatrix = {};
        YOGI_CATS.forEach(c => {
          residentMatrix[c] = { male: 0, female: 0, total: 0 };
          retreatMatrix[c] = { male: 0, female: 0, total: 0 };
        });

        try {
          const [permYogiRes, campYogiRes] = await env.DB.batch([
            env.DB.prepare(`SELECT '12Yogi' as sheet_type, yogi_type, name, gender FROM "Permanent Yogi" WHERE (end_date IS NULL OR end_date = '' OR end_date = '-')`),
            env.DB.prepare(`SELECT '13Yogi' as sheet_type, yogi_type, name, gender FROM "Camp Yogi" WHERE (end_date IS NULL OR end_date = '' OR end_date = '-')`)
          ]);

          const allYogis = [...(permYogiRes.results || []), ...(campYogiRes.results || [])];
          allYogis.forEach(row => {
            const target = (row.sheet_type === '13Yogi') ? retreatMatrix : residentMatrix;
            const name = String(row.name || ''), type = String(row.yogi_type || ''), gender = String(row.gender || 'ကျား');
            let cat = 'လူပုဂ္ဂိုလ်';
            if (name.includes('ဦး') || name.includes('အရှင်') || name.includes('ဆရာတော်') || type.includes('ရဟန်း') || type.includes('သံဃာ')) cat = 'ရဟန်း';
            else if (name.includes('ကိုရင်') || type.includes('ကိုရင်')) cat = 'ကိုရင်';
            else if (name.includes('ဒေါ်လေး') || name.includes('ဆရာလေး') || type.includes('သီလရှင်')) cat = 'သီလရှင်';
            else if (type.includes('ဝေယျာဝိစ္စ')) cat = 'ဝေယျာဝိစ္စ';

            if (target[cat]) {
              if (gender === 'မ') target[cat].female += 1;
              else target[cat].male += 1;
              target[cat].total += 1;
            }
          });
        } catch (yogiErr) {
          console.error('[Dashboard Yogi Batch Error]:', yogiErr);
        }

        return new Response(JSON.stringify({
          success: true,
          kpis: { totalFund, totalBank, totalCash, totalCount },
          fundSummary,
          padethaSummary,
          yogiSummary: { resident: residentMatrix, retreat: retreatMatrix }
        }), { headers: jsonCorsHeaders });
      }

      // -------------------------------------------------------------
      // 6. BANK & LEDGER BOOKS: /api/entries
      // -------------------------------------------------------------
      if (pathname === '/api/entries') {
        const rawSheet = url.searchParams.get('sheet') || url.searchParams.get('book') || '1CB';
        const tableName = TABLE_MAP[rawSheet.trim()] || '1CB Bank (General)';

        if (method === 'GET') {
          const bookData = await queryBookEntries(env, tableName, rawSheet);
          return new Response(JSON.stringify({ success: true, ...bookData }), { headers: jsonCorsHeaders });
        }

        if (method === 'POST') {
          const body = await request.json();
          const targetTable = TABLE_MAP[String(body.sheet_name || body.sheet_code || rawSheet).trim()] || tableName;
          const date = body.entry_date || body.date || new Date().toISOString().split('T')[0];
          const title = body.category || body.title || 'ဝင်ငွေ';
          const sub_title = body.subcategory || body.sub_title || '';
          const voucher_no = body.voucher_no || '';
          const receiver = body.receiver || 'User 1';
          const description = (body.description || sub_title || title || 'စာရင်းထည့်သွင်းခြင်း').trim();
          const month_year = formatMonthYear(date);
          const unique_id = body.unique_id || body.uniqueId || crypto.randomUUID();
          let inc = parseFloat(body.income || 0), exp = parseFloat(body.expense || 0);

          if (body.amount && !inc && !exp) {
            const amt = parseFloat(body.amount);
            if (title === 'ထွက်ငွေ' || title === 'စာရင်းပြောင်း') exp = amt; else inc = amt;
          }

          // 4GB Transfer Logic
          if ((rawSheet === '4GB' || targetTable === '1General Book') && (title === 'စာရင်းပြောင်း')) {
            const text = `${body.transfer_target || ''} ${sub_title} ${description}`;
            let targetUser = text.includes('User 2') ? 'User 2' : (text.includes('User 3') ? 'User 3' : (text.includes('User 1') ? 'User 1' : null));
            const amt = exp || inc;
            if (targetUser && targetUser !== receiver) {
              await env.DB.prepare(`INSERT INTO "1General Book" (date, title, sub_title, voucher_no, expense, income, receiver, description, month_year, book_name, unique_id) VALUES (?, 'စာရင်းပြောင်း', ?, ?, ?, 0, ?, ?, ?, '1General Book', ?)`).bind(date, `${targetUser} သို့ လွှဲပြောင်း`, voucher_no, amt, receiver, `${targetUser} ထံ စာရင်းပြောင်း ပေးပို့ခြင်း`, month_year, unique_id).run();
              await env.DB.prepare(`INSERT INTO "1General Book" (date, title, sub_title, voucher_no, income, expense, receiver, description, month_year, book_name, unique_id) VALUES (?, 'စာရင်းပြောင်း', ?, ?, ?, 0, ?, ?, ?, '1General Book', ?)`).bind(date, `${receiver} ထံမှ လွှဲပြောင်းရရှိ`, voucher_no, amt, targetUser, `${receiver} ထံမှ စာရင်းပြောင်း ရရှိခြင်း`, month_year, crypto.randomUUID()).run();
              return new Response(JSON.stringify({ success: true, unique_id }), { headers: jsonCorsHeaders });
            }
            // Bank Deposit
            await env.DB.prepare(`INSERT INTO "1General Book" (date, title, sub_title, voucher_no, expense, income, receiver, description, month_year, book_name, unique_id) VALUES (?, 'စာရင်းပြောင်း', 'ဘဏ်အပ်နှံခြင်း', ?, ?, 0, ?, ?, ?, '1General Book', ?)`).bind(date, voucher_no, amt, receiver, `အထွေထွေ ရန်ပုံငွေ (Bank) သို့ ဘဏ်အပ်နှံခြင်း`, month_year, unique_id).run();
            await env.DB.prepare(`INSERT INTO "1CB Bank (General)" (date, title, sub_title, voucher_no, income, expense, receiver, description, month_year, book_name, unique_id) VALUES (?, 'ဘဏ်အပ်ငွေ', 'ဘဏ်အပ်နှံခြင်း', ?, ?, 0, ?, ?, ?, '1CB Bank (General)', ?)`).bind(date, voucher_no, amt, receiver, `ကျောင်းရန်ပုံငွေ (4GB) [${receiver}] မှ ဘဏ်အပ်ငွေ`, month_year, crypto.randomUUID()).run();
            return new Response(JSON.stringify({ success: true, unique_id }), { headers: jsonCorsHeaders });
          }

          // Books to 2CB Bank
          const targetBank = TRANSFER_TARGET_BANKS[rawSheet] || TRANSFER_TARGET_BANKS[targetTable];
          if ((title === 'စာရင်းပြောင်း') && targetBank) {
            const amt = exp || inc;
            await env.DB.prepare(`INSERT INTO "${targetTable}" (date, title, sub_title, voucher_no, expense, income, receiver, description, month_year, book_name, unique_id) VALUES (?, 'စာရင်းပြောင်း', 'ဘဏ်အပ်နှံခြင်း', ?, ?, 0, ?, ?, ?, ?, ?)`).bind(date, voucher_no, amt, receiver, description, month_year, targetTable, unique_id).run();
            await env.DB.prepare(`INSERT INTO "${targetBank}" (date, title, sub_title, voucher_no, income, expense, receiver, description, month_year, book_name, unique_id) VALUES (?, 'ဘဏ်အပ်ငွေ', 'လှူဒါန်းငွေ အပ်နှံခြင်း', ?, ?, 0, ?, ?, ?, ?, ?)`).bind(date, voucher_no, amt, receiver, `${targetTable} မှ စာရင်းပြောင်း အဝင်`, month_year, targetBank, crypto.randomUUID()).run();
            return new Response(JSON.stringify({ success: true, unique_id }), { headers: jsonCorsHeaders });
          }

          // Normal Record
          await env.DB.prepare(`INSERT INTO "${targetTable}" (date, title, sub_title, voucher_no, income, expense, receiver, description, month_year, book_name, unique_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(date, title, sub_title, voucher_no, inc, exp, receiver, description, month_year, targetTable, unique_id).run();
          return new Response(JSON.stringify({ success: true, unique_id }), { headers: jsonCorsHeaders });
        }

        if (method === 'PUT') {
          const body = await request.json();
          const targetTable = TABLE_MAP[String(body.sheet_name || body.sheet_code || rawSheet).trim()] || tableName;
          const uid = body.unique_id || body.uniqueId;
          const desc = (body.description || body.sub_title || body.title || 'စာရင်းပြင်ဆင်ခြင်း').trim();
          await env.DB.prepare(`UPDATE "${targetTable}" SET date = ?, title = ?, sub_title = ?, voucher_no = ?, income = ?, expense = ?, receiver = ?, description = ?, month_year = ?, updated_at = datetime('now') WHERE unique_id = ? OR id = ?`).bind(body.entry_date || body.date, body.category || body.title, body.subcategory || body.sub_title || '', body.voucher_no || '', parseFloat(body.income || 0), parseFloat(body.expense || 0), body.receiver || '', desc, formatMonthYear(body.entry_date || body.date), uid, body.id || null).run();
          return new Response(JSON.stringify({ success: true }), { headers: jsonCorsHeaders });
        }

        if (method === 'DELETE') {
          const uid = url.searchParams.get('unique_id') || url.searchParams.get('uniqueId');
          const id = url.searchParams.get('id');
          await env.DB.prepare(`DELETE FROM "${tableName}" WHERE unique_id = ? OR id = ?`).bind(uid, id).run();
          return new Response(JSON.stringify({ success: true }), { headers: jsonCorsHeaders });
        }
      }

      // -------------------------------------------------------------
      // 7. INVENTORY: /api/inventory
      // -------------------------------------------------------------
      if (pathname === '/api/inventory') {
        if (method === 'GET') {
          const { results } = await env.DB.prepare(`SELECT * FROM "Inventory" ORDER BY date ASC, id ASC`).all();
          let kitchen = 0, dhammaHall = 0, sim = 0, store = 0, totalQty = 0;
          const formatted = (results || []).map((row, idx) => {
            const q = parseFloat(row.qty) || 0, loc = (row.location || '').trim();
            totalQty += q;
            if (loc.includes('မီးဖို')) kitchen += q; else if (loc.includes('ဓမ္မာရုံ')) dhammaHall += q; else if (loc.includes('သိမ်')) sim += q; else if (loc.includes('စတို')) store += q;
            const uid = row.unique_id || `INV-${row.id}`;
            return {
              id: row.id, no: row.no || (idx + 1), uniqueId: uid, unique_id: uid, entry_date: row.date || '', date: row.date || '', location: row.location || 'စတို', category: row.category || 'အထွေထွေ', description: row.description || '', item_name: row.description || '', item_desc: row.description || '', unit: row.unit || 'ခု', qty: q, remark: row.remark || '', note: row.remark || '', month_year: row.month_year || '', book_name: 'Inventory'
            };
          });
          return new Response(JSON.stringify({ success: true, data: formatted, kpis: { kitchen, dhammaHall, sim, store, totalQty, totalItems: results.length } }), { headers: jsonCorsHeaders });
        }

        if (method === 'POST') {
          const b = await request.json();
          const desc = (b.description || b.item_name || b.item_desc || '').trim();
          const date = b.entry_date || b.date || new Date().toISOString().split('T')[0];
          const uid = b.unique_id || b.uniqueId || `INV-${crypto.randomUUID()}`;
          await env.DB.prepare(`INSERT INTO "Inventory" (date, location, category, description, unit, qty, remark, month_year, book_name, unique_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Inventory', ?)`).bind(date, (b.location || 'စတို').trim(), (b.category || 'အထွေထွေ').trim(), desc, (b.unit || 'ခု').trim(), parseFloat(b.qty) || 0, (b.remark || b.note || '').trim(), date.substring(0, 7), uid).run();
          return new Response(JSON.stringify({ success: true, unique_id: uid }), { headers: jsonCorsHeaders });
        }

        if (method === 'PUT') {
          const b = await request.json();
          const uid = b.unique_id || b.uniqueId;
          const desc = (b.description || b.item_name || b.item_desc || '').trim();
          const date = b.entry_date || b.date;
          await env.DB.prepare(`UPDATE "Inventory" SET date = ?, location = ?, category = ?, description = ?, unit = ?, qty = ?, remark = ?, month_year = ?, updated_at = datetime('now') WHERE unique_id = ? OR id = ?`).bind(date, b.location, b.category, desc, b.unit || 'ခု', parseFloat(b.qty) || 0, b.remark || b.note || '', date ? date.substring(0, 7) : '', uid, b.id || null).run();
          return new Response(JSON.stringify({ success: true }), { headers: jsonCorsHeaders });
        }

        if (method === 'DELETE') {
          const uid = url.searchParams.get('unique_id') || url.searchParams.get('uniqueId');
          const id = url.searchParams.get('id');
          await env.DB.prepare(`DELETE FROM "Inventory" WHERE unique_id = ? OR id = ?`).bind(uid, id).run();
          return new Response(JSON.stringify({ success: true }), { headers: jsonCorsHeaders });
        }
      }

      // -------------------------------------------------------------
      // 8. YOGI MANAGEMENT: /api/yogi
      // -------------------------------------------------------------
      if (pathname.startsWith('/api/yogi')) {
        if (method === 'PUT' && pathname.endsWith('/checkout')) {
          const b = await request.json();
          const uid = b.unique_id || b.uniqueId;
          const end_date = b.end_date || new Date().toISOString().split('T')[0];
          await env.DB.prepare(`UPDATE "Permanent Yogi" SET end_date = ?, updated_at = datetime('now') WHERE unique_id = ? OR id = ?`).bind(end_date, uid, b.id || null).run();
          await env.DB.prepare(`UPDATE "Camp Yogi" SET end_date = ?, updated_at = datetime('now') WHERE unique_id = ? OR id = ?`).bind(end_date, uid, b.id || null).run();
          return new Response(JSON.stringify({ success: true }), { headers: jsonCorsHeaders });
        }

        if (method === 'PUT' && pathname.endsWith('/reactivate')) {
          const b = await request.json();
          const uid = b.unique_id || b.uniqueId;
          await env.DB.prepare(`UPDATE "Permanent Yogi" SET end_date = '', updated_at = datetime('now') WHERE unique_id = ? OR id = ?`).bind(uid, b.id || null).run();
          await env.DB.prepare(`UPDATE "Camp Yogi" SET end_date = '', updated_at = datetime('now') WHERE unique_id = ? OR id = ?`).bind(uid, b.id || null).run();
          return new Response(JSON.stringify({ success: true }), { headers: jsonCorsHeaders });
        }

        const rawSheet = url.searchParams.get('sheet') || '12Yogi';
        const tbl = resolveYogiTable(rawSheet);

        if (method === 'GET') {
          const { results } = await env.DB.prepare(`SELECT * FROM "${tbl}" ORDER BY start_date ASC, id ASC`).all();
          let monks = 0, nuns = 0, males = 0, females = 0, active = 0, inactive = 0;
          const formatted = (results || []).map((row, idx) => {
            const isActive = !row.end_date || row.end_date.trim() === '' || row.end_date.trim() === '-';
            const name = (row.name || '').trim(), type = (row.yogi_type || '').trim(), gender = (row.gender || 'ကျား').trim();
            if (isActive) {
              active++;
              if (name.includes('ဦး') || name.includes('အရှင်') || name.includes('ဆရာတော်') || type.includes('ရဟန်း') || type.includes('သံဃာ') || name.includes('ကိုရင်') || type.includes('ကိုရင်')) monks++;
              else if (name.includes('ဒေါ်လေး') || name.includes('ဆရာလေး') || type.includes('သီလရှင်')) nuns++;
              else if (gender === 'မ') females++;
              else males++;
            } else inactive++;
            const uid = row.unique_id || `YOGI-${row.id}`;
            return {
              id: row.id, no: row.no || (idx + 1), uniqueId: uid, unique_id: uid, sheet_type: rawSheet,
              start_date: row.start_date || '', end_date: row.end_date || '', yogi_type: row.yogi_type || '', category: row.yogi_type || 'လူပုဂ္ဂိုလ်',
              name: row.name, father_name: row.father_name || '', nrc: row.nrc || '', full_nrc: row.nrc || '', dob: row.dob || '', age: row.age || 0,
              gender: row.gender || 'ကျား', yogi_phone: row.yogi_phone || '', phone: row.yogi_phone || '', home_phone: row.home_phone || '', address: row.address || '',
              status: isActive ? 'Active' : 'Inactive', book_name: tbl
            };
          });
          return new Response(JSON.stringify({
            success: true, sheet: rawSheet, book: tbl, data: formatted,
            kpis: { totalMonks: monks, totalNuns: nuns, totalMales: males, totalFemales: females, totalActiveYogis: active, totalInactiveYogis: inactive, totalCount: results.length }
          }), { headers: jsonCorsHeaders });
        }

        if (method === 'POST') {
          const b = await request.json();
          const targetTbl = resolveYogiTable(b.sheet_type || b.sheet || rawSheet);
          const uid = b.unique_id || b.uniqueId || `YOGI-${crypto.randomUUID()}`;
          await env.DB.prepare(`INSERT INTO "${targetTbl}" (start_date, end_date, yogi_type, name, father_name, nrc, dob, age, gender, yogi_phone, home_phone, address, unique_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(b.start_date || new Date().toISOString().split('T')[0], b.end_date || '', b.yogi_type || b.category || (targetTbl === 'Camp Yogi' ? 'စခန်းဝင်' : 'အမြဲနေ'), (b.name || '').trim(), b.father_name || '', b.nrc || b.full_nrc || '', b.dob || '', parseInt(b.age) || 0, b.gender || 'ကျား', b.yogi_phone || b.phone || '', b.home_phone || '', b.address || '', uid).run();
          return new Response(JSON.stringify({ success: true, unique_id: uid }), { headers: jsonCorsHeaders });
        }

        if (method === 'PUT') {
          const b = await request.json();
          const targetTbl = resolveYogiTable(b.sheet_type || b.sheet || rawSheet);
          const uid = b.unique_id || b.uniqueId;
          await env.DB.prepare(`UPDATE "${targetTbl}" SET start_date = ?, end_date = ?, yogi_type = ?, name = ?, father_name = ?, nrc = ?, dob = ?, age = ?, gender = ?, yogi_phone = ?, home_phone = ?, address = ?, updated_at = datetime('now') WHERE unique_id = ? OR id = ?`).bind(b.start_date, b.end_date || '', b.yogi_type || b.category, b.name, b.father_name || '', b.nrc || b.full_nrc || '', b.dob || '', parseInt(b.age) || 0, b.gender || 'ကျား', b.yogi_phone || b.phone || '', b.home_phone || '', b.address || '', uid, b.id || null).run();
          return new Response(JSON.stringify({ success: true }), { headers: jsonCorsHeaders });
        }

        if (method === 'DELETE') {
          const uid = url.searchParams.get('unique_id') || url.searchParams.get('uniqueId');
          const id = url.searchParams.get('id');
          await env.DB.prepare(`DELETE FROM "Permanent Yogi" WHERE unique_id = ? OR id = ?`).bind(uid, id).run();
          await env.DB.prepare(`DELETE FROM "Camp Yogi" WHERE unique_id = ? OR id = ?`).bind(uid, id).run();
          return new Response(JSON.stringify({ success: true }), { headers: jsonCorsHeaders });
        }
      }

      // -------------------------------------------------------------
      // 9. ANNUAL REPORTS: /api/report
      // -------------------------------------------------------------
      if (pathname === '/api/report' && method === 'GET') {
        const rawSheet = url.searchParams.get('sheet') || '4GB';
        const targetTable = TABLE_MAP[rawSheet.trim()] || '1General Book';
        const year = url.searchParams.get('year') || new Date().getFullYear().toString();

        const PREDEFINED_INCOME = [
          { category: 'စာရင်းဖွင့်', subcategory: 'စာရင်းဖွင့်လက်ကျန်', keywords: ['စာရင်းဖွင့်'] },
          { category: 'ဆွမ်းအလှူ', subcategory: 'အရုဏ်ဆွမ်း', keywords: ['အရုဏ်'] },
          { category: 'ဆွမ်းအလှူ', subcategory: 'နေ့ဆွမ်း', keywords: ['နေ့ဆွမ်း'] },
          { category: 'ဆွမ်းအလှူ', subcategory: 'တနေ့တာဆွမ်း', keywords: ['တနေ့တာ', 'တစ်နေ့တာ'] },
          { category: 'အထွေထွေ', subcategory: 'လမ်းအလှူ', keywords: ['လမ်းအလှူ', 'လမ်း'] },
          { category: 'အထွေထွေ', subcategory: 'အခြားအလှူ', keywords: ['အခြားအလှူ', 'အခြား'] }
        ];

        const PREDEFINED_EXPENSE = [
          { category: 'ဆွမ်းစရိတ်ကုန်ကျခြင်း', subcategory: 'မီးဖိုချောင်အသုံးစရိတ်', keywords: ['မီးဖို'] },
          { category: 'ဆွမ်းစရိတ်ကုန်ကျခြင်း', subcategory: 'သင်္ကန်းတရားစခန်း အသုံးစရိတ်', keywords: ['သင်္ကန်း', 'တရားစခန်း'] },
          { category: 'အုပ်ချုပ်မှုအသုံးစရိတ်', subcategory: 'ကျောင်းပစ္စည်းဝယ်ယူခြင်း', keywords: ['ကျောင်းပစ္စည်း', 'ပစ္စည်းဝယ်'] },
          { category: 'အုပ်ချုပ်မှုအသုံးစရိတ်', subcategory: 'ဆ/ဥ ပြုပြင်စရိတ်', keywords: ['ဆ/ဥ', 'ပြုပြင်'] },
          { category: 'အုပ်ချုပ်မှုအသုံးစရိတ်', subcategory: 'အထွေထွေအသုံးစရိတ်', keywords: ['အထွေထွေအသုံး', 'အုပ်ချုပ်မှု'] },
          { category: 'ယာဉ်အုပ်စုအသုံးစရိတ်', subcategory: 'ဆီ/ပြုပြင်/ယာဉ်မောင်း/အခြား', keywords: ['ယာဉ်', 'ဆီ', 'ကား'] }
        ];

        const { results } = await env.DB.prepare(`SELECT title, sub_title, date, CAST(strftime('%m', date) AS INTEGER) as month_num, COALESCE(income, 0) as income, COALESCE(expense, 0) as expense FROM "${targetTable}" WHERE strftime('%Y', date) = ? ORDER BY date ASC`).bind(year).all();

        const incRows = PREDEFINED_INCOME.map((s, i) => ({ srNo: i + 1, type: 'ဝင်ငွေ', category: s.category, subcategory: s.subcategory, keywords: s.keywords, months: Array(12).fill(0), total: 0 }));
        const expRows = PREDEFINED_EXPENSE.map((s, i) => ({ srNo: i + 1, type: 'ထွက်ငွေ', category: s.category, subcategory: s.subcategory, keywords: s.keywords, months: Array(12).fill(0), total: 0 }));
        const dynInc = {}, dynExp = {};

        (results || []).forEach(r => {
          const m = (parseInt(r.month_num) || 1) - 1;
          if (m < 0 || m > 11) return;
          const inc = parseFloat(r.income) || 0, exp = parseFloat(r.expense) || 0;
          const t = String(r.title || '').trim(), st = String(r.sub_title || '').trim(), txt = `${t} ${st}`;

          if (inc > 0) {
            let matched = incRows.find(x => (x.category === t && x.subcategory === st) || x.keywords.some(k => txt.includes(k)));
            if (matched) { matched.months[m] += inc; matched.total += inc; }
            else {
              const k = `${t || 'အခြားဝင်ငွေ'}_${st || 'အထွေထွေ'}`;
              if (!dynInc[k]) dynInc[k] = { srNo: 0, type: 'ဝင်ငွေ', category: t || 'အခြားဝင်ငွေ', subcategory: st || 'အထွေထွေ', months: Array(12).fill(0), total: 0 };
              dynInc[k].months[m] += inc; dynInc[k].total += inc;
            }
          }

          if (exp > 0) {
            let matched = expRows.find(x => (x.category === t && x.subcategory === st) || x.keywords.some(k => txt.includes(k)));
            if (matched) { matched.months[m] += exp; matched.total += exp; }
            else {
              const k = `${t || 'အခြားထွက်ငွေ'}_${st || 'အထွေထွေ'}`;
              if (!dynExp[k]) dynExp[k] = { srNo: 0, type: 'ထွက်ငွေ', category: t || 'အခြားထွက်ငွေ', subcategory: st || 'အထွေထွေ', months: Array(12).fill(0), total: 0 };
              dynExp[k].months[m] += exp; dynExp[k].total += exp;
            }
          }
        });

        Object.values(dynInc).forEach(x => { x.srNo = incRows.length + 1; incRows.push(x); });
        Object.values(dynExp).forEach(x => { x.srNo = expRows.length + 1; expRows.push(x); });

        const incomeTotals = Array(12).fill(0), expenseTotals = Array(12).fill(0), balanceTotals = Array(12).fill(0);
        let grandIncomeTotal = 0, grandExpenseTotal = 0;

        incRows.forEach(r => { delete r.keywords; r.months.forEach((amt, i) => incomeTotals[i] += amt); grandIncomeTotal += r.total; });
        expRows.forEach(r => { delete r.keywords; r.months.forEach((amt, i) => expenseTotals[i] += amt); grandExpenseTotal += r.total; });
        for (let i = 0; i < 12; i++) balanceTotals[i] = incomeTotals[i] - expenseTotals[i];

        return new Response(JSON.stringify({
          success: true, sheet: rawSheet, book: targetTable, year,
          data: { incomeRows: incRows, incomeTotals, grandIncomeTotal, expenseRows: expRows, expenseTotals, grandExpenseTotal, balanceTotals, grandNetBalance: (grandIncomeTotal - grandExpenseTotal) }
        }), { headers: jsonCorsHeaders });
      }

      return new Response(JSON.stringify({ success: false, error: 'Endpoint not found' }), { status: 404, headers: jsonCorsHeaders });

    } catch (err) {
      console.error('[Worker Error]:', err);
      return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: jsonCorsHeaders });
    }
  }
};
