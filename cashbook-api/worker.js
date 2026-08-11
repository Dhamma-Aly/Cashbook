// ===================================================================
// cashbook-api/worker.js - Cloudflare Worker Main Entry Point
// Authenticates Username & Password directly against D1 'users' table
// ===================================================================

import { handleYogiRequests } from './handlers-yogi.js';
import { handleBookRequests } from './handlers-books.js';
import { handleReportRequests } from './handlers-report.js';

// Global CORS Headers Helper
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json'
  };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // 1. Handle CORS Preflight OPTIONS Request
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders()
      });
    }

    try {
      // 2. Secure D1 Database Login Endpoint (/api/login)
      if (pathname === '/api/login' && request.method === 'POST') {
        const body = await request.json();
        const { username, password } = body;

        if (!username || !password) {
          return new Response(
            JSON.stringify({ success: false, error: 'အသုံးပြုသူအမည် နှင့် လျှို့ဝှက်နံပါတ် ဖြည့်သွင်းပါ' }),
            { status: 400, headers: corsHeaders() }
          );
        }

        // Query Cloudflare D1 Database 'users' Table directly!
        const userRow = await env.DB.prepare(
          'SELECT id, username, role FROM users WHERE username = ? AND password = ?'
        ).bind(username, password).first();

        if (userRow) {
          return new Response(
            JSON.stringify({
              success: true,
              user: {
                id: userRow.id,
                username: userRow.username,
                role: userRow.role,
                loginTime: new Date().toISOString()
              }
            }),
            { status: 200, headers: corsHeaders() }
          );
        } else {
          return new Response(
            JSON.stringify({ success: false, error: 'အသုံးပြုသူအမည် သို့မဟုတ် လျှို့ဝှက်နံပါတ် မှားယွင်းနေပါသည်' }),
            { status: 401, headers: corsHeaders() }
          );
        }
      }

      // 3. Route Yogi Management API Requests (12Yogi & 13Yogi)
      if (pathname.startsWith('/api/yogi')) {
        return await handleYogiRequests(request, env, pathname);
      }

      // 4. Route Summary Report API Requests (14Rep)
      if (pathname.startsWith('/api/report')) {
        return await handleReportRequests(request, env, pathname);
      }

      // 5. Route Cashbooks, Inventory & Home Dashboard API Requests
      if (
        pathname.startsWith('/api/entries') ||
        pathname.startsWith('/api/inventory') ||
        pathname.startsWith('/api/home-summary')
      ) {
        return await handleBookRequests(request, env, pathname);
      }

      // Fallback 404 Route Not Found
      return new Response(
        JSON.stringify({ success: false, error: 'Sāsana ERP API - Route ရှာမတွေ့ပါ' }),
        { status: 404, headers: corsHeaders() }
      );

    } catch (err) {
      return new Response(
        JSON.stringify({ success: false, error: err.message || 'Server Internal Error' }),
        { status: 500, headers: corsHeaders() }
      );
    }
  }
};
