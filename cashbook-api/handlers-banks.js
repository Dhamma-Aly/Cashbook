// ===================================================================
// cashbook-api/handlers-banks.js
// Handles Bank Accounts & Cashbook Fund Entries querying D1 'cashbooks' table
// Includes Double-Entry Auto-Transfer Logic from Books to Target Banks
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

// 🎯 Target Bank Mapping for Book Transfers (စာအုပ်နှင့် ဘဏ် ချိတ်ဆက်မှု မက်ပင်း)
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
  // 1. GET /api/entries?sheet=1CB (စာရင်း အချက်အလက်များ ဖတ်ယူခြင်း)
  // -----------------------------------------------------------------
  if (method === 'GET') {
    let sheet = String(url.searchParams.get('sheet') || '1CB').trim();

    // Safeguard sheet code
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
        const isTransfer = row.type === 'စာရင်းပြောင်း' || row.category === 'စာရင်းပြောင်း';
        const isIncome = row.type === 'ဝင်ငွေ';

        const income = isIncome ? row.amount : 0;
        const expense = (!isIncome || isTransfer) ? row.amount : 0;

        totalIncome += income;
        totalExpense += expense;
        runningBalance += (income - expense);

        return {
          id: row.id,
          uniqueId: `CB-${row.id}`,
          sheet_name: row.sheet_code,
          entry_date: row.date,
          category: isTransfer ? 'စာရင်းပြောင်း' : row.type, // 'ဝင်ငွေ', 'ထွက်ငွေ', 'စာရင်းပြောင်း'
          subcategory: row.category,                        // 'စာရင်းဖွင့်', 'ဆွမ်းအလှူ', etc.
          voucher_no: row.voucher_no || '',
          description: row.description || '',
          receiver: row.receiver || '',
          income: income,
          expense: expense,
          balance: runningBalance,
          month_year: formatMonthYear(row.date),            // Aug-26 Format
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
  // 2. POST /api/entries (စာရင်း အသစ်ထည့်သွင်းခြင်း + စာရင်းပြောင်း Auto Double-Entry)
  // -----------------------------------------------------------------
  if (method === 'POST') {
    try {
      const body = await request.json();

      let sheet_code = String(body.sheet_name || '1CB').trim();
      if (sheet_code === 'true' || sheet_code === 'false' || sheet_code === '1' || sheet_code === '1.0') sheet_code = '1CB';

      const date = body.entry_date || new Date().toISOString().split('T')[0];
      const type = body.category || 'ဝင်ငွေ';          // 'ဝင်ငွေ', 'ထွက်ငွေ', 'စာရင်းပြောင်း'
      const category = body.subcategory || 'စာရင်းဖွင့်'; // ခေါင်းစဉ်
      const subcategory = body.subcategory_detail || body.extraNote || '';
      const voucher_no = body.voucher_no || '';
      const amount = parseFloat(body.income || body.expense || body.amount || 0);
      const receiver = body.receiver || '';
      const description = body.description || '';
      const month_year = formatMonthYear(date);

      const isTransfer = type === 'စာရင်းပြောင်း' || category === 'စာရင်းပြောင်း';

      // 💡 A. Originating Entry Insertion (မူရင်း စာအုပ်ဘက်တွင် ထွက်ငွေအဖြစ် သိမ်းမည်)
      const insertQuery = `
        INSERT INTO cashbooks (sheet_code, date, type, category, subcategory, voucher_no, amount, receiver, description, month_year)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const recordType = isTransfer ? 'ထွက်ငွေ' : type;
      const recordCategory = isTransfer ? 'စာရင်းပြောင်း' : category;

      await env.DB.prepare(insertQuery)
        .bind(sheet_code, date, recordType, recordCategory, subcategory, voucher_no, amount, receiver, description, month_year)
        .run();

      // 💡 B. Double-Entry Auto Deposit to Target Bank if 'စာရင်းပြောင်း'
      const targetBank = TRANSFER_TARGET_BANKS[sheet_code];
      if (isTransfer && targetBank) {
        const bookTitle = SHEET_TITLES[sheet_code] || sheet_code;
        const bankDepositDesc = description || `${bookTitle} မှ စာရင်းပြောင်း အဝင်`;

        await env.DB.prepare(insertQuery)
          .bind(
            targetBank,           // Target Bank Sheet Code (e.g. 2CB or 1CB)
            date,
            'ဝင်ငွေ',             // Target Bank gets Income / ဝင်ငွေ (Debit)
            'ဘဏ်အပ်ငွေ',          // Category
            'လှူဒါန်းငွေ အပ်နှံခြင်း', // Subcategory
            voucher_no,
            amount,
            receiver,
            bankDepositDesc,
            month_year
          ).run();
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

      const query = `
        UPDATE cashbooks 
        SET date = ?, type = ?, category = ?, subcategory = ?, voucher_no = ?, amount = ?, receiver = ?, description = ?, month_year = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;

      await env.DB.prepare(query)
        .bind(date, recordType, recordCategory, subcategory, voucher_no, amount, receiver, description, month_year, id)
        .run();

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
  // 4. DELETE /api/entries?uniqueId=CB-12 (စာရင်း ဖျက်ပစ်ခြင်း)
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

      await env.DB.prepare(`DELETE FROM cashbooks WHERE id = ?`).bind(id).run();

      return new Response(JSON.stringify({ success: true, message: "Entry deleted successfully" }), {
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
