// ===================================================================
// cashbook-api/handlers-books.js
// Cloudflare Worker Backend Handler for Cashbooks (1CB ~ 10GB) & Inventory (11Inv)
// Handles D1 Database CRUD, Running Balances, and Home Dashboard Summaries
// ===================================================================

export async function handleBookRequests(request, env, pathname) {
  const url = new URL(request.url);
  const method = request.method;

  // 1. GET /api/entries - Fetch Cashbook/Bank Ledger Entries & KPIs
  if (method === 'GET' && pathname === '/api/entries') {
    const sheetName = url.searchParams.get('sheet') || '1CB';

    const sql = `
      SELECT * FROM cashbook_entries 
      WHERE sheet_name = ? 
      ORDER BY id ASC
    `;
    const { results } = await env.DB.prepare(sql).bind(sheetName).all();

    // Calculate Totals & Running Balance
    let totalIncome = 0;
    let totalExpense = 0;
    let runningBalance = 0;

    const formattedData = (results || []).map((row) => {
      const inc = parseFloat(row.income) || 0;
      const exp = parseFloat(row.expense) || 0;
      totalIncome += inc;
      totalExpense += exp;
      runningBalance += (inc - exp);

      return {
        ...row,
        balance: runningBalance
      };
    });

    return jsonResponse({
      success: true,
      data: formattedData,
      kpis: {
        totalIncome,
        totalExpense,
        balance: runningBalance,
        count: formattedData.length
      }
    });
  }

  // 2. POST /api/entries - Add New Cashbook Entry
  if (method === 'POST' && pathname === '/api/entries') {
    const body = await request.json();
    const {
      uniqueId,
      sheet_name,
      entry_date,
      category,
      subcategory,
      voucher_no = '',
      description = '',
      receiver = '',
      income = 0,
      expense = 0,
      month_year = '',
      book_name = ''
    } = body;

    if (!uniqueId || !sheet_name || !entry_date || !category) {
      return jsonResponse({ success: false, error: 'လိုအပ်သော အချက်အလက်များ မပြည့်စုံပါ' }, 400);
    }

    const insertSql = `
      INSERT INTO cashbook_entries (
        uniqueId, sheet_name, entry_date, category, subcategory, voucher_no,
        description, receiver, income, expense, month_year, book_name
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await env.DB.prepare(insertSql).bind(
      uniqueId, sheet_name, entry_date, category, subcategory || '', voucher_no,
      description, receiver, parseFloat(income) || 0, parseFloat(expense) || 0,
      month_year, book_name
    ).run();

    return jsonResponse({ success: true, message: 'ငွေစာရင်း အသစ်ထည့်သွင်းပြီးပါပြီ' });
  }

  // 3. PUT /api/entries - Update Cashbook Entry
  if (method === 'PUT' && pathname === '/api/entries') {
    const body = await request.json();
    const {
      uniqueId,
      entry_date,
      category,
      subcategory,
      voucher_no,
      description,
      receiver,
      income,
      expense,
      month_year,
      book_name
    } = body;

    if (!uniqueId) {
      return jsonResponse({ success: false, error: 'uniqueId လိုအပ်ပါသည်' }, 400);
    }

    const updateSql = `
      UPDATE cashbook_entries 
      SET entry_date = ?, category = ?, subcategory = ?, voucher_no = ?,
          description = ?, receiver = ?, income = ?, expense = ?,
          month_year = ?, book_name = ?
      WHERE uniqueId = ?
    `;

    await env.DB.prepare(updateSql).bind(
      entry_date, category, subcategory || '', voucher_no || '',
      description || '', receiver || '', parseFloat(income) || 0, parseFloat(expense) || 0,
      month_year || '', book_name || '', uniqueId
    ).run();

    return jsonResponse({ success: true, message: 'ငွေစာရင်း ပြင်ဆင်ပြီးပါပြီ' });
  }

  // 4. DELETE /api/entries - Delete Cashbook Entry
  if (method === 'DELETE' && pathname === '/api/entries') {
    const uniqueId = url.searchParams.get('uniqueId');

    if (!uniqueId) {
      return jsonResponse({ success: false, error: 'uniqueId လိုအပ်ပါသည်' }, 400);
    }

    await env.DB.prepare(`DELETE FROM cashbook_entries WHERE uniqueId = ?`).bind(uniqueId).run();

    return jsonResponse({ success: true, message: 'ငွေစာရင်း ပယ်ဖျက်ပြီးပါပြီ' });
  }

  // 5. GET /api/inventory - Fetch Inventory Entries (11Inv)
  if (method === 'GET' && pathname === '/api/inventory') {
    const sql = `SELECT * FROM inventory_entries ORDER BY id ASC`;
    const { results } = await env.DB.prepare(sql).all();

    // Calculate Location KPIs
    let kitchenCount = 0;
    let dhammaHallCount = 0;
    let simCount = 0;
    let storeCount = 0;

    (results || []).forEach((row) => {
      const loc = (row.location || '').trim();
      const qty = parseInt(row.qty) || 0;
      if (loc.includes('မီးဖိုဆောင်')) kitchenCount += qty;
      else if (loc.includes('ဓမ္မာရုံ')) dhammaHallCount += qty;
      else if (loc.includes('သိမ်')) simCount += qty;
      else if (loc.includes('စတို')) storeCount += qty;
    });

    return jsonResponse({
      success: true,
      data: results || [],
      kpis: {
        kitchen: kitchenCount,
        dhammaHall: dhammaHallCount,
        sim: simCount,
        store: storeCount,
        totalItems: (results || []).length
      }
    });
  }

  // 6. POST /api/inventory - Add Inventory Entry
  if (method === 'POST' && pathname === '/api/inventory') {
    const body = await request.json();
    const {
      uniqueId,
      entry_date,
      location,
      category,
      unit,
      qty,
      item_desc,
      note = '',
      month_year = '',
      book_name = 'ပစ္စည်းစာရင်း'
    } = body;

    const insertSql = `
      INSERT INTO inventory_entries (
        uniqueId, entry_date, location, category, unit, qty, item_desc, note, month_year, book_name
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await env.DB.prepare(insertSql).bind(
      uniqueId, entry_date, location, category, unit, parseInt(qty) || 0,
      item_desc, note, month_year, book_name
    ).run();

    return jsonResponse({ success: true, message: 'ပစ္စည်းစာရင်း အသစ်ထည့်သွင်းပြီးပါပြီ' });
  }

  // 7. PUT /api/inventory - Edit Inventory Entry
  if (method === 'PUT' && pathname === '/api/inventory') {
    const body = await request.json();
    const {
      uniqueId,
      entry_date,
      location,
      category,
      unit,
      qty,
      item_desc,
      note
    } = body;

    const updateSql = `
      UPDATE inventory_entries 
      SET entry_date = ?, location = ?, category = ?, unit = ?, qty = ?, item_desc = ?, note = ?
      WHERE uniqueId = ?
    `;

    await env.DB.prepare(updateSql).bind(
      entry_date, location, category, unit, parseInt(qty) || 0, item_desc, note || '', uniqueId
    ).run();

    return jsonResponse({ success: true, message: 'ပစ္စည်းစာရင်း ပြင်ဆင်ပြီးပါပြီ' });
  }

  // 8. DELETE /api/inventory - Delete Inventory Entry
  if (method === 'DELETE' && pathname === '/api/inventory') {
    const uniqueId = url.searchParams.get('uniqueId');
    await env.DB.prepare(`DELETE FROM inventory_entries WHERE uniqueId = ?`).bind(uniqueId).run();
    return jsonResponse({ success: true, message: 'ပစ္စည်းစာရင်း ပယ်ဖျက်ပြီးပါပြီ' });
  }

  // 9. GET /api/home-summary - Home Dashboard Overview Aggregation
  if (method === 'GET' && pathname === '/api/home-summary') {
    const allEntriesSql = `SELECT sheet_name, income, expense FROM cashbook_entries`;
    const { results } = await env.DB.prepare(allEntriesSql).all();

    const sheetBalances = {};
    let grandTotalFund = 0;
    let totalBankFund = 0;
    let totalCashFund = 0;
    let totalCount = (results || []).length;

    (results || []).forEach((row) => {
      const sName = row.sheet_name;
      if (!sheetBalances[sName]) sheetBalances[sName] = 0;
      const inc = parseFloat(row.income) || 0;
      const exp = parseFloat(row.expense) || 0;
      sheetBalances[sName] += (inc - exp);
    });

    Object.keys(sheetBalances).forEach((sName) => {
      const bal = sheetBalances[sName];
      grandTotalFund += bal;
      if (['1CB', '2CB', '3CB'].includes(sName)) {
        totalBankFund += bal;
      } else {
        totalCashFund += bal;
      }
    });

    return jsonResponse({
      success: true,
      kpis: {
        totalFund: grandTotalFund,
        totalBank: totalBankFund,
        totalCash: totalCashFund,
        totalCount
      },
      sheetBalances
    });
  }

  return jsonResponse({ success: false, error: 'API Route ရှာမတွေ့ပါ' }, 404);
}

// Helper JSON Response Function
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}