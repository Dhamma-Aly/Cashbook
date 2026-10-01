// ===================================================================
// cashbook-api/handlers-reports.js
// Handles Annual & Summary Expense Matrix Report for 4GB (1General Book)
// Computes 12-Month Matrix for Income, Expense & Net Balance
// ===================================================================

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
  '10GB': '7Other Book'
};

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
    const rawSheet = url.searchParams.get('sheet') || '4GB';
    const tableName = TABLE_MAP[rawSheet.trim()] || '1General Book';
    const year = url.searchParams.get('year') || new Date().getFullYear().toString();
    const mode = url.searchParams.get('mode') || 'Annual'; // 'Annual' or 'Summary'

    // -----------------------------------------------------------------
    // 1. Standard 4GB Defined Structure (ဇယားကွက် စံခေါင်းစဉ်များ)
    // -----------------------------------------------------------------
    const PREDEFINED_INCOME = [
      { category: 'စာရင်းဖွင့်', subcategory: 'စာရင်းဖွင့်လက်ကျန်', keywords: ['စာရင်းဖွင့်'] },
      { category: 'ဆွမ်းအလှူ', subcategory: 'အရုဏ်ဆွမ်း', keywords: ['အရုဏ်'] },
      { category: 'ဆွမ်းအလှူ', subcategory: 'နေ့ဆွမ်း', keywords: ['နေ့ဆွမ်း'] },
      { category: 'ဆွမ်းအလှူ', subcategory: 'တနေ့တာဆွမ်း', keywords: ['တနေ့တာ', 'တစ်နေ့တာ'] },
      { category: 'အထွေထွေ', subcategory: 'လမ်းအလှူ', keywords: ['လမ်းအလှူ', 'လမ်း'] },
      { category: 'အထွေထွေ', subcategory: 'အခြားအလှူ', keywords: ['အခြားအလှူ', 'အခြား'] }
    ];

    const PREDEFINED_EXPENSE = [
      { category: 'ဆွမ်းစရိတ်ကုန်ကျခြင်း', subcategory: 'မီးဖိုချောင်အသုံးစရိတ်', keywords: ['မီးဖို', 'မီးဖိုချောင်'] },
      { category: 'ဆွမ်းစရိတ်ကုန်ကျခြင်း', subcategory: 'သင်္ကန်းတရားစခန်း အသုံးစရိတ်', keywords: ['သင်္ကန်း', 'တရားစခန်း'] },
      { category: 'အုပ်ချုပ်မှုအသုံးစရိတ်', subcategory: 'ကျောင်းပစ္စည်းဝယ်ယူခြင်း', keywords: ['ကျောင်းပစ္စည်း', 'ပစ္စည်းဝယ်'] },
      { category: 'အုပ်ချုပ်မှုအသုံးစရိတ်', subcategory: 'ဆ/ဥ ပြုပြင်စရိတ်', keywords: ['ဆ/ဥ', 'ပြုပြင်'] },
      { category: 'အုပ်ချုပ်မှုအသုံးစရိတ်', subcategory: 'အထွေထွေအသုံးစရိတ်', keywords: ['အုပ်ချုပ်မှု', 'အထွေထွေအသုံး'] },
      { category: 'ယာဉ်အုပ်စုအသုံးစရိတ်', subcategory: 'ဆီ/ပြုပြင်/ယာဉ်မောင်း/အခြား', keywords: ['ယာဉ်', 'ဆီ', 'ကား'] }
    ];

    // -----------------------------------------------------------------
    // 2. Query Transactions from Target D1 Table
    // -----------------------------------------------------------------
    let sql = `
      SELECT 
        title,
        sub_title,
        date,
        CAST(strftime('%m', date) AS INTEGER) as month_num,
        COALESCE(income, 0) as income,
        COALESCE(expense, 0) as expense
      FROM "${tableName}"
      WHERE 1=1
    `;
    const queryParams = [];

    if (mode === 'Annual') {
      sql += ` AND strftime('%Y', date) = ?`;
      queryParams.push(year);
    }

    sql += ` ORDER BY date ASC`;

    const { results } = await env.DB.prepare(sql).bind(...queryParams).all();

    // -----------------------------------------------------------------
    // 3. Matrix Aggregation Engine (12-Month Arrays)
    // -----------------------------------------------------------------
    const incomeDataRows = PREDEFINED_INCOME.map((spec, idx) => ({
      srNo: idx + 1,
      type: 'ဝင်ငွေ',
      category: spec.category,
      subcategory: spec.subcategory,
      keywords: spec.keywords,
      months: Array(12).fill(0),
      total: 0
    }));

    const expenseDataRows = PREDEFINED_EXPENSE.map((spec, idx) => ({
      srNo: idx + 1,
      type: 'ထွက်ငွေ',
      category: spec.category,
      subcategory: spec.subcategory,
      keywords: spec.keywords,
      months: Array(12).fill(0),
      total: 0
    }));

    const dynamicOtherIncome = {};
    const dynamicOtherExpense = {};

    (results || []).forEach(row => {
      const mIdx = (parseInt(row.month_num) || 1) - 1; // 0 to 11
      if (mIdx < 0 || mIdx > 11) return;

      const inc = parseFloat(row.income) || 0;
      const exp = parseFloat(row.expense) || 0;
      const title = String(row.title || '').trim();
      const subTitle = String(row.sub_title || '').trim();
      const fullText = `${title} ${subTitle}`;

      // ဝင်ငွေ ထည့်သွင်းခြင်း
      if (inc > 0) {
        let matched = incomeDataRows.find(spec => 
          (spec.category === title && spec.subcategory === subTitle) ||
          spec.keywords.some(kw => fullText.includes(kw))
        );

        if (matched) {
          matched.months[mIdx] += inc;
          matched.total += inc;
        } else {
          const key = `${title || 'အခြားဝင်ငွေ'}_${subTitle || 'အထွေထွေ'}`;
          if (!dynamicOtherIncome[key]) {
            dynamicOtherIncome[key] = {
              srNo: 0,
              type: 'ဝင်ငွေ',
              category: title || 'အခြားဝင်ငွေ',
              subcategory: subTitle || 'အထွေထွေ',
              months: Array(12).fill(0),
              total: 0
            };
          }
          dynamicOtherIncome[key].months[mIdx] += inc;
          dynamicOtherIncome[key].total += inc;
        }
      }

      // ထွက်ငွေ ထည့်သွင်းခြင်း
      if (exp > 0) {
        let matched = expenseDataRows.find(spec => 
          (spec.category === title && spec.subcategory === subTitle) ||
          spec.keywords.some(kw => fullText.includes(kw))
        );

        if (matched) {
          matched.months[mIdx] += exp;
          matched.total += exp;
        } else {
          const key = `${title || 'အခြားထွက်ငွေ'}_${subTitle || 'အထွေထွေ'}`;
          if (!dynamicOtherExpense[key]) {
            dynamicOtherExpense[key] = {
              srNo: 0,
              type: 'ထွက်ငွေ',
              category: title || 'အခြားထွက်ငွေ',
              subcategory: subTitle || 'အထွေထွေ',
              months: Array(12).fill(0),
              total: 0
            };
          }
          dynamicOtherExpense[key].months[mIdx] += exp;
          dynamicOtherExpense[key].total += exp;
        }
      }
    });

    // အပိုဝင်ငွေ/ထွက်ငွေများကို စာရင်းထဲ ပေါင်းထည့်ခြင်း
    Object.values(dynamicOtherIncome).forEach(item => {
      item.srNo = incomeDataRows.length + 1;
      incomeDataRows.push(item);
    });

    Object.values(dynamicOtherExpense).forEach(item => {
      item.srNo = expenseDataRows.length + 1;
      expenseDataRows.push(item);
    });

    // -----------------------------------------------------------------
    // 4. Calculate Column Totals & Net Balances
    // -----------------------------------------------------------------
    const incomeTotals = Array(12).fill(0);
    let grandIncomeTotal = 0;
    incomeDataRows.forEach(r => {
      delete r.keywords; // Clean payload
      r.months.forEach((amt, m) => {
        incomeTotals[m] += amt;
      });
      grandIncomeTotal += r.total;
    });

    const expenseTotals = Array(12).fill(0);
    let grandExpenseTotal = 0;
    expenseDataRows.forEach(r => {
      delete r.keywords; // Clean payload
      r.months.forEach((amt, m) => {
        expenseTotals[m] += amt;
      });
      grandExpenseTotal += r.total;
    });

    // Net Balance for each month
    const balanceTotals = Array(12).fill(0);
    for (let m = 0; m < 12; m++) {
      balanceTotals[m] = incomeTotals[m] - expenseTotals[m];
    }
    const grandNetBalance = grandIncomeTotal - grandExpenseTotal;

    return new Response(JSON.stringify({
      success: true,
      sheet: rawSheet,
      book: tableName,
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
