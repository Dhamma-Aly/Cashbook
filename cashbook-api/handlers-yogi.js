// ===================================================================
// cashbook-api/handlers-yogi.js
// Handles Yogi Management for both 'Permanent Yogi' (12Yogi) and 'Camp Yogi' (13Yogi)
// Supports Offline Sync Engine with unique_id (UUID)
// ===================================================================

// Helper: Sheet Code မှ D1 Table Name သို့ ချိတ်ဆက်ပေးခြင်း
function resolveYogiTable(sheetOrTable) {
  const s = String(sheetOrTable || '').trim();
  if (s === '13Yogi' || s === 'Camp Yogi' || s.includes('စခန်းဝင်')) {
    return 'Camp Yogi';
  }
  return 'Permanent Yogi'; // Default to 12Yogi
}

export async function handleYogiRequests(request, env, corsHeaders) {
  const url = new URL(request.url);
  const method = request.method;
  const pathname = url.pathname;

  // -----------------------------------------------------------------
  // 1. PUT /api/yogi/checkout (Active -> Inactive: စခန်းထွက်မည်)
  // -----------------------------------------------------------------
  if (method === 'PUT' && pathname.endsWith('/checkout')) {
    try {
      const body = await request.json();
      const unique_id = body.unique_id || body.uniqueId;
      const rawId = String(unique_id || body.id || '');
      const id = parseInt(rawId.replace(/^YOGI-/, '')) || (body.id ? parseInt(body.id) : null);
      const end_date = body.end_date || new Date().toISOString().split('T')[0];

      if (!unique_id && !id) {
        return new Response(JSON.stringify({ success: false, error: "Missing Yogi ID for checkout" }), {
          status: 400,
          headers: corsHeaders
        });
      }

      // Target Table သတ်မှတ်ခြင်း (မပါလာပါက Table နှစ်ခုလုံးတွင် စစ်ဆေးဆောင်ရွက်မည်)
      const targetTable = body.sheet_type || body.sheet ? resolveYogiTable(body.sheet_type || body.sheet) : null;
      const tablesToUpdate = targetTable ? [targetTable] : ['Permanent Yogi', 'Camp Yogi'];

      for (const tbl of tablesToUpdate) {
        if (unique_id) {
          await env.DB.prepare(`
            UPDATE "${tbl}"
            SET status = 'Inactive', end_date = ?, updated_at = datetime('now')
            WHERE unique_id = ?
          `).bind(end_date, unique_id).run();
        }
        if (id) {
          await env.DB.prepare(`
            UPDATE "${tbl}"
            SET status = 'Inactive', end_date = ?, updated_at = datetime('now')
            WHERE id = ?
          `).bind(end_date, id).run();
        }
      }

      return new Response(JSON.stringify({ success: true, message: "ယောဂီ စခန်းထွက်ခြင်း မှတ်တမ်းတင်ပြီးပါပြီ" }), {
        headers: corsHeaders
      });

    } catch (err) {
      console.error("[D1 Yogi Checkout Error]:", err);
      return new Response(JSON.stringify({ success: false, error: err.message }), {
        status: 500,
        headers: corsHeaders
      });
    }
  }

  // -----------------------------------------------------------------
  // 2. PUT /api/yogi/reactivate (Inactive -> Active: စခန်းတွင်း ပြန်လည်ဝင်မည်)
  // -----------------------------------------------------------------
  if (method === 'PUT' && pathname.endsWith('/reactivate')) {
    try {
      const body = await request.json();
      const unique_id = body.unique_id || body.uniqueId;
      const rawId = String(unique_id || body.id || '');
      const id = parseInt(rawId.replace(/^YOGI-/, '')) || (body.id ? parseInt(body.id) : null);

      if (!unique_id && !id) {
        return new Response(JSON.stringify({ success: false, error: "Missing Yogi ID for reactivation" }), {
          status: 400,
          headers: corsHeaders
        });
      }

      const targetTable = body.sheet_type || body.sheet ? resolveYogiTable(body.sheet_type || body.sheet) : null;
      const tablesToUpdate = targetTable ? [targetTable] : ['Permanent Yogi', 'Camp Yogi'];

      for (const tbl of tablesToUpdate) {
        if (unique_id) {
          await env.DB.prepare(`
            UPDATE "${tbl}"
            SET status = 'Active', end_date = '', updated_at = datetime('now')
            WHERE unique_id = ?
          `).bind(unique_id).run();
        }
        if (id) {
          await env.DB.prepare(`
            UPDATE "${tbl}"
            SET status = 'Active', end_date = '', updated_at = datetime('now')
            WHERE id = ?
          `).bind(id).run();
        }
      }

      return new Response(JSON.stringify({ success: true, message: "ယောဂီ စခန်းတွင်း ပြန်လည်ဝင်ရောက်ပြီးပါပြီ" }), {
        headers: corsHeaders
      });

    } catch (err) {
      console.error("[D1 Yogi Reactivate Error]:", err);
      return new Response(JSON.stringify({ success: false, error: err.message }), {
        status: 500,
        headers: corsHeaders
      });
    }
  }

  // -----------------------------------------------------------------
  // 3. GET /api/yogi?sheet=12Yogi (သို့မဟုတ် 13Yogi)
  // -----------------------------------------------------------------
  if (method === 'GET') {
    const rawSheet = url.searchParams.get('sheet') || '12Yogi';
    const tableName = resolveYogiTable(rawSheet);

    try {
      const { results } = await env.DB.prepare(
        `SELECT * FROM "${tableName}" ORDER BY start_date ASC, id ASC`
      ).all();

      let totalMonks = 0;   // ရဟန်း၊ သံဃာ၊ ဦးပဉ္ဇင်း၊ ကိုရင်
      let totalNuns = 0;    // သီလရှင်၊ ဆရာလေး
      let totalMales = 0;   // လူပုဂ္ဂိုလ် (ကျား)
      let totalFemales = 0; // လူပုဂ္ဂိုလ် (မ)
      let totalActiveYogis = 0;
      let totalInactiveYogis = 0;

      const formattedEntries = (results || []).map((row, index) => {
        const isActive = (row.status || 'Active') === 'Active';

        if (isActive) {
          totalActiveYogis++;
          const cat = row.category || '';
          const gender = row.gender || 'ကျား';

          if (cat.includes('ရဟန်း') || cat.includes('သံဃာ') || cat.includes('ကိုရင်') || cat.includes('ဦးပဉ္ဇင်း')) {
            totalMonks++;
          } else if (cat.includes('သီလရှင်') || cat.includes('ဆရာလေး')) {
            totalNuns++;
          } else if (gender === 'ကျား') {
            totalMales++;
          } else if (gender === 'မ') {
            totalFemales++;
          }
        } else {
          totalInactiveYogis++;
        }

        const uid = row.unique_id || `YOGI-${row.id}`;

        return {
          id: row.id,
          no: index + 1,
          uniqueId: uid,
          unique_id: uid,
          sheet_type: rawSheet,
          category: row.category || 'လူပုဂ္ဂိုလ်',
          start_date: row.start_date || '',
          end_date: row.end_date || '',
          name: row.name || '',
          father_name: row.father_name || '',
          nrc_state: row.nrc_state || '',
          nrc_township: row.nrc_township || '',
          nrc_type: row.nrc_type || '',
          nrc_number: row.nrc_number || '',
          full_nrc: row.full_nrc || '',
          nrc: row.full_nrc || '',
          dob: row.dob || '',
          age: row.age || 0,
          gender: row.gender || 'ကျား',
          phone: row.phone || '',
          yogi_phone: row.phone || '',
          home_phone: row.home_phone || '',
          address: row.address || '',
          status: row.status || 'Active',
          book_name: tableName
        };
      });

      return new Response(JSON.stringify({
        success: true,
        sheet: rawSheet,
        book: tableName,
        data: formattedEntries,
        kpis: {
          totalMonks,
          totalNuns,
          totalMales,
          totalFemales,
          totalActiveYogis,
          totalInactiveYogis,
          totalCount: results ? results.length : 0
        }
      }), { headers: corsHeaders });

    } catch (err) {
      console.error("[D1 Yogi Fetch Error]:", err);
      return new Response(JSON.stringify({ success: false, error: err.message }), {
        status: 500,
        headers: corsHeaders
      });
    }
  }

  // -----------------------------------------------------------------
  // 4. POST /api/yogi (ယောဂီ အသစ်ထည့်သွင်းခြင်း)
  // -----------------------------------------------------------------
  if (method === 'POST') {
    try {
      const body = await request.json();
      const sheet_type = body.sheet_type || body.sheet || '12Yogi';
      const tableName = resolveYogiTable(sheet_type);

      const category = body.category || 'လူပုဂ္ဂိုလ်';
      const start_date = body.start_date || new Date().toISOString().split('T')[0];
      const end_date = body.end_date || '';
      const name = (body.name || '').trim();
      const father_name = body.father_name || '';
      const nrc_state = body.nrc_state || '';
      const nrc_township = body.nrc_township || '';
      const nrc_type = body.nrc_type || '';
      const nrc_number = body.nrc_number || '';
      const full_nrc = body.full_nrc || body.nrc || '';
      const dob = body.dob || '';
      const age = parseInt(body.age) || 0;
      const gender = body.gender || 'ကျား';
      const phone = body.phone || body.yogi_phone || '';
      const home_phone = body.home_phone || '';
      const address = body.address || '';
      const status = body.status || 'Active';
      const unique_id = body.unique_id || body.uniqueId || `YOGI-${crypto.randomUUID()}`;

      if (!name) {
        return new Response(JSON.stringify({ success: false, error: "ယောဂီအမည် ထည့်သွင်းရန် လိုအပ်ပါသည်" }), {
          status: 400,
          headers: corsHeaders
        });
      }

      const query = `
        INSERT INTO "${tableName}" 
        (sheet_type, category, start_date, end_date, name, father_name, nrc_state, nrc_township, nrc_type, nrc_number, full_nrc, dob, age, gender, phone, home_phone, address, status, unique_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      await env.DB.prepare(query).bind(
        sheet_type, category, start_date, end_date, name, father_name,
        nrc_state, nrc_township, nrc_type, nrc_number, full_nrc,
        dob, age, gender, phone, home_phone, address, status, unique_id
      ).run();

      return new Response(JSON.stringify({ 
        success: true, 
        message: "ယောဂီစာရင်း အသစ်ထည့်သွင်းခြင်း အောင်မြင်ပါသည်",
        unique_id 
      }), { headers: corsHeaders });

    } catch (err) {
      console.error("[D1 Yogi Insert Error]:", err);
      return new Response(JSON.stringify({ success: false, error: err.message }), {
        status: 500,
        headers: corsHeaders
      });
    }
  }

  // -----------------------------------------------------------------
  // 5. PUT /api/yogi (ယောဂီ အချက်အလက် ပြင်ဆင်ခြင်း)
  // -----------------------------------------------------------------
  if (method === 'PUT') {
    try {
      const body = await request.json();
      const unique_id = body.unique_id || body.uniqueId;
      const rawId = String(unique_id || body.id || '');
      const id = parseInt(rawId.replace(/^YOGI-/, '')) || (body.id ? parseInt(body.id) : null);

      if (!unique_id && !id) {
        return new Response(JSON.stringify({ success: false, error: "Missing Yogi unique_id or id for update" }), {
          status: 400,
          headers: corsHeaders
        });
      }

      const sheet_type = body.sheet_type || body.sheet;
      const tableName = resolveYogiTable(sheet_type);

      const category = body.category || 'လူပုဂ္ဂိုလ်';
      const start_date = body.start_date;
      const end_date = body.end_date || '';
      const name = body.name;
      const father_name = body.father_name || '';
      const nrc_state = body.nrc_state || '';
      const nrc_township = body.nrc_township || '';
      const nrc_type = body.nrc_type || '';
      const nrc_number = body.nrc_number || '';
      const full_nrc = body.full_nrc || body.nrc || '';
      const dob = body.dob || '';
      const age = parseInt(body.age) || 0;
      const gender = body.gender || 'ကျား';
      const phone = body.phone || body.yogi_phone || '';
      const home_phone = body.home_phone || '';
      const address = body.address || '';
      const status = body.status || 'Active';

      const tablesToUpdate = sheet_type ? [tableName] : ['Permanent Yogi', 'Camp Yogi'];

      for (const tbl of tablesToUpdate) {
        if (unique_id) {
          await env.DB.prepare(`
            UPDATE "${tbl}"
            SET category = ?, start_date = ?, end_date = ?, name = ?, father_name = ?, nrc_state = ?, nrc_township = ?, nrc_type = ?, nrc_number = ?, full_nrc = ?, dob = ?, age = ?, gender = ?, phone = ?, home_phone = ?, address = ?, status = ?, updated_at = datetime('now')
            WHERE unique_id = ?
          `).bind(category, start_date, end_date, name, father_name, nrc_state, nrc_township, nrc_type, nrc_number, full_nrc, dob, age, gender, phone, home_phone, address, status, unique_id).run();
        } else if (id) {
          await env.DB.prepare(`
            UPDATE "${tbl}"
            SET category = ?, start_date = ?, end_date = ?, name = ?, father_name = ?, nrc_state = ?, nrc_township = ?, nrc_type = ?, nrc_number = ?, full_nrc = ?, dob = ?, age = ?, gender = ?, phone = ?, home_phone = ?, address = ?, status = ?, updated_at = datetime('now')
            WHERE id = ?
          `).bind(category, start_date, end_date, name, father_name, nrc_state, nrc_township, nrc_type, nrc_number, full_nrc, dob, age, gender, phone, home_phone, address, status, id).run();
        }
      }

      return new Response(JSON.stringify({ success: true, message: "ယောဂီ အချက်အလက် ပြင်ဆင်မှု အောင်မြင်ပါသည်" }), {
        headers: corsHeaders
      });

    } catch (err) {
      console.error("[D1 Yogi Update Error]:", err);
      return new Response(JSON.stringify({ success: false, error: err.message }), {
        status: 500,
        headers: corsHeaders
      });
    }
  }

  // -----------------------------------------------------------------
  // 6. DELETE /api/yogi?unique_id=YOGI-xxx သို့မဟုတ် ?id=1
  // -----------------------------------------------------------------
  if (method === 'DELETE') {
    try {
      const sheet_type = url.searchParams.get('sheet') || url.searchParams.get('sheet_type');
      let unique_id = url.searchParams.get('unique_id') || url.searchParams.get('uniqueId');
      let id = url.searchParams.get('id');

      // Request Body ဖြင့် လာပါက စစ်ဆေးခြင်း
      if (!unique_id && !id) {
        try {
          const body = await request.json();
          unique_id = body.unique_id || body.uniqueId;
          id = body.id;
        } catch (_) {}
      }

      if (!unique_id && !id) {
        return new Response(JSON.stringify({ success: false, error: "Missing unique_id or id for deletion" }), {
          status: 400,
          headers: corsHeaders
        });
      }

      const tablesToDelete = sheet_type ? [resolveYogiTable(sheet_type)] : ['Permanent Yogi', 'Camp Yogi'];

      for (const tbl of tablesToDelete) {
        if (unique_id) {
          await env.DB.prepare(`DELETE FROM "${tbl}" WHERE unique_id = ?`).bind(unique_id).run();
        } else if (id) {
          await env.DB.prepare(`DELETE FROM "${tbl}" WHERE id = ?`).bind(id).run();
        }
      }

      return new Response(JSON.stringify({ success: true, message: "ယောဂီမှတ်တမ်း ဖျက်ပစ်ပြီးပါပြီ" }), {
        headers: corsHeaders
      });

    } catch (err) {
      console.error("[D1 Yogi Delete Error]:", err);
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
