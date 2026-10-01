// ===================================================================
// cashbook-api/handlers-inventory.js
// Handles Inventory (11Inv) CRUD & KPIs querying D1 'Inventory' table
// Supports Offline Sync Engine with unique_id (UUID)
// ===================================================================

export async function handleInventoryRequests(request, env, corsHeaders) {
  const url = new URL(request.url);
  const method = request.method;

  // -----------------------------------------------------------------
  // 1. GET /api/inventory (ပစ္စည်းစာရင်း ဖတ်ယူခြင်းနှင့် KPIs တွက်ချက်ခြင်း)
  // -----------------------------------------------------------------
  if (method === 'GET') {
    try {
      const { results } = await env.DB.prepare(
        `SELECT * FROM "Inventory" ORDER BY date ASC, id ASC`
      ).all();

      let kitchen = 0;
      let dhammaHall = 0;
      let sim = 0;
      let store = 0;
      let totalQty = 0;

      // Location အလိုက် အရေအတွက် KPIs တွက်ချက်ခြင်းနှင့် Frontend Data Format ပြင်ဆင်ခြင်း
      const formattedEntries = (results || []).map((row, index) => {
        const q = parseInt(row.qty) || 0;
        const loc = (row.location || '').trim();

        totalQty += q;

        if (loc.includes('မီးဖို')) kitchen += q;
        else if (loc.includes('ဓမ္မာရုံ')) dhammaHall += q;
        else if (loc.includes('သိမ်')) sim += q;
        else if (loc.includes('စတို')) store += q;

        const uid = row.unique_id || `INV-${row.id}`;

        return {
          id: row.id,
          no: index + 1,
          uniqueId: uid,
          unique_id: uid,
          entry_date: row.date || '',
          date: row.date || '',
          location: row.location || 'စတို',
          category: row.category || 'အထွေထွေ',
          item_name: row.item_name || '',
          item_desc: row.item_name || '',
          unit: row.unit || 'ခု',
          qty: q,
          remark: row.remark || '',
          note: row.remark || '',
          month_year: row.date ? row.date.substring(0, 7) : '',
          book_name: '11Inv - ပစ္စည်းစာရင်း'
        };
      });

      return new Response(JSON.stringify({
        success: true,
        data: formattedEntries,
        kpis: {
          kitchen,
          dhammaHall,
          sim,
          store,
          totalQty,
          totalItems: results ? results.length : 0
        }
      }), { headers: corsHeaders });

    } catch (err) {
      console.error("[D1 Inventory Fetch Error]:", err);
      return new Response(JSON.stringify({ success: false, error: err.message }), {
        status: 500,
        headers: corsHeaders
      });
    }
  }

  // -----------------------------------------------------------------
  // 2. POST /api/inventory (ပစ္စည်းအသစ် ထည့်သွင်းခြင်း)
  // -----------------------------------------------------------------
  if (method === 'POST') {
    try {
      const body = await request.json();
      const date = body.entry_date || body.date || new Date().toISOString().split('T')[0];
      const location = (body.location || 'စတို').trim();
      const category = (body.category || 'အထွေထွေ').trim();
      const item_name = (body.item_name || body.item_desc || '').trim();
      const unit = (body.unit || 'ခု').trim();
      const qty = parseInt(body.qty) || 1;
      const remark = (body.remark || body.note || '').trim();
      const unique_id = body.unique_id || body.uniqueId || `INV-${crypto.randomUUID()}`;

      if (!item_name) {
        return new Response(JSON.stringify({ success: false, error: "ပစ္စည်းအမည် ထည့်သွင်းရန် လိုအပ်ပါသည်။" }), {
          status: 400,
          headers: corsHeaders
        });
      }

      const query = `
        INSERT INTO "Inventory" (date, location, category, item_name, unit, qty, remark, unique_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;

      await env.DB.prepare(query)
        .bind(date, location, category, item_name, unit, qty, remark, unique_id)
        .run();

      return new Response(JSON.stringify({ 
        success: true, 
        message: "ပစ္စည်းစာရင်း အသစ်ထည့်သွင်းခြင်း အောင်မြင်ပါသည်",
        unique_id 
      }), { headers: corsHeaders });

    } catch (err) {
      console.error("[D1 Inventory Insert Error]:", err);
      return new Response(JSON.stringify({ success: false, error: err.message }), {
        status: 500,
        headers: corsHeaders
      });
    }
  }

  // -----------------------------------------------------------------
  // 3. PUT /api/inventory (ပစ္စည်းစာရင်း ပြင်ဆင်ခြင်း)
  // -----------------------------------------------------------------
  if (method === 'PUT') {
    try {
      const body = await request.json();
      const unique_id = body.unique_id || body.uniqueId;
      const id = body.id || (unique_id && !isNaN(unique_id.replace(/^INV-/, '')) ? parseInt(unique_id.replace(/^INV-/, '')) : null);

      if (!unique_id && !id) {
        return new Response(JSON.stringify({ success: false, error: "Missing Inventory unique_id or id for update" }), {
          status: 400,
          headers: corsHeaders
        });
      }

      const date = body.entry_date || body.date;
      const location = body.location;
      const category = body.category;
      const item_name = body.item_name || body.item_desc || '';
      const unit = body.unit || 'ခု';
      const qty = parseInt(body.qty) || 1;
      const remark = body.remark || body.note || '';

      if (unique_id) {
        await env.DB.prepare(`
          UPDATE "Inventory"
          SET date = ?, location = ?, category = ?, item_name = ?, unit = ?, qty = ?, remark = ?, updated_at = datetime('now')
          WHERE unique_id = ?
        `).bind(date, location, category, item_name, unit, qty, remark, unique_id).run();
      } else {
        await env.DB.prepare(`
          UPDATE "Inventory"
          SET date = ?, location = ?, category = ?, item_name = ?, unit = ?, qty = ?, remark = ?, updated_at = datetime('now')
          WHERE id = ?
        `).bind(date, location, category, item_name, unit, qty, remark, id).run();
      }

      return new Response(JSON.stringify({ success: true, message: "ပစ္စည်းစာရင်း ပြင်ဆင်မှု အောင်မြင်ပါသည်" }), {
        headers: corsHeaders
      });

    } catch (err) {
      console.error("[D1 Inventory Update Error]:", err);
      return new Response(JSON.stringify({ success: false, error: err.message }), {
        status: 500,
        headers: corsHeaders
      });
    }
  }

  // -----------------------------------------------------------------
  // 4. DELETE /api/inventory?unique_id=INV-xxx သို့မဟုတ် ?id=1
  // -----------------------------------------------------------------
  if (method === 'DELETE') {
    try {
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

      if (unique_id) {
        await env.DB.prepare(`DELETE FROM "Inventory" WHERE unique_id = ?`).bind(unique_id).run();
      } else {
        await env.DB.prepare(`DELETE FROM "Inventory" WHERE id = ?`).bind(id).run();
      }

      return new Response(JSON.stringify({ success: true, message: "ပစ္စည်းစာရင်း ဖျက်ပစ်ပြီးပါပြီ" }), {
        headers: corsHeaders
      });

    } catch (err) {
      console.error("[D1 Inventory Delete Error]:", err);
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
