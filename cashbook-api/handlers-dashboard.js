// ===================================================================
// cashbook-api/handlers-dashboard.js
// Handles Home Dashboard Summary (/api/home-summary) querying D1
// Computes Fund Breakdown (Bank, User 1, User 2, User 3) and Yogi Matrix
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
    // 1. FUND SUMMARY COMPUTATION
    // -----------------------------------------------------------------
    const { results: fundRows } = await env.DB.prepare(`
      SELECT 
        sheet_code,
        receiver,
        SUM(CASE WHEN type = 'ဝင်ငွေ' THEN amount ELSE -amount END) as net_amount,
        COUNT(*) as row_count
      FROM cashbooks
      GROUP BY sheet_code, receiver
    `).all();

    // Map structure for each sheet
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

    (fundRows || []).forEach(row => {
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
          if (receiver === 'User 1') fundSummary[sheet].user1Balance += amount;
          else if (receiver === 'User 2') fundSummary[sheet].user2Balance += amount;
          else if (receiver === 'User 3') fundSummary[sheet].user3Balance += amount;
          else fundSummary[sheet].user1Balance += amount; // Default unassigned to User 1

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

    const { results: yogiRows } = await env.DB.prepare(`
      SELECT 
        sheet_type,
        category,
        gender,
        COUNT(*) as cnt
      FROM yogis
      WHERE status = 'Active'
      GROUP BY sheet_type, category, gender
    `).all();

    // Matrix structures for 12Yogi (Resident) and 13Yogi (Retreat)
    const initYogiMatrix = () => {
      const matrix = {};
      YOGI_CATEGORIES.forEach(cat => {
        matrix[cat] = { male: 0, female: 0, total: 0 };
      });
      return matrix;
    };

    const residentMatrix = initYogiMatrix();
    const retreatMatrix = initYogiMatrix();

    (yogiRows || []).forEach(row => {
      const st = String(row.sheet_type || '12Yogi').trim();
      const cat = String(row.category || 'လူပုဂ္ဂိုလ်').trim();
      const gender = String(row.gender || 'ကျား').trim();
      const count = parseInt(row.cnt) || 0;

      const targetMatrix = (st === '13Yogi') ? retreatMatrix : residentMatrix;

      // Handle category matching (including legacy categories)
      let matchCat = 'လူပုဂ္ဂိုလ်';
      if (cat.includes('ရဟန်း') || cat.includes('သံဃာ')) matchCat = 'ရဟန်း';
      else if (cat.includes('ကိုရင်')) matchCat = 'ကိုရင်';
      else if (cat.includes('သီလရှင်') || cat.includes('ဆရာလေး')) matchCat = 'သီလရှင်';
      else if (cat.includes('ဝေယျာဝိစ္စ')) matchCat = 'ဝေယျာဝိစ္စ';
      else matchCat = 'လူပုဂ္ဂိုလ်';

      if (targetMatrix[matchCat]) {
        if (gender === 'ကျား') targetMatrix[matchCat].male += count;
        else targetMatrix[matchCat].female += count;
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