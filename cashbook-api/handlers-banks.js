// ===================================================================
// cashbook-api/handlers-banks.js
// Fixed: 4GB Internal User-to-User Transfer & Subcategory Mapping
// ===================================================================

// Helper: Format YYYY-MM-DD or YYYY-MM to Aug-26, Sep-26, etc.
function formatMonthYear(dateStr) {
  if (!dateStr) return "-";
  const d = new Date(dateStr.length === 7 ? `${dateStr}-01` : dateStr);
  if (isNaN(d.getTime())) return dateStr;

  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const m = months[d.getMonth()];
  const y = String(d.getFullYear()).slice(-2);
  return `${m}-${y}`;
}

// 🎯 Target Bank Mapping for Book Transfers
const TRANSFER_TARGET_BANKS = {
  '4GB': '1CB',
  '5FB': '2CB',
  '8EB': '2CB',
  '9MB': '2CB',
  '10GB': '2CB'
};

const SHEET_TITLES = {
  '1CB': 'အထွေထွေ ရန်ပုံငွေ (Bank)',
  '2CB': 'ဆွမ်းပဒေသာပင် (Bank)',
  '3CB': 'တစ်ဦးတည်းစာရင်း (Bank)',
  '4GB': 'ကျောင်းရန်ပုံငွေ စာအုပ်',
  '5FB': 'ဆွမ်းပဒေသာပင် စာအုပ်',
  '6HB': 'ဓမ္မာရုံငွေစာရင်း စာအုပ်',
  '7PB': 'စေတီငွေစာရင်း စာအုပ်',
  '8EB': 'လျှပ်စစ်ပဒေသာပင် စာအုပ်',
  '9MB': 'ဆေးပဒေသာပင် စာအုပ်',
  '10GB': 'အထွေထွေရန်ပုံငွေစာအုပ်'
};

