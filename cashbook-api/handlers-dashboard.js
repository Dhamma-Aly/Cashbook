// ===================================================================
// cashbook-api/handlers-dashboard.js
// Handles Home Dashboard Summary (/api/home-summary) querying D1
// Aggregates 10 Ledger/Bank Tables and 2 Yogi Tables concurrently
// ===================================================================

export async function handleDashboardRequests(request, env, corsHeaders) {
  const method = request.method;

  if (method !== 'GET') {
    return new Response(JSON.stringify({ success: false, error: "Method not supported" }), {
      status: 405,
      headers: corsHeaders
    });
  }

  try {
    const BANK_SHEETS = ['1CB', '2CB', '3CB'];
    const ALL_SHEETS = ['1CB', '2CB', '3CB', '4GB', '5FB', '6HB', '7PB', '8EB', '9MB', '10GB'];

    // -----------------------------------------------------------------
    // 🚀 HIGH-PERFORMANCE CONCURRENT QUERIES (Fund + Yogi Parallel Execution)
    // -----------------------------------------------------------------
    const fundUnionSql = `
      SELECT '1CB' as sheet_code, '' as receiver, COALESCE(SUM(COALESCE(income,0) - COALESCE(expense,0)), 0) as net_amount, COUNT(*) as row_count FROM "1CB Bank (General)"
      UNION ALL
      SELECT '2CB' as sheet_code, '' as receiver, COALESCE(SUM(COALESCE(income,0) - COALESCE(expense,0)), 0) as net_amount, COUNT(*) as row_count FROM "2CB Bank (Meal)"
      UNION ALL
      SELECT '3CB' as sheet_code, '' as receiver, COALESCE(SUM(COALESCE(income,0) - COALESCE(expense,0)), 0) as net_amount, COUNT(*) as row_count FROM "3CB Bank (UZ)"
      UNION ALL
      SELECT '4GB' as sheet_code, COALESCE(receiver, 'User 1') as receiver, COALESCE(SUM(COALESCE(income,0) - COALESCE(expense,0)), 0) as net_amount, COUNT(*) as row_count FROM "1General Book" GROUP BY receiver
      UNION ALL
      SELECT '5FB' as sheet_code, COALESCE(receiver, 'User 1') as receiver, COALESCE(SUM(COALESCE(income,0) - COALESCE(expense,0)), 0) as net_amount, COUNT(*) as row_count FROM "2Meal Book" GROUP BY receiver
      UNION ALL
      SELECT '6HB' as sheet_code, COALESCE(receiver, 'User 1') as receiver, COALESCE(SUM(COALESCE(income,0) - COALESCE(expense,0)), 0) as net_amount, COUNT(*) as row_count FROM "3Hall Book" GROUP BY receiver
      UNION ALL
      SELECT '7PB' as sheet_code, COALESCE(receiver, 'User 1') as receiver, COALESCE(SUM(COALESCE(income,0) - COALESCE(expense,0)), 0) as net_amount, COUNT(*) as row_count FROM "4Pagoda Book" GROUP BY receiver
      UNION ALL
      SELECT '8EB' as sheet_code, COALESCE(receiver, 'User 1') as receiver, COALESCE(SUM(COALESCE(income,0) - COALESCE(expense,0)), 0) as net_amount, COUNT(*) as row_count FROM "5Electronic Book" GROUP BY receiver
      UNION ALL
      SELECT '9MB' as sheet_code, COALESCE(receiver, 'User 1') as receiver, COALESCE(SUM(COALESCE(income,0) - COALESCE(expense,0)), 0) as net_amount, COUNT(*) as row_count FROM "6Medical Book" GROUP BY receiver
      UNION ALL
      SELECT '10GB' as sheet_code, COALESCE(receiver, 'User 1') as receiver, COALESCE(SUM(COALESCE(income,0) - COALESCE(expense,0)), 0) as net_amount, COUNT(*) as row_count FROM "7Other Book" GROUP BY receiver
    `;

    const yogiUnionSql = `
      SELECT '12Yogi' as sheet_type, category, gender, COUNT(*) as cnt
      FROM "Permanent Yogi"
      WHERE status = 'Active'
      GROUP BY category, gender
      UNION ALL
      SELECT '13Yogi' as sheet_type, category, gender, COUNT(*) as cnt
      FROM "Camp Yogi"
      WHERE status = 'Active'
      GROUP BY category, gender
    `;

    // Execute both queries simultaneously
    const [fundRes, yogiRes] = await Promise.all([
      env.DB.prepare(fundUnionSql).all(),
      env.DB.prepare(yogiUnionSql).all()
    ]);

    const fundRows = fundRes.results || [];
    const yogiRows = yogiRes.results || [];

    // -----------------------------------------------------------------
    // 1. FUND SUMMARY COMPUTATION
    // -----------------------------------------------------------------
    const fundSummary = {};
    ALL_SHEETS.forEach(sheet => {
      fundSummary[sheet] = {
        bankBalance: 0,
        user1Balance: 0,
        user2Balance: 0,
        user3Balance: 0,
        totalBalance: 0
      };
    });

    let totalFund = 0;
    let totalBank = 0;
    let totalCash = 0;
    let totalCount = 0;

    fundRows.forEach(row => {
      const sheet = String(row.sheet_code || '').trim();
      const receiver = String(row.receiver || '').trim();
      const amount = parseFloat(row.net_amount) || 0;
      const count = parseInt(row.row_count) || 0;

      totalCount += count;

      if (fundSummary[sheet]) {
        if (BANK_SHEETS.includes(sheet)) {
          fundSummary[sheet].bankBalance += amount;
          totalBank += amount;
        } else {
          // Receiver အလိုက် User 1 / 2 / 3 သို့ ခွဲဝေထည့်သွင်းခြင်း
          if (receiver.includes('User 2') || receiver.includes('User2')) {
            fundSummary[sheet].user2Balance += amount;
          } else if (receiver.includes('User 3') || receiver.includes('User3')) {
            fundSummary[sheet].user3Balance += amount;
          } else {
            // Default receiver to User 1
            fundSummary[sheet].user1Balance += amount;
          }

          totalCash += amount;
        }

        fundSummary[sheet].totalBalance += amount;
        totalFund += amount;
      }
    });

    // -----------------------------------------------------------------
    // 2. YOGI MATRIX COMPUTATION (Active Yogis Only)
    // -----------------------------------------------------------------
    const YOGI_CATEGORIES = ['ရဟန်း', 'ကိုရင်', 'သီလရှင်', 'လူပုဂ္ဂိုလ်', 'ဝေယျာဝိစ္စ'];

    const initYogiMatrix = () => {
      const matrix = {};
      YOGI_CATEGORIES.forEach(cat => {
        matrix[cat] = { male: 0, female: 0, total: 0 };
      });
      return matrix;
    };

    const residentMatrix = initYogiMatrix();
    const retreatMatrix = initYogiMatrix();

    yogiRows.forEach(row => {
      const st = String(row.sheet_type || '12Yogi').trim();
      const cat = String(row.category || 'လူပုဂ္ဂိုလ်').trim();
      const gender = String(row.gender || 'ကျား').trim();
      const count = parseInt(row.cnt) || 0;

      const targetMatrix = (st === '13Yogi') ? retreatMatrix : residentMatrix;

      // အမျိုးအစား ခွဲခြား သတ်မှတ်ခြင်း
      let matchCat = 'လူပုဂ္ဂိုလ်';
      if (cat.includes('ရဟန်း') || cat.includes('သံဃာ') || cat.includes('ဦးပဉ္ဇင်း')) matchCat = 'ရဟန်း';
      else if (cat.includes('ကိုရင်') || cat.includes('သာမဏေ')) matchCat = 'ကိုရင်';
      else if (cat.includes('သီလရှင်') || cat.includes('ဆရာလေး')) matchCat = 'သီလရှင်';
      else if (cat.includes('ဝေယျာဝိစ္စ')) matchCat = 'ဝေယျာဝိစ္စ';
      else matchCat = 'လူပုဂ္ဂိုလ်';

      if (targetMatrix[matchCat]) {
        if (gender === 'မ') {
          targetMatrix[matchCat].female += count;
        } else {
          targetMatrix[matchCat].male += count;
        }
        targetMatrix[matchCat].total += count;
      }
    });

    return new Response(JSON.stringify({
      success: true,
      kpis: {
        totalFund,
        totalBank,
        totalCash,
        totalCount
      },
      fundSummary,
      yogiSummary: {
        resident: residentMatrix,
        retreat: retreatMatrix
      }
    }), {
      headers: corsHeaders
    });

  } catch (err) {
    console.error("[D1 Dashboard Fetch Error]:", err);
    return new Response(JSON.stringify({
      success: false,
      error: err.message,
      kpis: { totalFund: 0, totalBank: 0, totalCash: 0, totalCount: 0 },
      fundSummary: {},
      yogiSummary: {}
    }), {
      status: 500,
      headers: corsHeaders
    });
  }
}
