// ===================================================================
// cashbook-api/handlers-inventory.js
// 100% Aligned with D1 "Inventory" Schema
// Columns: id, no, date, location, category, description, unit, qty, remark, month_year, book_name, unique_id, updated_at
// ===================================================================

export async function handleInventoryRequests(request, env, corsHeaders) {
  const url = new URL(request.url);
  const method = request.method;

  // 1. GET /api/inventory
  if (method === 'GET') {
    try {
      const { results } = await env.DB.prepare(
        `SELECT * FROM "Inventory" ORDER BY date ASC, id ASC`
      ).all();

      let kitchen = 0, dhammaHall = 0, sim = 0, store = 0, totalQty = 0;

      const formattedEntries = (results || []).map((row, index) => {
        const q = parseFloat(row.qty) || 0;
        const loc = (row.location || '').trim();
        totalQty += q;

        if (loc.includes('မီးဖို')) kitchen += q;
        else if (loc.includes('ဓမ္မာရုံ')) dhammaHall += q;
        else if (loc.includes('သိမ်')) sim += q;
        else if (loc.includes('စတို')) store += q;

        const uid = row.unique_id || `INV-${row.id}`;

        return {
          id: row.id,
          no: row.no || (index + 1),
          uniqueId: uid,
          unique_id: uid,
          entry_date: row.date || '',
          date: row.date || '',
          location: row.location || 'စတို',
          category: row.category || 'အထွေထွေ',
          description: row.description || '',
          item_name: row.description || '',   // Frontend Compatibility
          item_desc: row.description || '',   // Frontend Compatibility
          unit: row.unit || 'ခု',
          qty: q,
          remark: row.remark || '',
          note: row.remark || '',
          month_year: row.month_year || (row.date ? row.date.substring(0, 7) : ''),
          book_name: row.book_name || 'Inventory'
        };
      });

      return new Response(JSON.stringify({
        success: true,
        data: formattedEntries,
        kpis: { kitchen, dhammaHall, sim, store, totalQty, totalItems: results ? results.length : 0 }
      }), { headers: corsHeaders });

    } catch (err) {
      console.error("[D1 Inventory Fetch Error]:", err);
      return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: corsHeaders });
    }
  }

  // 2. POST /api/inventory
  if (method === 'POST') {
    try {
      const body = await request.json();
      const date = body.entry_date || body.date || new Date().toISOString().split('T')[0];
      const location = (body.location || 'စတို').trim();
      const category = (body.category || 'အထွေထွေ').trim();
      const description = (body.description || body.item_name || body.item_desc || '').trim();
      const unit = (body.unit || 'ခု').trim();
      const qty = parseFloat(body.qty) || 0;
      const remark = (body.remark || body.note || '').trim();
      const month_year = body.month_year || date.substring(0, 7);
      const unique_id = body.unique_id || body.uniqueId || `INV-${crypto.randomUUID()}`;

      if (!description) {
        return new Response(JSON.stringify({ success: false, error: "ပစ္စည်းအမည် (description) ထည့်သွင်းရန် လိုအပ်ပါသည်" }), {
          status: 400, headers: corsHeaders
        });
      }

      await env.DB.prepare(`
        INSERT INTO "Inventory" (date, location, category, description, unit, qty, remark, month_year, book_name, unique_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Inventory', ?)
      `).bind(date, location, category, description, unit, qty, remark, month_year, unique_id).run();

      return new Response(JSON.stringify({ success: true, message: "ပစ္စည်းစာရင်း သိမ်းဆည်းပြီးပါပြီ", unique_id }), {
        headers: corsHeaders
      });

    } catch (err) {
      console.error("[D1 Inventory Insert Error]:", err);
      return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: corsHeaders });
    }
  }

  // 3. PUT /api/inventory
  if (method === 'PUT') {
    try {
      const body = await request.json();
      const unique_id = body.unique_id || body.uniqueId;
      const id = body.id;

      if (!unique_id && !id) {
        return new Response(JSON.stringify({ success: false, error: "Missing unique_id or id" }), { status: 400, headers: corsHeaders });
      }

      const date = body.entry_date || body.date;
      const location = body.location;
      const category = body.category;
      const description = body.description || body.item_name || body.item_desc || '';
      const unit = body.unit || 'ခု';
      const qty = parseFloat(body.qty) || 0;
      const remark = body.remark || body.note || '';
      const month_year = date ? date.substring(0, 7) : '';

      if (unique_id) {
        await env.DB.prepare(`
          UPDATE "Inventory"
          SET date = ?, location = ?, category = ?, description = ?, unit = ?, qty = ?, remark = ?, month_year = ?, updated_at = datetime('now')
          WHERE unique_id = ?
        `).bind(date, location, category, description, unit, qty, remark, month_year, unique_id).run();
      } else {
        await env.DB.prepare(`
          UPDATE "Inventory"
          SET date = ?, location = ?, category = ?, description = ?, unit = ?, qty = ?, remark = ?, month_year = ?, updated_at = datetime('now')
          WHERE id = ?
        `).bind(date, location, category, description, unit, qty, remark, month_year, id).run();
      }

      return new Response(JSON.stringify({ success: true, message: "ပစ္စည်းစာရင်း ပြင်ဆင်ပြီးပါပြီ" }), { headers: corsHeaders });

    } catch (err) {
      console.error("[D1 Inventory Update Error]:", err);
      return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: corsHeaders });
    }
  }

  // 4. DELETE /api/inventory
  if (method === 'DELETE') {
    try {
      let unique_id = url.searchParams.get('unique_id') || url.searchParams.get('uniqueId');
      let id = url.searchParams.get('id');

      if (!unique_id && !id) {
        try {
          const body = await request.json();
          unique_id = body.unique_id || body.uniqueId;
          id = body.id;
        } catch (_) {}
      }

      if (unique_id) {
        await env.DB.prepare(`DELETE FROM "Inventory" WHERE unique_id = ?`).bind(unique_id).run();
      } else if (id) {
        await env.DB.prepare(`DELETE FROM "Inventory" WHERE id = ?`).bind(id).run();
      } else {
        return new Response(JSON.stringify({ success: false, error: "Missing unique_id or id" }), { status: 400, headers: corsHeaders });
      }

      return new Response(JSON.stringify({ success: true, message: "ပစ္စည်းစာရင်း ဖျက်ပစ်ပြီးပါပြီ" }), { headers: corsHeaders });

    } catch (err) {
      console.error("[D1 Inventory Delete Error]:", err);
      return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: corsHeaders });
    }
  }

  return new Response(JSON.stringify({ success: false, error: "Method not supported" }), { status: 405, headers: corsHeaders });
}
