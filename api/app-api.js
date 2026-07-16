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
  })) {
    res.setHeader(key, value);
  }
  res.end(JSON.stringify(body));
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

function pick(payload, ...keys) {
  for (const key of keys) {
    const value = payload?.[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

async function requireUser(req, env) {
  const token = getBearerToken(req);
  if (!token) {
    const error = new Error('authorization bearer token is required');
    error.status = 401;
    throw error;
  }

  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: env.SUPABASE_ANON_KEY,
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

async function selectMany(env, path) {
  const response = await fetch(`${env.SUPABASE_URL}${path}`, {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
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

async function handleAction(req, env, action, payload) {
  if (action === 'get_emi_ai_result') {
    const user = await requireUser(req, env);
    const flowId = pick(payload, 'flowId', 'flow_id');
    const select = 'flow_id,user_id,prompt_template_id,ai_comment,generated_at';
    const path = flowId
      ? `/rest/v1/emi_ai_results?select=${select}&flow_id=eq.${encodeURIComponent(String(flowId))}&user_id=eq.${encodeURIComponent(user.id)}&limit=1`
      : `/rest/v1/emi_ai_results?select=${select}&user_id=eq.${encodeURIComponent(user.id)}&order=generated_at.desc&limit=1`;
    const rows = await selectMany(env, path);
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

  const response = await fetch(`${env.SUPABASE_URL}/functions/v1/app-api`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${getBearerToken(req) || env.SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ action, payload }),
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

module.exports = async function appApi(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders());
    res.end();
    return;
  }

  const env = {
    SUPABASE_URL: process.env.WITHMIND_SUPABASE_URL || process.env.SUPABASE_URL || '',
    SUPABASE_ANON_KEY: process.env.WITHMIND_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '',
    SUPABASE_SERVICE_ROLE_KEY: process.env.WITHMIND_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  };

  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY || !env.SUPABASE_SERVICE_ROLE_KEY) {
    sendJson(res, 500, {
      ok: false,
      error: 'Supabase environment variables are missing',
    });
    return;
  }

  try {
    const body = await readJson(req);
    const action = typeof body?.action === 'string' ? body.action : '';
    const payload = body?.payload && typeof body.payload === 'object' ? body.payload : {};
    if (!action) {
      sendJson(res, 400, {
        ok: false,
        error: 'action is required',
      });
      return;
    }

    const result = await handleAction(req, env, action, payload);
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
    sendJson(res, Number(error?.status || 500), {
      ok: false,
      error: error?.message || 'internal server error',
    });
  }
};
