// ===================================================================
// cashbook-api/worker.js - Cloudflare Worker Main Entry Point
// Routes incoming HTTP requests to modular handlers:
//   1. handlers-yogi.js   -> /api/yogi
//   2. handlers-books.js  -> /api/entries, /api/inventory, /api/home-summary
//   3. handlers-report.js -> /api/report
// ===================================================================

import { handleYogiRequests } from './handlers-yogi.js';
import { handleBookRequests } from './handlers-books.js';
import { handleReportRequests } from './handlers-report.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Handle CORS Preflight OPTIONS Request
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400'
        }
      });
    }

    try {
      // 1. Route Yogi Management API Requests (12Yogi & 13Yogi)
      if (pathname.startsWith('/api/yogi')) {
        return await handleYogiRequests(request, env, pathname);
      }

      // 2. Route Summary Report API Requests (14Rep)
      if (pathname.startsWith('/api/report')) {
        return await handleReportRequests(request, env, pathname);
      }

      // 3. Route Cashbooks, Inventory & Home Dashboard API Requests
      if (
        pathname.startsWith('/api/entries') ||
        pathname.startsWith('/api/inventory') ||
        pathname.startsWith('/api/home-summary')
      ) {
        return await handleBookRequests(request, env, pathname);
      }

      // Fallback 404 Not Found
      return new Response(
        JSON.stringify({ success: false, error: 'Sāsana ERP API - Route ရှာမတွေ့ပါ' }),
        {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        }
      );
    } catch (err) {
      return new Response(
        JSON.stringify({ success: false, error: err.message || 'Server Internal Error' }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        }
      );
    }
  }
};