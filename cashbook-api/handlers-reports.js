// ===================================================================
// cashbook-api/handlers-reports.js
// Handles General Fund Summary Report (/api/report) querying D1 'cashbooks'
// ===================================================================

export async function handleReportRequests(request, env, corsHeaders) {
  const method = request.method;

  if (method !== 'GET') {
    return new Response(JSON.stringify({ success: false, error: "Method not supported" }), {
      status: 405,
      headers: corsHeaders
    });
  }

  try {
    const TITLES = {
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

    const ALL_KNOWN_SHEETS = ['1CB', '2CB', '3CB', '4GB', '5FB', '6HB', '7PB', '8EB', '9MB', '10GB'];

    // D1 Database ထဲမှ စာအုပ်တစ်အုပ်ချင်းစီ၏ ဝင်ငွေပေါင်း၊ ထွက်ငွေပေါင်း၊ လက်ကျန်ငွေကို SQL ဖြင့် တွက်ချက်ခြင်း
    const { results } = await env.DB.prepare(`
      SELECT 
        sheet_code,
        SUM(CASE WHEN type = 'ဝင်ငွေ' THEN amount ELSE 0 END) as total_income,
        SUM(CASE WHEN type = 'ထွက်ငွေ' THEN amount ELSE 0 END) as total_expense,
        SUM(CASE WHEN type = 'ဝင်ငွေ' THEN amount ELSE -amount END) as balance
      FROM cashbooks
      GROUP BY sheet_code
    `).all();

    const sheetDataMap = {};
    (results || []).forEach(row => {
      sheetDataMap[row.sheet_code] = {
        income: parseFloat(row.total_income) || 0,
        expense: parseFloat(row.total_expense) || 0,
        balance: parseFloat(row.balance) || 0
      };
    });

    const reportMatrix = [];

    // Row 0: Matrix Header Row
    reportMatrix.push(["စဉ်", "အကြောင်းအရာ / စာအုပ်အမည်", "ဝင်ငွေပေါင်း (MMK)", "ထွက်ငွေပေါင်း (MMK)", "လက်ကျန်ငွေ (MMK)"]);

    let grandIncome = 0;
    let grandExpense = 0;
    let grandBalance = 0;

    // စာအုပ်တစ်အုပ်ချင်းစီ၏ ဒေတာများကို Matrix ထဲသို့ စိစစ်ထည့်သွင်းခြင်း
    ALL_KNOWN_SHEETS.forEach((sheet, idx) => {
      const title = TITLES[sheet] || sheet;
      const data = sheetDataMap[sheet] || { income: 0, expense: 0, balance: 0 };

      grandIncome += data.income;
      grandExpense += data.expense;
      grandBalance += data.balance;

      reportMatrix.push([
        idx + 1,
        title,
        data.income,
        data.expense,
        data.balance
      ]);
    });

    // Last Row: စုစုပေါင်း လက်ကျန်ငွေ Row
    reportMatrix.push([
      "-",
      "စုစုပေါင်း လက်ကျန်ငွေ",
      grandIncome,
      grandExpense,
      grandBalance
    ]);

    return new Response(JSON.stringify({
      success: true,
      data: reportMatrix
    }), {
      headers: corsHeaders
    });

  } catch (err) {
    console.error("[D1 Report Fetch Error]:", err);
    return new Response(JSON.stringify({
      success: false,
      error: err.message,
      data: []
    }), {
      status: 500,
      headers: corsHeaders
    });
  }
}