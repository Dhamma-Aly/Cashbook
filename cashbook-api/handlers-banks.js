// ===================================================================
// cashbook-api/handlers-banks.js
// Handles 10 Individual Bank & Ledger Tables with Transfers & Running Balance
// ===================================================================

// ၁။ Sheet Code မှ D1 Table Name အတိအကျသို့ ချိတ်ဆက်ပေးသော Mapping
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

  // Table နာမည်အပြည့်အစုံဖြင့် တိုက်ရိုက်ခေါ်ပါကလည်း လက်ခံပေးခြင်း
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

// ၂။ စာအုပ်များမှ ဘဏ်သို့ လွှဲပြောင်းရာတွင် ပို့ဆောင်ရမည့် ပစ်မှတ် ဘဏ်စာရင်းများ
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

// Helper: Format YYYY-MM-DD to MMM-YY (e.g. Mar-26)
function formatMonthYear(dateStr) {
  if (!dateStr) return "-";
  const d = new Date(dateStr.length === 7 ? `${dateStr}-01` : dateStr);
  if (isNaN(d.getTime())) return dateStr;

  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const m = months[d.getMonth()];
  const y = String(d.getFullYear()).slice(-2);
  return `${m}-${y}`;
}

export async function handleBankRequests(request, env, corsHeaders) {
  const url = new URL(request.url);
  const method = request.method;

  // -----------------------------------------------------------------
  // 1. GET /api/entries?sheet=1CB သို့မဟုတ် ?book=1CB Bank (General)
  // -----------------------------------------------------------------
  if (method === 'GET') {
    const rawSheet = url.searchParams.get('sheet') || url.searchParams.get('book') || '1CB';
    const tableName = TABLE_MAP[rawSheet.trim()] || '1CB Bank (General)';

    try {
      // သက်ဆိုင်ရာ Table ထဲမှ စာရင်းများကို ရက်စွဲအလိုက် ဆွဲထုတ်ခြင်း
      const { results } = await env.DB.prepare(
        `SELECT * FROM "${tableName}" ORDER BY date ASC, id ASC`
      ).all();

      let runningBalance = 0;
      let totalIncome = 0;
      let totalExpense = 0;

      const formattedEntries = (results || []).map(row => {
        const income = parseFloat(row.income) || 0;
        const expense = parseFloat(row.expense) || 0;

        totalIncome += income;
        totalExpense += expense;
        runningBalance += (income - expense);

        return {
          id: row.id,
          no: row.no || row.id,
          uniqueId: row.unique_id || `CB-${row.id}`,
          unique_id: row.unique_id || `CB-${row.id}`,
          sheet_name: rawSheet,
          date: row.date,
          entry_date: row.date,
          category: row.title || (income > 0 ? 'ဝင်ငွေ' : 'ထွက်ငွေ'),
          title: row.title || '',
          subcategory: row.sub_title || '-',
          sub_title: row.sub_title || '',
          subcategory_detail: row.sub_title || '',
          voucher_no: row.voucher_no || '',
          description: row.description || '',
          receiver: row.receiver || '',
          income: income,
          expense: expense,
          balance: runningBalance,
          month_year: row.month_year || formatMonthYear(row.date),
          book_name: row.book_name || tableName
        };
      });

      return new Response(JSON.stringify({
        success: true,
        book: tableName,
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
  // 2. POST /api/entries (စာရင်းအသစ် ထည့်သွင်းခြင်းနှင့် စာရင်းပြောင်း စနစ်)
  // -----------------------------------------------------------------
  if (method === 'POST') {
    try {
      const body = await request.json();
      const rawSheet = String(body.sheet_name || body.sheet_code || body.book || '1CB').trim();
      const tableName = TABLE_MAP[rawSheet] || '1CB Bank (General)';

      const date = body.entry_date || body.date || new Date().toISOString().split('T')[0];
      const category = body.category || body.title || 'ဝင်ငွေ';
      const subcategory = body.subcategory || body.sub_title || body.subcategory_detail || '';
      const voucher_no = body.voucher_no || '';
      const receiver = body.receiver || 'User 1';
      let description = body.description || '';
      const month_year = formatMonthYear(date);
      const unique_id = body.unique_id || body.uniqueId || crypto.randomUUID();

      const isTransfer = category === 'စာရင်းပြောင်း' || body.type === 'စာရင်းပြောင်း';
      let income = parseFloat(body.income || 0);
      let expense = parseFloat(body.expense || 0);

      // Amount တစ်ခုတည်း ပို့လာပါက category အလိုက် ဝင်ငွေ/ထွက်ငွေ ခွဲခြင်း
      if (body.amount && !income && !expense) {
        const amt = parseFloat(body.amount);
        if (category === 'ထွက်ငွေ' || isTransfer) expense = amt;
        else income = amt;
      }

      // -------------------------------------------------------------
      // 🌟 အထူးကိစ္စ ၁: ကျောင်းရန်ပုံငွေ (4GB) တွင် User အချင်းချင်း လွှဲပြောင်းမှု
      // -------------------------------------------------------------
      if ((rawSheet === '4GB' || tableName === '1General Book') && isTransfer) {
        const combinedText = `${body.transfer_target || ''} ${subcategory} ${description}`.trim();
        let targetUser = null;
        if (combinedText.includes('User 2') || combinedText.includes('User2')) targetUser = 'User 2';
        else if (combinedText.includes('User 3') || combinedText.includes('User3')) targetUser = 'User 3';
        else if (combinedText.includes('User 1') || combinedText.includes('User1')) targetUser = 'User 1';

        // User အချင်းချင်း လွှဲပြောင်းခြင်း ဖြစ်ပါက (User 1 -> User 2 / 3)
        if (targetUser && targetUser !== receiver) {
          const senderDesc = description || `${targetUser} ထံ စာရင်းပြောင်း ပေးပို့ခြင်း`;
          const recipientDesc = `${receiver} ထံမှ စာရင်းပြောင်း ရရှိခြင်း`;
          const transferAmt = expense || income;

          // ၁။ ပို့သူ (ထွက်ငွေ)
          await env.DB.prepare(`
            INSERT INTO "1General Book" (date, title, sub_title, voucher_no, expense, income, receiver, description, month_year, book_name, unique_id)
            VALUES (?, 'စာရင်းပြောင်း', ?, ?, ?, 0, ?, ?, ?, '1General Book', ?)
          `).bind(date, `${targetUser} သို့ လွှဲပြောင်း`, voucher_no, transferAmt, receiver, senderDesc, month_year, unique_id).run();

          // ၂။ လက်ခံသူ (ဝင်ငွေ)
          await env.DB.prepare(`
            INSERT INTO "1General Book" (date, title, sub_title, voucher_no, income, expense, receiver, description, month_year, book_name, unique_id)
            VALUES (?, 'စာရင်းပြောင်း', ?, ?, ?, 0, ?, ?, ?, '1General Book', ?)
          `).bind(date, `${receiver} ထံမှ လွှဲပြောင်းရရှိ`, voucher_no, transferAmt, targetUser, recipientDesc, month_year, crypto.randomUUID()).run();

          return new Response(JSON.stringify({ 
            success: true, 
            message: `4GB Transfer: ${receiver} -> ${targetUser} created successfully`,
            unique_id
          }), { headers: corsHeaders });
        }

        // 4GB မှ အထွေထွေဘဏ် (1CB) သို့ ဘဏ်အပ်နှံခြင်း ဖြစ်ပါက
        const transferAmt = expense || income;
        const bankDesc = description || `အထွေထွေ ရန်ပုံငွေ (Bank) သို့ ဘဏ်အပ်နှံခြင်း`;
        const bankIncomeDesc = `ကျောင်းရန်ပုံငွေ (4GB) [${receiver}] မှ ဘဏ်အပ်ငွေ ရရှိခြင်း`;

        // 4GB ထွက်ငွေ
        await env.DB.prepare(`
          INSERT INTO "1General Book" (date, title, sub_title, voucher_no, expense, income, receiver, description, month_year, book_name, unique_id)
          VALUES (?, 'စာရင်းပြောင်း', 'ဘဏ်အပ်နှံခြင်း', ?, ?, 0, ?, ?, ?, '1General Book', ?)
        `).bind(date, voucher_no, transferAmt, receiver, bankDesc, month_year, unique_id).run();

        // 1CB Bank ဝင်ငွေ
        await env.DB.prepare(`
          INSERT INTO "1CB Bank (General)" (date, title, sub_title, voucher_no, income, expense, receiver, description, month_year, book_name, unique_id)
          VALUES (?, 'ဘဏ်အပ်ငွေ', 'ဘဏ်အပ်နှံခြင်း', ?, ?, 0, ?, ?, ?, '1CB Bank (General)', ?)
        `).bind(date, voucher_no, transferAmt, receiver, bankIncomeDesc, month_year, crypto.randomUUID()).run();

        return new Response(JSON.stringify({ 
          success: true, 
          message: `4GB Transfer to 1CB Bank successfully recorded`,
          unique_id
        }), { headers: corsHeaders });
      }

      // -------------------------------------------------------------
      // 🌟 အထူးကိစ္စ ၂: အခြား စာအုပ်များမှ 2CB ဘဏ်သို့ စာရင်းပြောင်းခြင်း
      // -------------------------------------------------------------
      const targetBank = TRANSFER_TARGET_BANKS[rawSheet] || TRANSFER_TARGET_BANKS[tableName];
      if (isTransfer && targetBank) {
        const transferAmt = expense || income;
        const depositDesc = description || `${tableName} မှ စာရင်းပြောင်း အဝင်`;

        // လက်ရှိ စာအုပ် ထွက်ငွေ
        await env.DB.prepare(`
          INSERT INTO "${tableName}" (date, title, sub_title, voucher_no, expense, income, receiver, description, month_year, book_name, unique_id)
          VALUES (?, 'စာရင်းပြောင်း', 'ဘဏ်အပ်နှံခြင်း', ?, ?, 0, ?, ?, ?, ?, ?)
        `).bind(date, voucher_no, transferAmt, receiver, description || 'ဘဏ်အပ်နှံခြင်း', month_year, tableName, unique_id).run();

        // ပစ်မှတ် ဘဏ် (2CB) ဝင်ငွေ
        await env.DB.prepare(`
          INSERT INTO "${targetBank}" (date, title, sub_title, voucher_no, income, expense, receiver, description, month_year, book_name, unique_id)
          VALUES (?, 'ဘဏ်အပ်ငွေ', 'လှူဒါန်းငွေ အပ်နှံခြင်း', ?, ?, 0, ?, ?, ?, ?, ?)
        `).bind(date, voucher_no, transferAmt, receiver, depositDesc, month_year, targetBank, crypto.randomUUID()).run();

        return new Response(JSON.stringify({ 
          success: true, 
          message: `${tableName} Transfer to ${targetBank} recorded successfully`,
          unique_id
        }), { headers: corsHeaders });
      }

      // -------------------------------------------------------------
      // 🏛️ ပုံမှန် ဝင်ငွေ/ထွက်ငွေ ထည့်သွင်းခြင်း
      // -------------------------------------------------------------
      await env.DB.prepare(`
        INSERT INTO "${tableName}" 
        (date, title, sub_title, voucher_no, income, expense, receiver, description, month_year, book_name, unique_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        date,
        category,
        subcategory,
        voucher_no,
        income,
        expense,
        receiver,
        description,
        month_year,
        tableName,
        unique_id
      ).run();

      return new Response(JSON.stringify({ 
        success: true, 
        message: "Entry created successfully", 
        unique_id 
      }), { headers: corsHeaders });

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
      const rawSheet = String(body.sheet_name || body.sheet_code || body.book || '1CB').trim();
      const tableName = TABLE_MAP[rawSheet] || '1CB Bank (General)';
      const unique_id = body.unique_id || body.uniqueId;
      const id = body.id;

      if (!unique_id && !id) {
        return new Response(JSON.stringify({ success: false, error: "Missing unique_id or id for update" }), {
          status: 400,
          headers: corsHeaders
        });
      }

      const date = body.entry_date || body.date;
      const title = body.category || body.title;
      const sub_title = body.subcategory || body.sub_title || '';
      const voucher_no = body.voucher_no || '';
      const income = parseFloat(body.income || 0);
      const expense = parseFloat(body.expense || 0);
      const receiver = body.receiver || '';
      const description = body.description || '';
      const month_year = formatMonthYear(date);

      if (unique_id) {
        await env.DB.prepare(`
          UPDATE "${tableName}" 
          SET date = ?, title = ?, sub_title = ?, voucher_no = ?, income = ?, expense = ?, receiver = ?, description = ?, month_year = ?, updated_at = datetime('now')
          WHERE unique_id = ?
        `).bind(date, title, sub_title, voucher_no, income, expense, receiver, description, month_year, unique_id).run();
      } else {
        await env.DB.prepare(`
          UPDATE "${tableName}" 
          SET date = ?, title = ?, sub_title = ?, voucher_no = ?, income = ?, expense = ?, receiver = ?, description = ?, month_year = ?, updated_at = datetime('now')
          WHERE id = ?
        `).bind(date, title, sub_title, voucher_no, income, expense, receiver, description, month_year, id).run();
      }

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
  // 4. DELETE /api/entries?unique_id=UUID သို့မဟုတ် ?id=1
  // -----------------------------------------------------------------
  if (method === 'DELETE') {
    try {
      const rawSheet = url.searchParams.get('sheet') || url.searchParams.get('book') || '1CB';
      const tableName = TABLE_MAP[rawSheet.trim()] || '1CB Bank (General)';

      let unique_id = url.searchParams.get('unique_id') || url.searchParams.get('uniqueId');
      let id = url.searchParams.get('id');

      // Body ဖြင့် ပို့လာပါက စစ်ဆေးခြင်း
      if (!unique_id && !id) {
        try {
          const body = await request.json();
          unique_id = body.unique_id || body.uniqueId;
          id = body.id;
        } catch (_) {}
      }

      if (!unique_id && !id) {
        return new Response(JSON.stringify({ success: false, error: "Missing unique_id or id for deletion" }), {
          status: 400,
          headers: corsHeaders
        });
      }

      if (unique_id) {
        await env.DB.prepare(`DELETE FROM "${tableName}" WHERE unique_id = ?`).bind(unique_id).run();
      } else {
        await env.DB.prepare(`DELETE FROM "${tableName}" WHERE id = ?`).bind(id).run();
      }

      return new Response(JSON.stringify({ 
        success: true, 
        message: "Entry deleted successfully" 
      }), { headers: corsHeaders });

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
