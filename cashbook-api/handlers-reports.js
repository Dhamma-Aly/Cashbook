// ===================================================================
// cashbook-api/handlers-reports.js
// Handles Annual & Summary Expense Matrix Report for 4GB (ကျောင်းရန်ပုံငွေ)
// ===================================================================

export async function handleReportRequests(request, env, corsHeaders) {
  const url = new URL(request.url);
  const method = request.method;

  if (method !== 'GET') {
    return new Response(JSON.stringify({ success: false, error: "Method not supported" }), {
      status: 405,
      headers: corsHeaders
    });
  }

  try {
    const sheet = url.searchParams.get('sheet') || '4GB';
    const year = url.searchParams.get('year') || new Date().getFullYear().toString();
    const mode = url.searchParams.get('mode') || 'Annual'; // 'Annual' or 'Summary'

    // -----------------------------------------------------------------
    // 1. Defined Structure for 4GB Report (Matching User Spreadsheet)
    // -----------------------------------------------------------------
    const INCOME_ROWS = [
      { type: 'ဝင်ငွေ', category: 'စာရင်းဖွင့်', subcategory: 'စာရင်းဖွင့်လက်ကျန်' },
      { type: 'ဝင်ငွေ', category: 'ဆွမ်းအလှူ', subcategory: 'အရုဏ်ဆွမ်း' },
      { type: 'ဝင်ငွေ', category: 'ဆွမ်းအလှူ', subcategory: 'နေ့ဆွမ်း' },
      { type: 'ဝင်ငွေ', category: 'ဆွမ်းအလှူ', subcategory: 'တနေ့တာဆွမ်း' },
      { type: 'ဝင်ငွေ', category: 'အထွေထွေ', subcategory: 'လမ်းအလှူ' },
      { type: 'ဝင်ငွေ', category: 'အထွေထွေ', subcategory: 'အခြားအလှူ' }
    ];

    const EXPENSE_ROWS = [
      { type: 'ထွက်ငွေ', category: 'ဆွမ်းစရိတ်ကုန်ကျခြင်း', subcategory: 'မီးဖိုချောင်အသုံးစရိတ်' },
      { type: 'ထွက်ငွေ', category: 'ဆွမ်းစရိတ်ကုန်ကျခြင်း', subcategory: 'သင်္ကန်းတရားစခန်း အသုံးစရိတ်' },
      { type: 'ထွက်ငွေ', category: 'အုပ်ချုပ်မှုအသုံးစရိတ်', subcategory: 'ကျောင်းပစ္စည်းဝယ်ယူခြင်း' },
      { type: 'ထွက်ငွေ', category: 'အုပ်ချုပ်မှုအသုံးစရိတ်', subcategory: 'ဆ/ဥ ပြုပြင်စရိတ်' },
      { type: 'ထွက်ငွေ', category: 'အုပ်ချုပ်မှုအသုံးစရိတ်', subcategory: 'အထွေထွေအသုံးစရိတ်' },
      { type: 'ထွက်ငွေ', category: 'ယာဉ်အုပ်စုအသုံးစရိတ်', subcategory: 'ဆီ/ပြုပြင်/ယာဉ်မောင်း/အခြား' }
    ];

    // -----------------------------------------------------------------
    // 2. Query D1 Database for 4GB Transactions
    // -----------------------------------------------------------------
    let sql = `
      SELECT 
        type,
        category,
        subcategory,
        strftime('%m', date) as month_num,
        SUM(amount) as total_amount
      FROM cashbooks
      WHERE sheet_code = ?
    `;
    const queryParams = [sheet];

    if (mode === 'Annual') {
      sql += ` AND strftime('%Y', date) = ?`;
      queryParams.push(year);
    }

    sql += ` GROUP BY type, category, subcategory, month_num`;

    const { results } = await env.DB.prepare(sql).bind(...queryParams).all();

    // Map month totals: key = `${type}_${category}_${subcategory}_${monthNum}`
    const dataMap = {};
    (results || []).forEach(row => {
      const type = String(row.type || '').trim();
      const cat = String(row.category || '').trim();
      const subcat = String(row.subcategory || '').trim();
      const mNum = parseInt(row.month_num) || 0; // 1 to 12
      const amt = parseFloat(row.total_amount) || 0;

      const key = `${type}_${cat}_${subcat}_${mNum}`;
      dataMap[key] = (dataMap[key] || 0) + amt;
    });

    // Helper to build 12-month row array
    const buildRowData = (rowSpec, srNo) => {
      const months = Array(12).fill(0);
      let rowTotal = 0;

      for (let m = 1; m <= 12; m++) {
        const key = `${rowSpec.type}_${rowSpec.category}_${rowSpec.subcategory}_${m}`;
        const val = dataMap[key] || 0;
        months[m - 1] = val;
        rowTotal += val;
      }

      return {
        srNo,
        type: rowSpec.type,
        category: rowSpec.category,
        subcategory: rowSpec.subcategory,
        months,
        total: rowTotal
      };
    };

    // Build Income Rows
    const incomeDataRows = INCOME_ROWS.map((spec, idx) => buildRowData(spec, idx + 1));
    const incomeTotals = Array(12).fill(0);
    let grandIncomeTotal = 0;

    incomeDataRows.forEach(r => {
      r.months.forEach((amt, mIdx) => {
        incomeTotals[mIdx] += amt;
      });
      grandIncomeTotal += r.total;
    });

    // Build Expense Rows
    const expenseDataRows = EXPENSE_ROWS.map((spec, idx) => buildRowData(spec, idx + 1));
    const expenseTotals = Array(12).fill(0);
    let grandExpenseTotal = 0;

    expenseDataRows.forEach(r => {
      r.months.forEach((amt, mIdx) => {
        expenseTotals[mIdx] += amt;
      });
      grandExpenseTotal += r.total;
    });

    // Calculate Net Balance per month
    const balanceTotals = Array(12).fill(0);
    for (let m = 0; m < 12; m++) {
      balanceTotals[m] = incomeTotals[m] - expenseTotals[m];
    }
    const grandNetBalance = grandIncomeTotal - grandExpenseTotal;

    return new Response(JSON.stringify({
      success: true,
      sheet,
      year,
      mode,
      data: {
        incomeRows: incomeDataRows,
        incomeTotals,
        grandIncomeTotal,
        expenseRows: expenseDataRows,
        expenseTotals,
        grandExpenseTotal,
        balanceTotals,
        grandNetBalance
      }
    }), {
      headers: corsHeaders
    });

  } catch (err) {
    console.error("[D1 Report Fetch Error]:", err);
    return new Response(JSON.stringify({
      success: false,
      error: err.message,
      data: null
    }), {
      status: 500,
      headers: corsHeaders
    });
  }
}
