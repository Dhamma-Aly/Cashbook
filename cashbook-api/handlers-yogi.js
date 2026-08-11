// ===================================================================
// cashbook-api/handlers-yogi.js
// Cloudflare Worker Backend Handler for Yogi Management (12Yogi & 13Yogi)
// Handles D1 Database operations for Yogi entries & Active KPIs
// ===================================================================

export async function handleYogiRequests(request, env, pathname) {
  const url = new URL(request.url);
  const method = request.method;

  // 1. GET /api/yogi - Fetch Yogi Entries with filtering & Active KPIs
  if (method === 'GET' && pathname === '/api/yogi') {
    const sheetType = url.searchParams.get('sheet') || '12Yogi';
    const statusFilter = url.searchParams.get('status'); // 'Active', 'Inactive', or null (All)

    let sql = `SELECT * FROM yogi_entries WHERE sheet_type = ?`;
    let params = [sheetType];

    if (statusFilter) {
      sql += ` AND status = ?`;
      params.push(statusFilter);
    }

    sql += ` ORDER BY id ASC`;

    const { results } = await env.DB.prepare(sql).bind(...params).all();

    // Calculate Active KPI Summaries (Only counts 'Active' status)
    const kpiSql = `
      SELECT 
        SUM(CASE WHEN category = 'ရဟန်း' AND status = 'Active' THEN 1 ELSE 0 END) AS totalMonks,
        SUM(CASE WHEN category = 'သီလရှင်' AND status = 'Active' THEN 1 ELSE 0 END) AS totalNuns,
        SUM(CASE WHEN category = 'လူပုဂ္ဂိုလ်' AND gender = 'ကျား' AND status = 'Active' THEN 1 ELSE 0 END) AS totalMales,
        SUM(CASE WHEN category = 'လူပုဂ္ဂိုလ်' AND gender = 'မ' AND status = 'Active' THEN 1 ELSE 0 END) AS totalFemales,
        SUM(CASE WHEN status = 'Active' THEN 1 ELSE 0 END) AS totalActiveYogis
      FROM yogi_entries
      WHERE sheet_type = ?
    `;
    const kpiResult = await env.DB.prepare(kpiSql).bind(sheetType).first();

    return jsonResponse({
      success: true,
      data: results || [],
      kpis: {
        totalMonks: kpiResult?.totalMonks || 0,
        totalNuns: kpiResult?.totalNuns || 0,
        totalMales: kpiResult?.totalMales || 0,
        totalFemales: kpiResult?.totalFemales || 0,
        totalActiveYogis: kpiResult?.totalActiveYogis || 0
      }
    });
  }

  // 2. POST /api/yogi - Create New Yogi Entry
  if (method === 'POST' && pathname === '/api/yogi') {
    const body = await request.json();
    const {
      uniqueId,
      sheet_type,
      start_date,
      end_date = '',
      category,
      name,
      father_name = '',
      nrc = '',
      dob = '',
      age = 0,
      gender,
      yogi_phone = '',
      home_phone = '',
      address = '',
      status = 'Active'
    } = body;

    if (!uniqueId || !sheet_type || !start_date || !category || !name || !gender) {
      return jsonResponse({ success: false, error: 'လိုအပ်သော အချက်အလက်များ မပြည့်စုံပါ' }, 400);
    }

    const insertSql = `
      INSERT INTO yogi_entries (
        uniqueId, sheet_type, start_date, end_date, category, name, father_name,
        nrc, dob, age, gender, yogi_phone, home_phone, address, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await env.DB.prepare(insertSql).bind(
      uniqueId, sheet_type, start_date, end_date, category, name, father_name,
      nrc, dob, age, gender, yogi_phone, home_phone, address, status
    ).run();

    return jsonResponse({ success: true, message: 'ယောဂီစာရင်း အသစ်ထည့်သွင်းပြီးပါပြီ' });
  }

  // 3. PUT /api/yogi/checkout - Post (Check-out) Yogi (Set Inactive & End Date)
  if (method === 'PUT' && pathname === '/api/yogi/checkout') {
    const body = await request.json();
    const { uniqueId, end_date } = body;

    if (!uniqueId || !end_date) {
      return jsonResponse({ success: false, error: 'uniqueId နှင့် end_date လိုအပ်ပါသည်' }, 400);
    }

    const checkoutSql = `
      UPDATE yogi_entries 
      SET end_date = ?, status = 'Inactive', updated_at = CURRENT_TIMESTAMP
      WHERE uniqueId = ?
    `;

    const result = await env.DB.prepare(checkoutSql).bind(end_date, uniqueId).run();

    if (result.meta.changes === 0) {
      return jsonResponse({ success: false, error: 'ယောဂီစာရင်း ရှာမတွေ့ပါ' }, 404);
    }

    return jsonResponse({ success: true, message: 'စခန်းထွက်စာရင်း (Checkout) ပြုလုပ်ပြီးပါပြီ' });
  }

  // 4. PUT /api/yogi - Update Existing Yogi Entry
  if (method === 'PUT' && pathname === '/api/yogi') {
    const body = await request.json();
    const {
      uniqueId,
      start_date,
      end_date,
      category,
      name,
      father_name,
      nrc,
      dob,
      age,
      gender,
      yogi_phone,
      home_phone,
      address,
      status
    } = body;

    if (!uniqueId) {
      return jsonResponse({ success: false, error: 'uniqueId လိုအပ်ပါသည်' }, 400);
    }

    const updateSql = `
      UPDATE yogi_entries 
      SET start_date = ?, end_date = ?, category = ?, name = ?, father_name = ?,
          nrc = ?, dob = ?, age = ?, gender = ?, yogi_phone = ?, home_phone = ?,
          address = ?, status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE uniqueId = ?
    `;

    await env.DB.prepare(updateSql).bind(
      start_date, end_date || '', category, name, father_name || '',
      nrc || '', dob || '', age || 0, gender, yogi_phone || '', home_phone || '',
      address || '', status || 'Active', uniqueId
    ).run();

    return jsonResponse({ success: true, message: 'ယောဂီစာရင်း ပြင်ဆင်ပြီးပါပြီ' });
  }

  // 5. DELETE /api/yogi - Delete Yogi Entry
  if (method === 'DELETE' && pathname === '/api/yogi') {
    const uniqueId = url.searchParams.get('uniqueId');

    if (!uniqueId) {
      return jsonResponse({ success: false, error: 'uniqueId လိုအပ်ပါသည်' }, 400);
    }

    await env.DB.prepare(`DELETE FROM yogi_entries WHERE uniqueId = ?`).bind(uniqueId).run();

    return jsonResponse({ success: true, message: 'ယောဂီစာရင်း ပယ်ဖျက်ပြီးပါပြီ' });
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