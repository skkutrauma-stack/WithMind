function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Max-Age': '86400',
  };
}

function sendJson(res, status, body, extraHeaders = {}) {
  res.statusCode = status;
  for (const [key, value] of Object.entries({
    'Content-Type': 'application/json; charset=utf-8',
    ...corsHeaders(),
    ...extraHeaders,
  })) res.setHeader(key, value);
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  if (!chunks.length) return {};
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  return raw ? JSON.parse(raw) : {};
}

function getBearerToken(req) {
  const header = req.headers.authorization || req.headers.Authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(String(header).trim());
  return match ? match[1].trim() : '';
}

function getEnv() {
  const url = String(
    process.env.WITHMIND_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    process.env.supabse_API_URL ||
    '',
  ).trim().replace(/\/+$/, '');
  const serviceRoleKey = String(
    process.env.WITHMIND_SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.supabase_service_roll_key ||
    '',
  ).trim();
  return { url, serviceRoleKey };
}

async function requireUser(req, env) {
  const token = getBearerToken(req);
  if (!token) throw Object.assign(new Error('authorization bearer token is required'), { status: 401 });
  const response = await fetch(`${env.url}/auth/v1/user`, {
    headers: { apikey: env.serviceRoleKey, Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!response.ok) throw Object.assign(new Error('failed to authenticate user'), { status: 401 });
  const user = await response.json().catch(() => null);
  if (!user?.id) throw Object.assign(new Error('failed to load authenticated user'), { status: 401 });
  return user;
}

async function requestJson(env, path, init = {}) {
  const response = await fetch(`${env.url}${path}`, {
    ...init,
    headers: {
      apikey: env.serviceRoleKey,
      Authorization: `Bearer ${env.serviceRoleKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(init.headers || {}),
    },
  });
  const raw = await response.text();
  if (!response.ok) throw Object.assign(new Error(raw || response.statusText), { status: response.status });
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return raw; }
}

function rpc(env, name, body = {}) {
  return requestJson(env, `/rest/v1/rpc/${encodeURIComponent(name)}`, { method: 'POST', body: JSON.stringify(body) });
}

async function selectMany(env, path) {
  return (await requestJson(env, path, { method: 'GET' })) || [];
}

async function selectOne(env, path) {
  return (await selectMany(env, path))[0] || null;
}

function insertRows(env, table, rows, { upsert = false, onConflict = '', returning = false } = {}) {
  const query = onConflict ? `?on_conflict=${encodeURIComponent(onConflict)}` : '';
  const prefer = [upsert ? 'resolution=merge-duplicates' : '', returning ? 'return=representation' : 'return=minimal'].filter(Boolean).join(',');
  return requestJson(env, `/rest/v1/${encodeURIComponent(table)}${query}`, {
    method: 'POST', headers: { Prefer: prefer }, body: JSON.stringify(rows),
  });
}

function updateRows(env, table, filters, patch, returning = false) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) query.set(key, `eq.${String(value)}`);
  return requestJson(env, `/rest/v1/${encodeURIComponent(table)}?${query}`, {
    method: 'PATCH',
    headers: { Prefer: returning ? 'return=representation' : 'return=minimal' },
    body: JSON.stringify(patch),
  });
}

async function assertFlowOwner(env, flowId, userId, partType) {
  const row = await selectOne(env, `/rest/v1/activity_flows?select=flow_id,status&flow_id=eq.${encodeURIComponent(flowId)}&user_id=eq.${encodeURIComponent(userId)}&part_type=eq.${encodeURIComponent(partType)}&limit=1`);
  if (!row) throw Object.assign(new Error('flow is not available'), { status: 403 });
  return row;
}

async function proxyLlm(req, res, partType, functionName) {
  if (req.method === 'OPTIONS') return sendJson(res, 204, {});
  const env = getEnv();
  if (!env.url || !env.serviceRoleKey) return sendJson(res, 500, { ok: false, error: 'Supabase environment variables are missing' });
  try {
    const user = await requireUser(req, env);
    const body = await readJson(req);
    const flowId = String(body?.flowId || body?.flow_id || '').trim();
    if (!flowId) throw Object.assign(new Error('flowId is required'), { status: 400 });
    await assertFlowOwner(env, flowId, user.id, partType);
    const response = await fetch(`${env.url}/functions/v1/${functionName}`, {
      method: 'POST',
      headers: {
        apikey: env.serviceRoleKey,
        Authorization: `Bearer ${getBearerToken(req)}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ flowId }),
    });
    const payload = await response.text();
    res.writeHead(response.status, { ...corsHeaders(), 'Content-Type': response.headers.get('content-type') || 'application/json; charset=utf-8' });
    res.end(payload);
  } catch (error) {
    sendJson(res, Number(error?.status || 500), { ok: false, error: error?.message || 'internal server error' });
  }
}

module.exports = {
  assertFlowOwner,
  corsHeaders,
  getBearerToken,
  getEnv,
  insertRows,
  proxyLlm,
  readJson,
  requireUser,
  requestJson,
  rpc,
  selectMany,
  selectOne,
  sendJson,
  updateRows,
};
