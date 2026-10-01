// ===================================================================
// cashbook-api/handlers-dashboard.js
// 100% Aligned with all 13 D1 Tables
// Concurrent Multi-Table Aggregation without 'status' column error
// ===================================================================

export async function handleDashboardRequests(request, env, corsHeaders) {
  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ success: false, error: "Method not supported" }), {
      status: 405, headers: corsHeaders
    });
  }

  try {
    const BANK_SHEETS = ['1CB', '2CB', '3CB'];
    const ALL_SHEETS = ['1CB', '2CB', '3CB', '4GB', '5FB', '6HB', '7PB', '8EB', '9MB', '10GB'];

    // စာအုပ် ၁၀ အုပ်လုံး၏ ဝင်ငွေ၊ ထွက်ငွေ၊ Receiver များကို တစ်ကြိမ်တည်း ဆွဲထုတ်ခြင်း
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

    // ယောဂီ Table ၂ ခု (end_date မရှိသော တက်ကြွဆဲ ယောဂီများကိုသာ ရွေးထုတ်ခြင်း)
    const yogiUnionSql = `
      SELECT '12Yogi' as sheet_type, yogi_type, name, gender
      FROM "Permanent Yogi"
      WHERE (end_date IS NULL OR end_date = '' OR end_date = '-')
      UNION ALL
      SELECT '13Yogi' as sheet_type, yogi_type, name, gender
      FROM "Camp Yogi"
      WHERE (end_date IS NULL OR end_date = '' OR end_date = '-')
    `;

    const [fundRes, yogiRes] = await Promise.all([
      env.DB.prepare(fundUnionSql).all(),
      env.DB.prepare(yogiUnionSql).all()
    ]);

    const fundRows = fundRes.results || [];
    const yogiRows = yogiRes.results || [];

    // Fund Summary တွက်ချက်ခြင်း
    const fundSummary = {};
    ALL_SHEETS.forEach(sheet => {
      fundSummary[sheet] = { bankBalance: 0, user1Balance: 0, user2Balance: 0, user3Balance: 0, totalBalance: 0 };
    });

    let totalFund = 0, totalBank = 0, totalCash = 0, totalCount = 0;

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
          if (receiver.includes('User 2') || receiver.includes('User2')) {
            fundSummary[sheet].user2Balance += amount;
          } else if (receiver.includes('User 3') || receiver.includes('User3')) {
            fundSummary[sheet].user3Balance += amount;
          } else {
            fundSummary[sheet].user1Balance += amount;
          }
          totalCash += amount;
        }
        fundSummary[sheet].totalBalance += amount;
        totalFund += amount;
      }
    });

    // Yogi Matrix တွက်ချက်ခြင်း
    const YOGI_CATEGORIES = ['ရဟန်း', 'ကိုရင်', 'သီလရှင်', 'လူပုဂ္ဂိုလ်', 'ဝေယျာဝိစ္စ'];
    const initYogiMatrix = () => {
      const m = {};
      YOGI_CATEGORIES.forEach(c => { m[c] = { male: 0, female: 0, total: 0 }; });
      return m;
    };

    const residentMatrix = initYogiMatrix();
    const retreatMatrix = initYogiMatrix();

    yogiRows.forEach(row => {
      const st = String(row.sheet_type || '12Yogi').trim();
      const name = String(row.name || '').trim();
      const type = String(row.yogi_type || '').trim();
      const gender = String(row.gender || 'ကျား').trim();

      const targetMatrix = (st === '13Yogi') ? retreatMatrix : residentMatrix;

      let matchCat = 'လူပုဂ္ဂိုလ်';
      if (name.includes('ဦး') || name.includes('အရှင်') || name.includes('ဆရာတော်') || type.includes('ရဟန်း') || type.includes('သံဃာ')) {
        matchCat = 'ရဟန်း';
      } else if (name.includes('ကိုရင်') || type.includes('ကိုရင်')) {
        matchCat = 'ကိုရင်';
      } else if (name.includes('ဒေါ်လေး') || name.includes('ဆရာလေး') || type.includes('သီလရှင်')) {
        matchCat = 'သီလရှင်';
      } else if (type.includes('ဝေယျာဝိစ္စ')) {
        matchCat = 'ဝေယျာဝိစ္စ';
      }

      if (targetMatrix[matchCat]) {
        if (gender === 'မ') targetMatrix[matchCat].female += 1;
        else targetMatrix[matchCat].male += 1;
        targetMatrix[matchCat].total += 1;
      }
    });

    return new Response(JSON.stringify({
      success: true,
      kpis: { totalFund, totalBank, totalCash, totalCount },
      fundSummary,
      yogiSummary: { resident: residentMatrix, retreat: retreatMatrix }
    }), { headers: corsHeaders });

  } catch (err) {
    console.error("[D1 Dashboard Fetch Error]:", err);
    return new Response(JSON.stringify({
      success: false,
      error: err.message,
      kpis: { totalFund: 0, totalBank: 0, totalCash: 0, totalCount: 0 },
      fundSummary: {},
      yogiSummary: {}
    }), { status: 500, headers: corsHeaders });
  }
}
