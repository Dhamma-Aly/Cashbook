// ===================================================================
// cashbook-api/handlers-report.js
// Cloudflare Worker Backend Handler for Fund & Expense Summary Report (14Rep)
// Aggregates cashbook entries across all sheets by Category and Sub-category
// ===================================================================

export async function handleReportRequests(request, env, pathname) {
  const method = request.method;

  // 1. GET /api/report - Aggregate All Ledger Entries for 14Rep Matrix
  if (method === 'GET' && pathname === '/api/report') {
    const sql = `
      SELECT sheet_name, category, subcategory, income, expense 
      FROM cashbook_entries
      ORDER BY category ASC, subcategory ASC
    `;
    const { results } = await env.DB.prepare(sql).all();

    // Grouping Data by Category and Subcategory
    const reportMap = {};

    (results || []).forEach((row) => {
      const cat = row.category || 'အခြား';
      const subCat = row.subcategory || 'အထွေထွေ';
      const sheet = row.sheet_name || 'Unassigned';
      const inc = parseFloat(row.income) || 0;
      const exp = parseFloat(row.expense) || 0;

      const key = `${cat}___${subCat}`;
      if (!reportMap[key]) {
        reportMap[key] = {
          category: cat,
          subCategory: subCat,
          sheets: {},
          totalIncome: 0,
          totalExpense: 0,
          netBalance: 0
        };
      }

      if (!reportMap[key].sheets[sheet]) {
        reportMap[key].sheets[sheet] = { income: 0, expense: 0, balance: 0 };
      }

      reportMap[key].sheets[sheet].income += inc;
      reportMap[key].sheets[sheet].expense += exp;
      reportMap[key].sheets[sheet].balance += (inc - exp);

      reportMap[key].totalIncome += inc;
      reportMap[key].totalExpense += exp;
      reportMap[key].netBalance += (inc - exp);
    });

    const reportData = Object.values(reportMap);

    return jsonResponse({
      success: true,
      data: reportData
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