// ===================================================================
// cashbook-api/worker.js - Main Cloudflare Worker Entry Point & Router
// Imports all modular handlers and handles CORS & Authentication
// ===================================================================

import { handleBankRequests } from './handlers-banks.js';
import { handleBookRequests } from './handlers-books.js';
import { handleDashboardRequests } from './handlers-dashboard.js';
import { handleInventoryRequests } from './handlers-inventory.js';
import { handleYogiRequests } from './handlers-yogi.js';
import { handleReportRequests } from './handlers-reports.js';

// Global CORS Headers (Frontend မှ API ခေါ်ယူနိုင်ရန်)
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const method = request.method;

    // ---------------------------------------------------------------
    // 1. Handle Preflight CORS Request (OPTIONS Method)
    // ---------------------------------------------------------------
    if (method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    try {
      // -------------------------------------------------------------
      // 2. Auth Endpoint: POST /api/login (D1 'users' Table တွင် တိုက်စစ်ခြင်း)
      // -------------------------------------------------------------
      if (pathname === '/api/login') {
        if (method !== 'POST') {
          return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), {
            status: 405,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const body = await request.json();
        const username = (body.username || '').trim();
        const password = (body.password || '').trim();

        if (!username || !password) {
          return new Response(JSON.stringify({ success: false, error: 'Username and password required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // D1 Database ထဲရှိ users Table တွင် Username & Password တိုက်စစ်ခြင်း
        const { results } = await env.DB.prepare(
          `SELECT id, username, role FROM users WHERE username = ? AND password = ? LIMIT 1`
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
              role: user.role || 'Staff'
            },
            expiresInMs: 24 * 60 * 60 * 1000 // 24 Hours Session
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        } else {
          return new Response(JSON.stringify({
            success: false,
            error: 'အသုံးပြုသူအမည် သို့မဟုတ် လျှို့ဝှက်နံပါတ် မှားယွင်းနေပါသည်။'
          }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      // JSON Response Headers
      const jsonCorsHeaders = {
        ...corsHeaders,
        'Content-Type': 'application/json',
      };

      // -------------------------------------------------------------
      // 3. API Router: URL Path အလိုက် သက်ဆိုင်ရာ Handlers သို့ ပို့ဆောင်ခြင်း
      // -------------------------------------------------------------
      
      // Dashboard Summary Endpoint
      if (pathname === '/api/home-summary') {
        return await handleDashboardRequests(request, env, jsonCorsHeaders);
      }

      // Cashbooks & Banks Endpoint
      if (pathname === '/api/entries') {
        const sheet = url.searchParams.get('sheet') || '';
        const BANK_SHEETS = ['1CB', '2CB', '3CB'];

        if (BANK_SHEETS.includes(sheet)) {
          return await handleBankRequests(request, env, jsonCorsHeaders);
        } else {
          return await handleBookRequests(request, env, jsonCorsHeaders);
        }
      }

      // Inventory Endpoint
      if (pathname === '/api/inventory') {
        return await handleInventoryRequests(request, env, jsonCorsHeaders);
      }

      // Yogi Management Endpoint
      if (pathname.startsWith('/api/yogi')) {
        return await handleYogiRequests(request, env, jsonCorsHeaders);
      }

      // Report Summary Endpoint
      if (pathname === '/api/report') {
        return await handleReportRequests(request, env, jsonCorsHeaders);
      }

      // -------------------------------------------------------------
      // 4. Fallback 404 Route
      // -------------------------------------------------------------
      return new Response(JSON.stringify({ success: false, error: 'Endpoint not found' }), {
        status: 404,
        headers: jsonCorsHeaders,
      });

    } catch (err) {
      console.error('[Worker Unhandled Error]:', err);
      return new Response(JSON.stringify({ success: false, error: err.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }
};