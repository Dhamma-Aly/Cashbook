// ===================================================================
// cashbook-api/handlers-inventory.js
// Handles Inventory (11Inv) CRUD & KPIs querying D1 'inventory' table
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
        `SELECT * FROM inventory ORDER BY date ASC, id ASC`
      ).all();

      let kitchen = 0;
      let dhammaHall = 0;
      let sim = 0;
      let store = 0;

      // Location အလိုက် အရေအတွက် KPIs တွက်ချက်ခြင်းနှင့် Format ပြောင်းခြင်း
      const formattedEntries = (results || []).map(row => {
        const q = parseInt(row.qty) || 0;
        const loc = row.location || '';

        if (loc === 'မီးဖိုဆောင်') kitchen += q;
        else if (loc === 'ဓမ္မာရုံ') dhammaHall += q;
        else if (loc === 'သိမ်') sim += q;
        else if (loc === 'စတို') store += q;

        return {
          id: row.id,
          uniqueId: `INV-${row.id}`,
          entry_date: row.date,
          location: row.location,
          category: row.category,
          item_desc: row.item_name,
          item_name: row.item_name,
          unit: row.unit || '',
          qty: q,
          note: row.remark || '',
          remark: row.remark || '',
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
          store
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
      const date = body.entry_date || new Date().toISOString().split('T')[0];
      const location = body.location || 'စတို';
      const category = body.category || 'အထွေထွေ';
      const item_name = body.item_desc || body.item_name || '';
      const unit = body.unit || '';
      const qty = parseInt(body.qty) || 1;
      const remark = body.note || body.remark || '';

      const query = `
        INSERT INTO inventory (date, location, category, item_name, unit, qty, remark)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `;

      await env.DB.prepare(query)
        .bind(date, location, category, item_name, unit, qty, remark)
        .run();

      return new Response(JSON.stringify({ success: true, message: "Inventory item created successfully" }), {
        headers: corsHeaders
      });

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
      const rawId = body.uniqueId || '';
      const id = parseInt(rawId.replace(/^INV-/, '')) || body.id;

      if (!id) {
        return new Response(JSON.stringify({ success: false, error: "Missing Inventory ID for update" }), {
          status: 400,
          headers: corsHeaders
        });
      }

      const date = body.entry_date;
      const location = body.location;
      const category = body.category;
      const item_name = body.item_desc || body.item_name || '';
      const unit = body.unit || '';
      const qty = parseInt(body.qty) || 1;
      const remark = body.note || body.remark || '';

      const query = `
        UPDATE inventory
        SET date = ?, location = ?, category = ?, item_name = ?, unit = ?, qty = ?, remark = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;

      await env.DB.prepare(query)
        .bind(date, location, category, item_name, unit, qty, remark, id)
        .run();

      return new Response(JSON.stringify({ success: true, message: "Inventory item updated successfully" }), {
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
  // 4. DELETE /api/inventory?uniqueId=INV-12 (ပစ္စည်းစာရင်း ဖျက်ပစ်ခြင်း)
  // -----------------------------------------------------------------
  if (method === 'DELETE') {
    try {
      const rawId = url.searchParams.get('uniqueId') || '';
      const id = parseInt(rawId.replace(/^INV-/, '')) || parseInt(rawId);

      if (!id) {
        return new Response(JSON.stringify({ success: false, error: "Missing Inventory ID for deletion" }), {
          status: 400,
          headers: corsHeaders
        });
      }

      await env.DB.prepare(`DELETE FROM inventory WHERE id = ?`).bind(id).run();

      return new Response(JSON.stringify({ success: true, message: "Inventory item deleted successfully" }), {
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