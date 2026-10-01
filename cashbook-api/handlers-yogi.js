// ===================================================================
// cashbook-api/handlers-yogi.js
// 100% Aligned with D1 "Permanent Yogi" & "Camp Yogi" Schema
// Columns: id, no, start_date, end_date, yogi_type, name, father_name, nrc, dob, age, gender, yogi_phone, home_phone, address, unique_id, updated_at
// ===================================================================

function resolveYogiTable(sheetOrTable) {
  const s = String(sheetOrTable || '').trim();
  if (s === '13Yogi' || s === 'Camp Yogi' || s.includes('စခန်းဝင်')) {
    return 'Camp Yogi';
  }
  return 'Permanent Yogi';
}

export async function handleYogiRequests(request, env, corsHeaders) {
  const url = new URL(request.url);
  const method = request.method;
  const pathname = url.pathname;

  // 1. PUT /api/yogi/checkout (စခန်းထွက်မည် -> end_date ဖြည့်သွင်းခြင်း)
  if (method === 'PUT' && pathname.endsWith('/checkout')) {
    try {
      const body = await request.json();
      const unique_id = body.unique_id || body.uniqueId;
      const id = body.id || (unique_id && !isNaN(unique_id) ? parseInt(unique_id) : null);
      const end_date = body.end_date || new Date().toISOString().split('T')[0];

      if (!unique_id && !id) {
        return new Response(JSON.stringify({ success: false, error: "Missing Yogi unique_id or id" }), { status: 400, headers: corsHeaders });
      }

      const targetTable = body.sheet_type || body.sheet ? resolveYogiTable(body.sheet_type || body.sheet) : null;
      const tablesToUpdate = targetTable ? [targetTable] : ['Permanent Yogi', 'Camp Yogi'];

      for (const tbl of tablesToUpdate) {
        if (unique_id) {
          await env.DB.prepare(`UPDATE "${tbl}" SET end_date = ?, updated_at = datetime('now') WHERE unique_id = ?`).bind(end_date, unique_id).run();
        }
        if (id) {
          await env.DB.prepare(`UPDATE "${tbl}" SET end_date = ?, updated_at = datetime('now') WHERE id = ?`).bind(end_date, id).run();
        }
      }

      return new Response(JSON.stringify({ success: true, message: "ယောဂီ စခန်းထွက်ခြင်း မှတ်တမ်းတင်ပြီးပါပြီ" }), { headers: corsHeaders });

    } catch (err) {
      console.error("[D1 Yogi Checkout Error]:", err);
      return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: corsHeaders });
    }
  }

  // 2. PUT /api/yogi/reactivate (စခန်းတွင်း ပြန်ဝင်မည် -> end_date အလွတ်လုပ်ခြင်း)
  if (method === 'PUT' && pathname.endsWith('/reactivate')) {
    try {
      const body = await request.json();
      const unique_id = body.unique_id || body.uniqueId;
      const id = body.id;

      if (!unique_id && !id) {
        return new Response(JSON.stringify({ success: false, error: "Missing Yogi unique_id or id" }), { status: 400, headers: corsHeaders });
      }

      const targetTable = body.sheet_type || body.sheet ? resolveYogiTable(body.sheet_type || body.sheet) : null;
      const tablesToUpdate = targetTable ? [targetTable] : ['Permanent Yogi', 'Camp Yogi'];

      for (const tbl of tablesToUpdate) {
        if (unique_id) {
          await env.DB.prepare(`UPDATE "${tbl}" SET end_date = '', updated_at = datetime('now') WHERE unique_id = ?`).bind(unique_id).run();
        }
        if (id) {
          await env.DB.prepare(`UPDATE "${tbl}" SET end_date = '', updated_at = datetime('now') WHERE id = ?`).bind(id).run();
        }
      }

      return new Response(JSON.stringify({ success: true, message: "ယောဂီ စခန်းတွင်း ပြန်လည်ဝင်ရောက်ပြီးပါပြီ" }), { headers: corsHeaders });

    } catch (err) {
      console.error("[D1 Yogi Reactivate Error]:", err);
      return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: corsHeaders });
    }
  }

  // 3. GET /api/yogi?sheet=12Yogi (သို့မဟုတ် 13Yogi)
  if (method === 'GET') {
    const rawSheet = url.searchParams.get('sheet') || '12Yogi';
    const tableName = resolveYogiTable(rawSheet);

    try {
      const { results } = await env.DB.prepare(
        `SELECT * FROM "${tableName}" ORDER BY start_date ASC, id ASC`
      ).all();

      let totalMonks = 0, totalNuns = 0, totalMales = 0, totalFemales = 0;
      let totalActiveYogis = 0, totalInactiveYogis = 0;

      const formattedEntries = (results || []).map((row, index) => {
        // end_date မရှိပါက Active ဟု သတ်မှတ်သည်
        const isActive = !row.end_date || row.end_date.trim() === '' || row.end_date.trim() === '-';

        const name = (row.name || '').trim();
        const type = (row.yogi_type || '').trim();
        const gender = (row.gender || 'ကျား').trim();

        if (isActive) {
          totalActiveYogis++;
          if (name.includes('ဦး') || name.includes('အရှင်') || name.includes('ဆရာတော်') || type.includes('ရဟန်း') || type.includes('သံဃာ')) {
            totalMonks++;
          } else if (name.includes('ကိုရင်') || type.includes('ကိုရင်')) {
            totalMonks++;
          } else if (name.includes('ဒေါ်လေး') || name.includes('ဆရာလေး') || type.includes('သီလရှင်')) {
            totalNuns++;
          } else if (gender === 'မ') {
            totalFemales++;
          } else {
            totalMales++;
          }
        } else {
          totalInactiveYogis++;
        }

        const uid = row.unique_id || `YOGI-${row.id}`;

        return {
          id: row.id,
          no: row.no || (index + 1),
          uniqueId: uid,
          unique_id: uid,
          sheet_type: rawSheet,
          start_date: row.start_date || '',
          end_date: row.end_date || '',
          yogi_type: row.yogi_type || (rawSheet === '13Yogi' ? 'စခန်းဝင်' : 'အမြဲနေ'),
          category: row.yogi_type || 'လူပုဂ္ဂိုလ်', // UI Compatibility
          name: row.name,
          father_name: row.father_name || '',
          nrc: row.nrc || '',
          full_nrc: row.nrc || '',                // UI Compatibility
          dob: row.dob || '',
          age: row.age || 0,
          gender: row.gender || 'ကျား',
          yogi_phone: row.yogi_phone || '',
          phone: row.yogi_phone || '',             // UI Compatibility
          home_phone: row.home_phone || '',
          address: row.address || '',
          status: isActive ? 'Active' : 'Inactive',
          book_name: tableName
        };
      });

      return new Response(JSON.stringify({
        success: true,
        sheet: rawSheet,
        book: tableName,
        data: formattedEntries,
        kpis: {
          totalMonks, totalNuns, totalMales, totalFemales,
          totalActiveYogis, totalInactiveYogis,
          totalCount: results ? results.length : 0
        }
      }), { headers: corsHeaders });

    } catch (err) {
      console.error("[D1 Yogi Fetch Error]:", err);
      return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: corsHeaders });
    }
  }

  // 4. POST /api/yogi
  if (method === 'POST') {
    try {
      const body = await request.json();
      const sheet_type = body.sheet_type || body.sheet || '12Yogi';
      const tableName = resolveYogiTable(sheet_type);

      const name = (body.name || '').trim();
      if (!name) {
        return new Response(JSON.stringify({ success: false, error: "ယောဂီအမည် (name) ထည့်သွင်းရန် လိုအပ်ပါသည်" }), {
          status: 400, headers: corsHeaders
        });
      }

      const start_date = body.start_date || new Date().toISOString().split('T')[0];
      const end_date = body.end_date || '';
      const defaultType = tableName === 'Camp Yogi' ? 'စခန်းဝင်' : 'အမြဲနေ';
      const yogi_type = body.yogi_type || body.category || defaultType;
      const father_name = body.father_name || '';
      const nrc = body.nrc || body.full_nrc || '';
      const dob = body.dob || '';
      const age = parseInt(body.age) || 0;
      const gender = body.gender || 'ကျား';
      const yogi_phone = body.yogi_phone || body.phone || '';
      const home_phone = body.home_phone || '';
      const address = body.address || '';
      const unique_id = body.unique_id || body.uniqueId || `YOGI-${crypto.randomUUID()}`;

      await env.DB.prepare(`
        INSERT INTO "${tableName}" 
        (start_date, end_date, yogi_type, name, father_name, nrc, dob, age, gender, yogi_phone, home_phone, address, unique_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        start_date, end_date, yogi_type, name, father_name,
        nrc, dob, age, gender, yogi_phone, home_phone, address, unique_id
      ).run();

      return new Response(JSON.stringify({ success: true, message: "ယောဂီစာရင်း သိမ်းဆည်းပြီးပါပြီ", unique_id }), {
        headers: corsHeaders
      });

    } catch (err) {
      console.error("[D1 Yogi Insert Error]:", err);
      return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: corsHeaders });
    }
  }

  // 5. PUT /api/yogi
  if (method === 'PUT') {
    try {
      const body = await request.json();
      const unique_id = body.unique_id || body.uniqueId;
      const id = body.id;

      if (!unique_id && !id) {
        return new Response(JSON.stringify({ success: false, error: "Missing unique_id or id" }), { status: 400, headers: corsHeaders });
      }

      const sheet_type = body.sheet_type || body.sheet;
      const tableName = resolveYogiTable(sheet_type);
      const start_date = body.start_date;
      const end_date = body.end_date || '';
      const yogi_type = body.yogi_type || body.category;
      const name = body.name;
      const father_name = body.father_name || '';
      const nrc = body.nrc || body.full_nrc || '';
      const dob = body.dob || '';
      const age = parseInt(body.age) || 0;
      const gender = body.gender || 'ကျား';
      const yogi_phone = body.yogi_phone || body.phone || '';
      const home_phone = body.home_phone || '';
      const address = body.address || '';

      const tablesToUpdate = sheet_type ? [tableName] : ['Permanent Yogi', 'Camp Yogi'];

      for (const tbl of tablesToUpdate) {
        if (unique_id) {
          await env.DB.prepare(`
            UPDATE "${tbl}"
            SET start_date = ?, end_date = ?, yogi_type = ?, name = ?, father_name = ?, nrc = ?, dob = ?, age = ?, gender = ?, yogi_phone = ?, home_phone = ?, address = ?, updated_at = datetime('now')
            WHERE unique_id = ?
          `).bind(start_date, end_date, yogi_type, name, father_name, nrc, dob, age, gender, yogi_phone, home_phone, address, unique_id).run();
        } else if (id) {
          await env.DB.prepare(`
            UPDATE "${tbl}"
            SET start_date = ?, end_date = ?, yogi_type = ?, name = ?, father_name = ?, nrc = ?, dob = ?, age = ?, gender = ?, yogi_phone = ?, home_phone = ?, address = ?, updated_at = datetime('now')
            WHERE id = ?
          `).bind(start_date, end_date, yogi_type, name, father_name, nrc, dob, age, gender, yogi_phone, home_phone, address, id).run();
        }
      }

      return new Response(JSON.stringify({ success: true, message: "ယောဂီ အချက်အလက် ပြင်ဆင်ပြီးပါပြီ" }), { headers: corsHeaders });

    } catch (err) {
      console.error("[D1 Yogi Update Error]:", err);
      return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: corsHeaders });
    }
  }

  // 6. DELETE /api/yogi
  if (method === 'DELETE') {
    try {
      const sheet_type = url.searchParams.get('sheet') || url.searchParams.get('sheet_type');
      let unique_id = url.searchParams.get('unique_id') || url.searchParams.get('uniqueId');
      let id = url.searchParams.get('id');

      if (!unique_id && !id) {
        try {
          const body = await request.json();
          unique_id = body.unique_id || body.uniqueId;
          id = body.id;
        } catch (_) {}
      }

      const tablesToDelete = sheet_type ? [resolveYogiTable(sheet_type)] : ['Permanent Yogi', 'Camp Yogi'];

      for (const tbl of tablesToDelete) {
        if (unique_id) {
          await env.DB.prepare(`DELETE FROM "${tbl}" WHERE unique_id = ?`).bind(unique_id).run();
        } else if (id) {
          await env.DB.prepare(`DELETE FROM "${tbl}" WHERE id = ?`).bind(id).run();
        }
      }

      return new Response(JSON.stringify({ success: true, message: "ယောဂီမှတ်တမ်း ဖျက်ပစ်ပြီးပါပြီ" }), { headers: corsHeaders });

    } catch (err) {
      console.error("[D1 Yogi Delete Error]:", err);
      return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: corsHeaders });
    }
  }

  return new Response(JSON.stringify({ success: false, error: "Method not supported" }), { status: 405, headers: corsHeaders });
}
