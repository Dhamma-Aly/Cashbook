// ===================================================================
// cashbook-api/handlers-yogi.js
// Handles Yogi Management (12Yogi & 13Yogi) CRUD, Active/Inactive Toggling
// ===================================================================

export async function handleYogiRequests(request, env, corsHeaders) {
  const url = new URL(request.url);
  const method = request.method;
  const pathname = url.pathname;

  // -----------------------------------------------------------------
  // 1. PUT /api/yogi/checkout (Active -> Inactive: စခန်းထွက် မည်)
  // -----------------------------------------------------------------
  if (method === 'PUT' && pathname.endsWith('/checkout')) {
    try {
      const body = await request.json();
      const rawId = String(body.uniqueId || body.id || '');
      const id = parseInt(rawId.replace(/^YOGI-/, '')) || parseInt(rawId);
      const end_date = body.end_date || new Date().toISOString().split('T')[0];

      if (!id) {
        return new Response(JSON.stringify({ success: false, error: "Missing Yogi ID for checkout" }), {
          status: 400,
          headers: corsHeaders
        });
      }

      const query = `
        UPDATE yogis
        SET status = 'Inactive', end_date = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;

      await env.DB.prepare(query).bind(end_date, id).run();

      return new Response(JSON.stringify({ success: true, message: "Yogi checked out successfully" }), {
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
      const rawId = String(body.uniqueId || body.id || '');
      const id = parseInt(rawId.replace(/^YOGI-/, '')) || parseInt(rawId);

      if (!id) {
        return new Response(JSON.stringify({ success: false, error: "Missing Yogi ID for reactivation" }), {
          status: 400,
          headers: corsHeaders
        });
      }

      const query = `
        UPDATE yogis
        SET status = 'Active', end_date = '', updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;

      await env.DB.prepare(query).bind(id).run();

      return new Response(JSON.stringify({ success: true, message: "Yogi reactivated successfully" }), {
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
  // 3. GET /api/yogi?sheet=12Yogi (ယောဂီစာရင်း ဖတ်ယူခြင်းနှင့် KPIs တွက်ချက်ခြင်း)
  // -----------------------------------------------------------------
  if (method === 'GET') {
    const sheet = url.searchParams.get('sheet') || '12Yogi';

    try {
      const { results } = await env.DB.prepare(
        `SELECT * FROM yogis WHERE sheet_type = ? ORDER BY start_date ASC, id ASC`
      ).bind(sheet).all();

      let totalMonks = 0; // 💡 ရဟန်း + ကိုရင် ပေါင်းစပ်တွက်ချက်မည်
      let totalNuns = 0;  // 💡 သီလရှင်
      let totalMales = 0; // 💡 လူပုဂ္ဂိုလ်/ဝေယျာဝိစ္စ (ကျား)
      let totalFemales = 0; // 💡 လူပုဂ္ဂိုလ်/ဝေယျာဝိစ္စ (မ)
      let totalActiveYogis = 0;

      const formattedEntries = (results || []).map(row => {
        const isActive = (row.status || 'Active') === 'Active';

        if (isActive) {
          totalActiveYogis++;
          const cat = row.category || '';
          const gender = row.gender || 'ကျား';

          // 💡 ရဟန်း + ကိုရင် ကို ပေါင်းစပ်၍ "ရဟန်း/သံဃာ" KPI အဖြစ် တွက်ချက်ခြင်း
          if (cat.includes('ရဟန်း') || cat.includes('သံဃာ') || cat.includes('ကိုရင်')) {
            totalMonks++;
          } else if (cat.includes('သီလရှင်') || cat.includes('ဆရာလေး')) {
            totalNuns++;
          } else if (gender === 'ကျား') {
            totalMales++;
          } else if (gender === 'မ') {
            totalFemales++;
          }
        }

        return {
          id: row.id,
          uniqueId: `YOGI-${row.id}`,
          sheet_type: row.sheet_type,
          category: row.category,
          start_date: row.start_date,
          end_date: row.end_date || '',
          name: row.name,
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
          status: row.status || 'Active'
        };
      });

      return new Response(JSON.stringify({
        success: true,
        data: formattedEntries,
        kpis: {
          totalMonks,
          totalNuns,
          totalMales,
          totalFemales,
          totalActiveYogis
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
      const sheet_type = body.sheet_type || '12Yogi';
      const category = body.category || 'လူပုဂ္ဂိုလ်';
      const start_date = body.start_date || new Date().toISOString().split('T')[0];
      const end_date = body.end_date || '';
      const name = body.name || '';
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

      const query = `
        INSERT INTO yogis (sheet_type, category, start_date, end_date, name, father_name, nrc_state, nrc_township, nrc_type, nrc_number, full_nrc, dob, age, gender, phone, home_phone, address, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      await env.DB.prepare(query)
        .bind(sheet_type, category, start_date, end_date, name, father_name, nrc_state, nrc_township, nrc_type, nrc_number, full_nrc, dob, age, gender, phone, home_phone, address, status)
        .run();

      return new Response(JSON.stringify({ success: true, message: "Yogi created successfully" }), {
        headers: corsHeaders
      });

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
      const rawId = String(body.uniqueId || body.id || '');
      const id = parseInt(rawId.replace(/^YOGI-/, '')) || parseInt(rawId);

      if (!id) {
        return new Response(JSON.stringify({ success: false, error: "Missing Yogi ID for update" }), {
          status: 400,
          headers: corsHeaders
        });
      }

      const category = body.category;
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

      const query = `
        UPDATE yogis
        SET category = ?, start_date = ?, end_date = ?, name = ?, father_name = ?, nrc_state = ?, nrc_township = ?, nrc_type = ?, nrc_number = ?, full_nrc = ?, dob = ?, age = ?, gender = ?, phone = ?, home_phone = ?, address = ?, status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;

      await env.DB.prepare(query)
        .bind(category, start_date, end_date, name, father_name, nrc_state, nrc_township, nrc_type, nrc_number, full_nrc, dob, age, gender, phone, home_phone, address, status, id)
        .run();

      return new Response(JSON.stringify({ success: true, message: "Yogi updated successfully" }), {
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
  // 6. DELETE /api/yogi?uniqueId=YOGI-12 (ယောဂီစာရင်း ဖျက်ပစ်ခြင်း)
  // -----------------------------------------------------------------
  if (method === 'DELETE') {
    try {
      const rawId = String(url.searchParams.get('uniqueId') || '');
      const id = parseInt(rawId.replace(/^YOGI-/, '')) || parseInt(rawId);

      if (!id) {
        return new Response(JSON.stringify({ success: false, error: "Missing Yogi ID for deletion" }), {
          status: 400,
          headers: corsHeaders
        });
      }

      await env.DB.prepare(`DELETE FROM yogis WHERE id = ?`).bind(id).run();

      return new Response(JSON.stringify({ success: true, message: "Yogi deleted successfully" }), {
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