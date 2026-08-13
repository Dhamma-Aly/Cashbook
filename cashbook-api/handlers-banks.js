// ===================================================================
// cashbook-api/handlers-banks.js
// Handles Bank Accounts (1CB, 2CB, 3CB) querying D1 'cashbooks' table
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

export async function handleBankRequests(request, env, corsHeaders) {
  const url = new URL(request.url);
  const method = request.method;

  // -----------------------------------------------------------------
  // 1. GET /api/entries?sheet=1CB
  // -----------------------------------------------------------------
  if (method === 'GET') {
    let sheet = String(url.searchParams.get('sheet') || '1CB').trim();

    // 🛡️ Safeguard: "true", "false", "1", "1.0" ရောက်လာပါက "1CB" သို့ ပြင်ပေးခြင်း
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
        const income = row.type === 'ဝင်ငွေ' ? row.amount : 0;
        const expense = row.type === 'ထွက်ငွေ' ? row.amount : 0;
        totalIncome += income;
        totalExpense += expense;
        runningBalance += (income - expense);

        return {
          id: row.id,
          uniqueId: `BANK-${row.id}`,
          sheet_name: row.sheet_code,
          entry_date: row.date,
          category: row.type,           // 'ဝင်ငွေ' သို့မဟုတ် 'ထွက်ငွေ'
          subcategory: row.category,   // ခေါင်းစဉ် (ဥပမာ- 'စာရင်းဖွင့်')
          voucher_no: row.voucher_no || '',
          description: row.description || '',
          receiver: row.receiver || '',
          income: income,
          expense: expense,
          balance: runningBalance,
          month_year: formatMonthYear(row.date), // 💡 Aug-26 Format
          book_name: row.sheet_code
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
      console.error("[D1 Bank Fetch Error]:", err);
      return new Response(JSON.stringify({ success: false, error: err.message }), {
        status: 500,
        headers: corsHeaders
      });
    }
  }

  // -----------------------------------------------------------------
  // 2. POST /api/entries
  // -----------------------------------------------------------------
  if (method === 'POST') {
    try {
      const body = await request.json();

      let sheet_code = String(body.sheet_name || '1CB').trim();
      if (sheet_code === 'true' || sheet_code === 'false' || sheet_code === '1' || sheet_code === '1.0') sheet_code = '1CB';
      if (sheet_code === '2' || sheet_code === '2.0') sheet_code = '2CB';
      if (sheet_code === '3' || sheet_code === '3.0') sheet_code = '3CB';

      const date = body.entry_date || new Date().toISOString().split('T')[0];
      const type = body.category || 'ဝင်ငွေ';
      const category = body.subcategory || 'စာရင်းဖွင့်';
      const subcategory = body.subcategory_detail || body.extraNote || '';
      const voucher_no = body.voucher_no || '';
      const amount = parseFloat(body.income || body.expense || body.amount || 0);
      const receiver = body.receiver || '';
      const description = body.description || '';
      const month_year = formatMonthYear(date); // 💡 Aug-26 Format

      const query = `
        INSERT INTO cashbooks (sheet_code, date, type, category, subcategory, voucher_no, amount, receiver, description, month_year)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      await env.DB.prepare(query)
        .bind(sheet_code, date, type, category, subcategory, voucher_no, amount, receiver, description, month_year)
        .run();

      return new Response(JSON.stringify({ success: true, message: "Bank entry created successfully" }), {
        headers: corsHeaders
      });

    } catch (err) {
      console.error("[D1 Bank Insert Error]:", err);
      return new Response(JSON.stringify({ success: false, error: err.message }), {
        status: 500,
        headers: corsHeaders
      });
    }
  }

  // -----------------------------------------------------------------
  // 3. PUT /api/entries
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
      const month_year = formatMonthYear(date); // 💡 Aug-26 Format

      const query = `
        UPDATE cashbooks 
        SET date = ?, type = ?, category = ?, subcategory = ?, voucher_no = ?, amount = ?, receiver = ?, description = ?, month_year = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;

      await env.DB.prepare(query)
        .bind(date, type, category, subcategory, voucher_no, amount, receiver, description, month_year, id)
        .run();

      return new Response(JSON.stringify({ success: true, message: "Bank entry updated successfully" }), {
        headers: corsHeaders
      });

    } catch (err) {
      console.error("[D1 Bank Update Error]:", err);
      return new Response(JSON.stringify({ success: false, error: err.message }), {
        status: 500,
        headers: corsHeaders
      });
    }
  }

  // -----------------------------------------------------------------
  // 4. DELETE /api/entries
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

      return new Response(JSON.stringify({ success: true, message: "Bank entry deleted successfully" }), {
        headers: corsHeaders
      });

    } catch (err) {
      console.error("[D1 Bank Delete Error]:", err);
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