export async function handleBankRequests(request, env, corsHeaders) {
  const url = new URL(request.url);
  const method = request.method;

  // -----------------------------------------------------------------
  // 1. GET /api/entries?sheet=4GB (Subcategory Mapping Fixed)
  // -----------------------------------------------------------------
  if (method === 'GET') {
    let sheet = String(url.searchParams.get('sheet') || '1CB').trim();

    if (sheet === 'true' || sheet === 'false' || sheet === '1' || sheet === '1.0') sheet = '1CB';
    if (sheet === '2' || sheet === '2.0') sheet = '2CB';
    if (sheet === '3' || sheet === '3.0') sheet = '3CB';

    try {
      const { results } = await env.DB.prepare(
        `SELECT * FROM cashbooks WHERE sheet_code = ? ORDER BY date ASC, id ASC`
      ).bind(sheet).all();

      let runningBalance = 0;
      let totalIncome = 0;
      let totalExpense = 0;

      const formattedEntries = (results || []).map(row => {
        const isTransfer = row.category === 'စာရင်းပြောင်း' || row.type === 'စာရင်းပြောင်း';
        const isIncome = row.type === 'ဝင်ငွေ';

        const income = isIncome ? row.amount : 0;
        const expense = !isIncome ? row.amount : 0;

        totalIncome += income;
        totalExpense += expense;
        runningBalance += (income - expense);

        // 🎯 FIX: စာရင်းပြောင်းဖြစ်ပါက Subcategory နေရာတွင် "User 2 သို့ လွှဲပြောင်း" စသည့် စာသားအမှန်ကို ဖော်ပြပေးမည်
        let subcatDisplay = row.subcategory || row.category || '-';
        if (isTransfer && row.subcategory) {
          subcatDisplay = row.subcategory;
        }

        return {
          id: row.id,
          uniqueId: `CB-${row.id}`,
          sheet_name: row.sheet_code,
          entry_date: row.date,
          category: isTransfer ? 'စာရင်းပြောင်း' : row.type, 
          subcategory: subcatDisplay,                       
          subcategory_detail: row.subcategory || '',
          voucher_no: row.voucher_no || '',
          description: row.description || '',
          receiver: row.receiver || '',
          income: income,
          expense: expense,
          balance: runningBalance,
          linked_id: row.linked_id || null,
          month_year: formatMonthYear(row.date),            
          book_name: SHEET_TITLES[row.sheet_code] || row.sheet_code
        };
      });

      return new Response(JSON.stringify({
        success: true,
        data: formattedEntries,
        kpis: {
          totalIncome,
          totalExpense,
          balance: runningBalance,
          count: results.length
        }
      }), { headers: corsHeaders });

    } catch (err) {
      console.error("[D1 Ledger Fetch Error]:", err);
      return new Response(JSON.stringify({ success: false, error: err.message }), {
        status: 500,
        headers: corsHeaders
      });
    }
  }

  // -----------------------------------------------------------------
  // 2. POST /api/entries (4GB Double-Entry Auto Transfer Fixed)
  // -----------------------------------------------------------------
  if (method === 'POST') {
    try {
      const body = await request.json();

      let sheet_code = String(body.sheet_name || body.sheet_code || '1CB').trim();
      if (sheet_code === 'true' || sheet_code === 'false' || sheet_code === '1' || sheet_code === '1.0') sheet_code = '1CB';

      const date = body.entry_date || new Date().toISOString().split('T')[0];
      const type = body.category || 'ဝင်ငွေ';          
      const category = body.subcategory || 'စာရင်းဖွင့်'; 
      const subcategory = body.subcategory_detail || body.extraNote || '';
      const voucher_no = body.voucher_no || '';
      const amount = parseFloat(body.income || body.expense || body.amount || 0);
      const receiver = body.receiver || 'User 1';
      let   description = body.description || '';
      const month_year = formatMonthYear(date);

      const isTransfer = type === 'စာရင်းပြောင်း' || category === 'စာရင်းပြောင်း';

      // -------------------------------------------------------------
      // 🌟 SPECIAL CASE: ကျောင်းရန်ပုံငွေ စာအုပ် (4GB) ၏ စာရင်းပြောင်း စနစ်
      // -------------------------------------------------------------
      if (sheet_code === '4GB' && isTransfer) {
        // 🎯 FIX: Dropdown ရော Description ထဲမှာပါ ရေးထားသည့် စာသားအားလုံးကို ပေါင်းပြီး Target ရှာဖွေခြင်း
        const combinedText = `${body.transfer_target || ''} ${subcategory || ''} ${body.extraNote || ''} ${description || ''}`.trim();

        let targetUser = null;
        if (combinedText.includes('User 2') || combinedText.includes('User2')) targetUser = 'User 2';
        else if (combinedText.includes('User 3') || combinedText.includes('User3')) targetUser = 'User 3';
        else if (combinedText.includes('User 1') || combinedText.includes('User1')) targetUser = 'User 1';

        // A. အကယ်၍ အခြား User ထံ လွှဲပြောင်းခြင်း ဖြစ်ပါက (User 1 -> User 2 / User 3)
        if (targetUser && targetUser !== receiver) {
          const senderDesc = description || `${targetUser} ထံ စာရင်းပြောင်း ပေးပို့ခြင်း`;
          const recipientDesc = `${receiver} ထံမှ စာရင်းပြောင်း ရရှိခြင်း`;

          // ၁။ Sender Row ထည့်သွင်းခြင်း (User 1 ထွက်ငွေ / Credit)
          const res1 = await env.DB.prepare(`
            INSERT INTO cashbooks (sheet_code, date, type, category, subcategory, voucher_no, amount, receiver, description, month_year)
            VALUES ('4GB', ?, 'ထွက်ငွေ', 'စာရင်းပြောင်း', ?, ?, ?, ?, ?, ?)
          `).bind(date, `${targetUser} သို့ လွှဲပြောင်း`, voucher_no, amount, receiver, senderDesc, month_year).run();

          const row1Id = res1.meta.last_row_id;

          // ၂။ Recipient Row ထည့်သွင်းခြင်း (User 2 ဝင်ငွေ / Debit) - linked_id ဖြင့် တိုက်ရိုက်တွဲမည်
          const res2 = await env.DB.prepare(`
            INSERT INTO cashbooks (sheet_code, date, type, category, subcategory, voucher_no, amount, receiver, description, month_year, linked_id)
            VALUES ('4GB', ?, 'ဝင်ငွေ', 'စာရင်းပြောင်း', ?, ?, ?, ?, ?, ?, ?)
          `).bind(date, `${receiver} ထံမှ လွှဲပြောင်းရရှိ`, voucher_no, amount, targetUser, recipientDesc, month_year, row1Id).run();

          const row2Id = res2.meta.last_row_id;

          // Row 1 တွင်လည်း Row 2 ၏ ID အား linked_id ပြန်ထည့်ခြင်း
          await env.DB.prepare(`UPDATE cashbooks SET linked_id = ? WHERE id = ?`).bind(row2Id, row1Id).run();

          return new Response(JSON.stringify({ 
            success: true, 
            message: `4GB Internal Transfer: ${receiver} -> ${targetUser} created successfully` 
          }), { headers: corsHeaders });
        }

        // B. အကယ်၍ အထွေထွေရန်ပုံငွေ ဘဏ် (1CB) သို့ လွှဲပြောင်းခြင်း ဖြစ်ပါက
        const bankDesc = description || `အထွေထွေ ရန်ပုံငွေ (Bank) သို့ ဘဏ်အပ်နှံခြင်း`;
        const bankIncomeDesc = `ကျောင်းရန်ပုံငွေ (4GB) [${receiver}] မှ ဘဏ်အပ်ငွေ ရရှိခြင်း`;

        // ၁။ 4GB ထွက်ငွေ
        const res1 = await env.DB.prepare(`
          INSERT INTO cashbooks (sheet_code, date, type, category, subcategory, voucher_no, amount, receiver, description, month_year)
          VALUES ('4GB', ?, 'ထွက်ငွေ', 'စာရင်းပြောင်း', 'ဘဏ်အပ်နှံခြင်း', ?, ?, ?, ?, ?)
        `).bind(date, voucher_no, amount, receiver, bankDesc, month_year).run();

        const row1Id = res1.meta.last_row_id;

        // ၂။ 1CB Bank ဝင်ငွေ
        const res2 = await env.DB.prepare(`
          INSERT INTO cashbooks (sheet_code, date, type, category, subcategory, voucher_no, amount, receiver, description, month_year, linked_id)
          VALUES ('1CB', ?, 'ဝင်ငွေ', 'ဘဏ်အပ်ငွေ', 'ဘဏ်အပ်နှံခြင်း', ?, ?, ?, ?, ?, ?)
        `).bind(date, voucher_no, amount, receiver, bankIncomeDesc, month_year, row1Id).run();

        const row2Id = res2.meta.last_row_id;
        await env.DB.prepare(`UPDATE cashbooks SET linked_id = ? WHERE id = ?`).bind(row2Id, row1Id).run();

        return new Response(JSON.stringify({ 
          success: true, 
          message: `4GB Transfer to 1CB Bank successful` 
        }), { headers: corsHeaders });
      }

      // -------------------------------------------------------------
      // 🏛️ STANDARD CASE: အခြား စာအုပ်များ၏ ပုံမှန် ထည့်သွင်းမှု
      // -------------------------------------------------------------
      const recordType = isTransfer ? 'ထွက်ငွေ' : type;
      const recordCategory = isTransfer ? 'စာရင်းပြောင်း' : category;

      const res1 = await env.DB.prepare(`
        INSERT INTO cashbooks (sheet_code, date, type, category, subcategory, voucher_no, amount, receiver, description, month_year)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(sheet_code, date, recordType, recordCategory, subcategory, voucher_no, amount, receiver, description, month_year).run();

      const row1Id = res1.meta.last_row_id;

      // တခြား ပဒေသာပင်စာအုပ်များ (5FB, 8EB, 9MB, 10GB) သည် 2CB ဘဏ်သို့ Auto ဝင်မည်
      const targetBank = TRANSFER_TARGET_BANKS[sheet_code];
      if (isTransfer && targetBank) {
        const bookTitle = SHEET_TITLES[sheet_code] || sheet_code;
        const bankDepositDesc = description || `${bookTitle} မှ စာရင်းပြောင်း အဝင်`;

        const res2 = await env.DB.prepare(`
          INSERT INTO cashbooks (sheet_code, date, type, category, subcategory, voucher_no, amount, receiver, description, month_year, linked_id)
          VALUES (?, ?, 'ဝင်ငွေ', 'ဘဏ်အပ်ငွေ', 'လှူဒါန်းငွေ အပ်နှံခြင်း', ?, ?, ?, ?, ?, ?)
        `).bind(targetBank, date, voucher_no, amount, receiver, bankDepositDesc, month_year, row1Id).run();

        const row2Id = res2.meta.last_row_id;
        await env.DB.prepare(`UPDATE cashbooks SET linked_id = ? WHERE id = ?`).bind(row2Id, row1Id).run();
      }

      return new Response(JSON.stringify({ success: true, message: "Entry created successfully" }), {
        headers: corsHeaders
      });

    } catch (err) {
      console.error("[D1 Ledger Insert Error]:", err);
      return new Response(JSON.stringify({ success: false, error: err.message }), {
        status: 500,
        headers: corsHeaders
      });
    }
  }

  // -----------------------------------------------------------------
  // 3. PUT /api/entries (စာရင်း ပြင်ဆင်ခြင်း)
  // -----------------------------------------------------------------
  if (method === 'PUT') {
    try {
      const body = await request.json();
      const rawId = String(body.uniqueId || body.id || '');
      const id = parseInt(rawId.replace(/^(BANK|BOOK|CB)-/, '')) || parseInt(rawId);

      if (!id) {
        return new Response(JSON.stringify({ success: false, error: "Missing Entry ID for update" }), {
          status: 400,
          headers: corsHeaders
        });
      }

      const date = body.entry_date;
      const type = body.category;
      const category = body.subcategory;
      const subcategory = body.subcategory_detail || body.extraNote || '';
      const voucher_no = body.voucher_no || '';
      const amount = parseFloat(body.income || body.expense || body.amount || 0);
      const receiver = body.receiver || '';
      const description = body.description || '';
      const month_year = formatMonthYear(date);

      const isTransfer = type === 'စာရင်းပြောင်း' || category === 'စာရင်းပြောင်း';
      const recordType = isTransfer ? 'ထွက်ငွေ' : type;
      const recordCategory = isTransfer ? 'စာရင်းပြောင်း' : category;

      await env.DB.prepare(`
        UPDATE cashbooks 
        SET date = ?, type = ?, category = ?, subcategory = ?, voucher_no = ?, amount = ?, receiver = ?, description = ?, month_year = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(date, recordType, recordCategory, subcategory, voucher_no, amount, receiver, description, month_year, id).run();

      return new Response(JSON.stringify({ success: true, message: "Entry updated successfully" }), {
        headers: corsHeaders
      });

    } catch (err) {
      console.error("[D1 Ledger Update Error]:", err);
      return new Response(JSON.stringify({ success: false, error: err.message }), {
        status: 500,
        headers: corsHeaders
      });
    }
  }

  // -----------------------------------------------------------------
  // 4. DELETE /api/entries?uniqueId=CB-12 (ဖျက်ပါက linked_id ပါ တစ်ပြိုင်နက် ပျက်မည်)
  // -----------------------------------------------------------------
  if (method === 'DELETE') {
    try {
      const rawId = String(url.searchParams.get('uniqueId') || '');
      const id = parseInt(rawId.replace(/^(BANK|BOOK|CB)-/, '')) || parseInt(rawId);

      if (!id) {
        return new Response(JSON.stringify({ success: false, error: "Missing Entry ID for deletion" }), {
          status: 400,
          headers: corsHeaders
        });
      }

      const { results } = await env.DB.prepare(
        `SELECT id, linked_id FROM cashbooks WHERE id = ? LIMIT 1`
      ).bind(id).all();

      if (results && results.length > 0) {
        const linkedId = results[0].linked_id;

        await env.DB.prepare(`DELETE FROM cashbooks WHERE id = ?`).bind(id).run();

        if (linkedId) {
          await env.DB.prepare(`DELETE FROM cashbooks WHERE id = ?`).bind(linkedId).run();
        }
      }

      return new Response(JSON.stringify({ 
        success: true, 
        message: "Entry and its linked counterpart deleted successfully" 
      }), {
        headers: corsHeaders
      });

    } catch (err) {
      console.error("[D1 Ledger Delete Error]:", err);
      return new Response(JSON.stringify({ success: false, error: err.message }), {
        status: 500,
        headers: corsHeaders
      });
    }
  }

  return new Response(JSON.stringify({ success: false, error: "Method not supported" }), {
    status: 405,
    headers: corsHeaders
  });
}
