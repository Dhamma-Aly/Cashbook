// ===================================================================
// cashbook-api/worker.js - Main Cloudflare Worker Entry Point & Router
// Imports all modular handlers and handles CORS, Auth & Offline Sync
// ===================================================================

import { handleBankRequests } from './handlers-banks.js';
import { handleDashboardRequests } from './handlers-dashboard.js';
import { handleInventoryRequests } from './handlers-inventory.js';
import { handleYogiRequests } from './handlers-yogi.js';
import { handleReportRequests } from './handlers-reports.js';

// Global CORS Headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

const jsonCorsHeaders = {
  ...corsHeaders,
  'Content-Type': 'application/json; charset=utf-8',
};

// 🔒 SECURITY HELPER: Validate Authorization Bearer Token & Expiry
function isValidToken(request) {
  const authHeader = request.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return false;
  
  const token = authHeader.substring(7).trim();
  if (!token || !token.startsWith("tok_")) return false;

  // Extract Token Timestamp 'tok_{id}_{timestamp}_{rand}'
  const parts = token.split("_");
  if (parts.length >= 3) {
    const tokenTime = parseInt(parts[2]);
    const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24-hour Session
    if (isNaN(tokenTime) || (Date.now() - tokenTime) > MAX_AGE_MS) {
      return false; // Token expired
    }
  }
  return true;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const method = request.method;

    // ---------------------------------------------------------------
    // 1. Handle Preflight CORS Request (OPTIONS)
    // ---------------------------------------------------------------
    if (method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    try {
      // -------------------------------------------------------------
      // 2. Auth Endpoint: POST /api/login (Public)
      // -------------------------------------------------------------
      if (pathname === '/api/login') {
        if (method !== 'POST') {
          return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), {
            status: 405,
            headers: jsonCorsHeaders,
          });
        }

        const body = await request.json();
        const username = (body.username || '').trim();
        const password = (body.password || '').trim();

        if (!username || !password) {
          return new Response(JSON.stringify({ success: false, error: 'Username and password required' }), {
            status: 400,
            headers: jsonCorsHeaders,
          });
        }

        // Query D1 "users" table
        const { results } = await env.DB.prepare(
          `SELECT id, username, role, name FROM "users" WHERE username = ? AND password_hash = ? LIMIT 1`
        ).bind(username, password).all();

        if (results && results.length > 0) {
          const user = results[0];
          const token = `tok_${user.id}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

          return new Response(JSON.stringify({
            success: true,
            token,
            user: {
              id: user.id,
              username: user.username,
              role: user.role || 'Staff',
              name: user.name || user.username
            },
            expiresInMs: 24 * 60 * 60 * 1000 // 24-hour Session
          }), {
            headers: jsonCorsHeaders,
          });
        } else {
          return new Response(JSON.stringify({
            success: false,
            error: 'အသုံးပြုသူအမည် သို့မဟုတ် လျှို့ဝှက်နံပါတ် မှားယွင်းနေပါသည်။'
          }), {
            status: 401,
            headers: jsonCorsHeaders,
          });
        }
      }

      // -------------------------------------------------------------
      // 🔒 3. SECURITY GATEWAY: Protected Endpoints Token Check
      // -------------------------------------------------------------
      if (!isValidToken(request)) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Unauthorized: စနစ်အသုံးပြုရန် Login ပြန်လည်ဝင်ရောက်ပေးပါခင်ဗျာ။'
        }), {
          status: 401,
          headers: jsonCorsHeaders,
        });
      }

      // -------------------------------------------------------------
      // 4. OFFLINE BATCH SYNC API: POST /api/sync
      // (အင်တာနက် ပြန်ရချိန် နောက်ကွယ်မှ Auto Sync လုပ်ပေးမည့် Engine)
      // -------------------------------------------------------------
      if (pathname === '/api/sync' && method === 'POST') {
        const { queue } = await request.json();
        if (!Array.isArray(queue) || queue.length === 0) {
          return new Response(JSON.stringify({ success: true, count: 0, results: [] }), {
            headers: jsonCorsHeaders,
          });
        }

        const results = [];
        for (const item of queue) {
          try {
            const { action, table, data, unique_id } = item;
            if (!table || !unique_id) continue;

            if (action === 'CREATE') {
              const keys = Object.keys(data).filter(k => k !== 'id');
              const placeholders = keys.map(() => '?').join(', ');
              const values = keys.map(k => data[k]);
              const colNames = keys.map(k => `"${k}"`).join(', ');

              await env.DB.prepare(
                `INSERT OR REPLACE INTO "${table}" (${colNames}) VALUES (${placeholders})`
              ).bind(...values).run();

              results.push({ unique_id, status: 'synced' });
            } else if (action === 'UPDATE') {
              const keys = Object.keys(data).filter(k => k !== 'id' && k !== 'unique_id');
              const setClause = keys.map(k => `"${k}" = ?`).join(', ');
              const values = [...keys.map(k => data[k]), unique_id];

              await env.DB.prepare(
                `UPDATE "${table}" SET ${setClause}, updated_at = datetime('now') WHERE unique_id = ?`
              ).bind(...values).run();

              results.push({ unique_id, status: 'updated' });
            } else if (action === 'DELETE') {
              await env.DB.prepare(`DELETE FROM "${table}" WHERE unique_id = ?`).bind(unique_id).run();
              results.push({ unique_id, status: 'deleted' });
            }
          } catch (err) {
            console.error(`[Sync Item Error]:`, err);
            results.push({ unique_id: item.unique_id, status: 'error', error: err.message });
          }
        }

        return new Response(JSON.stringify({ success: true, count: results.length, results }), {
          headers: jsonCorsHeaders,
        });
      }

      // -------------------------------------------------------------
      // 5. Authorized Modular API Router
      // -------------------------------------------------------------
      // Dashboard Summary Router
      if (pathname === '/api/home-summary') {
        return await handleDashboardRequests(request, env, jsonCorsHeaders);
      }

      // Bank & Ledger Books Router (1CB မှ 10GB အထိ ၁၀ အုပ်လုံး)
      if (pathname === '/api/entries') {
        return await handleBankRequests(request, env, jsonCorsHeaders);
      }

      // Inventory Router
      if (pathname === '/api/inventory') {
        return await handleInventoryRequests(request, env, jsonCorsHeaders);
      }

      // Yogi Router (Permanent & Camp Yogi)
      if (pathname.startsWith('/api/yogi')) {
        return await handleYogiRequests(request, env, jsonCorsHeaders);
      }

      // Financial Reports Router
      if (pathname === '/api/report') {
        return await handleReportRequests(request, env, jsonCorsHeaders);
      }

      return new Response(JSON.stringify({ success: false, error: 'Endpoint not found' }), {
        status: 404,
        headers: jsonCorsHeaders,
      });

    } catch (err) {
      console.error('[Worker Unhandled Error]:', err);
      return new Response(JSON.stringify({ success: false, error: err.message }), {
        status: 500,
        headers: jsonCorsHeaders,
      });
    }
  }
};
