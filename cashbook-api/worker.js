// ===================================================================
// cashbook-api/worker.js - Main Cloudflare Worker Entry Point & Router
// Imports all modular handlers and handles CORS & Security Authentication
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

        // Query D1 users table
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
            expiresInMs: 24 * 60 * 60 * 1000 // 24-hour Session
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

      // -------------------------------------------------------------
      // 🔒 3. SECURITY GATEWAY: Protected Endpoints Token Check
      // -------------------------------------------------------------
      if (!isValidToken(request)) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Unauthorized: မလုပ်ဆောင်မီ Login ပြန်လည်ဝင်ရောက်ပါခင်ဗျာ။'
        }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const jsonCorsHeaders = {
        ...corsHeaders,
        'Content-Type': 'application/json',
      };

      // -------------------------------------------------------------
      // 4. Authorized API Router
      // -------------------------------------------------------------
      if (pathname === '/api/home-summary') {
        return await handleDashboardRequests(request, env, jsonCorsHeaders);
      }

      // 💡 Route ALL cashbook & bank requests (1CB to 10GB) directly to handleBankRequests
      if (pathname === '/api/entries') {
        return await handleBankRequests(request, env, jsonCorsHeaders);
      }

      if (pathname === '/api/inventory') {
        return await handleInventoryRequests(request, env, jsonCorsHeaders);
      }

      if (pathname.startsWith('/api/yogi')) {
        return await handleYogiRequests(request, env, jsonCorsHeaders);
      }

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
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }
};
