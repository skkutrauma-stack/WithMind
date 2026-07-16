import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(rootDir, '.env.local');
const port = Number(process.env.WITHMIND_PROXY_PORT || 8787);
const host = '127.0.0.1';

function parseEnvFile(raw) {
  const result = {};
  for (const line of String(raw || '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex < 0) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\''))) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

async function loadEnv() {
  const merged = {
    ...process.env,
  };
  if (existsSync(envPath)) {
    const fileEnv = parseEnvFile(await readFile(envPath, 'utf8'));
    for (const [key, value] of Object.entries(fileEnv)) {
      if (merged[key] === undefined || merged[key] === '') {
        merged[key] = value;
      }
    }
  }
  return merged;
}

const env = await loadEnv();
const supabaseUrl = String(env.WITHMIND_SUPABASE_URL || env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
const anonKey = String(env.WITHMIND_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || '').trim();
const serviceRoleKey = String(env.WITHMIND_SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

if (!supabaseUrl || !anonKey || !serviceRoleKey) {
  console.error('Missing Supabase configuration. Expected WITHMIND_SUPABASE_URL, WITHMIND_SUPABASE_ANON_KEY, and WITHMIND_SUPABASE_SERVICE_ROLE_KEY in .env.local.');
  process.exit(1);
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Max-Age': '86400',
  };
}

function sendJson(res, status, body, extraHeaders = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    ...corsHeaders(),
    ...extraHeaders,
  });
  res.end(payload);
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }
  if (!chunks.length) return {};
  const text = Buffer.concat(chunks).toString('utf8').trim();
  if (!text) return {};
  return JSON.parse(text);
}

function getBearerToken(req) {
  const header = req.headers.authorization || req.headers.Authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(String(header).trim());
  return match ? match[1].trim() : '';
}

async function requireUser(req) {
  const token = getBearerToken(req);
  if (!token) {
    const error = new Error('authorization bearer token is required');
    error.status = 401;
    throw error;
  }

  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const error = new Error('failed to authenticate user');
    error.status = 401;
    throw error;
  }

  const user = await response.json().catch(() => null);
  if (!user || typeof user !== 'object' || !user.id) {
    const error = new Error('failed to load authenticated user');
    error.status = 401;
    throw error;
  }

  return user;
}

function pick(payload, ...keys) {
  for (const key of keys) {
    const value = payload?.[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

async function supabaseSelectMany(pathname) {
  const response = await fetch(`${supabaseUrl}${pathname}`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Accept: 'application/json',
    },
  });
  const text = await response.text();
  if (!response.ok) {
    const error = new Error(text || response.statusText);
    error.status = response.status;
    throw error;
  }
  return text ? JSON.parse(text) : [];
}

async function handleAppApi(req, body) {
  const action = typeof body?.action === 'string' ? body.action : '';
  const payload = body?.payload && typeof body.payload === 'object' ? body.payload : {};
  if (!action) {
    const error = new Error('action is required');
    error.status = 400;
    throw error;
  }

  if (action === 'get_emi_ai_result') {
    const user = await requireUser(req);
    const flowId = pick(payload, 'flowId', 'flow_id');
    const select = 'flow_id,user_id,prompt_template_id,ai_comment,generated_at';
    const query = flowId
      ? `/rest/v1/emi_ai_results?select=${select}&flow_id=eq.${encodeURIComponent(String(flowId))}&user_id=eq.${encodeURIComponent(user.id)}&limit=1`
      : `/rest/v1/emi_ai_results?select=${select}&user_id=eq.${encodeURIComponent(user.id)}&order=generated_at.desc&limit=1`;
    const rows = await supabaseSelectMany(query);
    const row = rows[0] || null;
    return {
      ok: true,
      action,
      data: {
        ok: true,
        found: Boolean(row),
        result: row,
      },
      user_id: user.id,
    };
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/app-api`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${getBearerToken(req) || anonKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  return {
    status: response.status,
    headers: {
      'Content-Type': response.headers.get('content-type') || 'application/json; charset=utf-8',
    },
    body: text,
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${host}:${port}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders());
    res.end();
    return;
  }

  if (url.pathname === '/health') {
    sendJson(res, 200, {
      ok: true,
      service: 'withmind-local-proxy',
      port,
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/functions/v1/app-api') {
    try {
      const body = await readJson(req);
      const result = await handleAppApi(req, body);
      if (result?.body !== undefined) {
        res.writeHead(result.status || 200, {
          ...corsHeaders(),
          ...result.headers,
        });
        res.end(result.body);
        return;
      }
      sendJson(res, 200, result);
    } catch (error) {
      const status = Number(error?.status || 500);
      sendJson(res, status, {
        ok: false,
        error: error?.message || 'internal server error',
      });
    }
    return;
  }

  sendJson(res, 404, {
    ok: false,
    error: 'not found',
    path: url.pathname,
  });
});

server.listen(port, host, () => {
  console.log(`withmind local proxy listening on http://${host}:${port}`);
});
