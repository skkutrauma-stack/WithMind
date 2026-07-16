import { buildSupabaseHeaders, readSupabaseConfig } from './supabase-config.js';

function resolveUrl(baseUrl, path) {
  if (/^https?:\/\//i.test(path) || String(path || '').startsWith('/')) return path;
  const trimmedBase = String(baseUrl || '').replace(/\/+$/, '');
  const trimmedPath = String(path || '').replace(/^\/+/, '');
  return `${trimmedBase}/${trimmedPath}`;
}

async function parseResponse(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

const SESSION_KEY = 'withmind:supabase-session';

function persistSession(session) {
  try {
    if (session?.access_token) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    // Storage can be unavailable in private browsing; the in-memory response still works.
  }
}

async function authRequest(config, path, body) {
  if (!config.configured) throw new Error('Supabase is not configured');
  const response = await fetch(`${config.authUrl}/${path}`, {
    method: 'POST',
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${config.anonKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await parseResponse(response);
  if (!response.ok) {
    const message = data?.msg || data?.message || data?.error_description || data?.error || response.statusText;
    throw new Error(String(message));
  }
  return data;
}

async function request(config, path, options = {}) {
  if (!config.configured) {
    return {
      ok: false,
      status: 0,
      statusText: 'Supabase is not configured',
      json: async () => null,
      text: async () => '',
    };
  }

  const url = resolveUrl(config.url, path);
  const response = await fetch(url, {
    ...options,
    headers: buildSupabaseHeaders(config, options.headers || {}),
  });
  return response;
}

export function createSupabaseClient(overrides = {}) {
  const config = readSupabaseConfig(overrides);

  return {
    config,
    isConfigured: config.configured,
    auth: {
      async signUp({ email, password, nickname }) {
        if (!config.configured) throw new Error('Supabase is not configured');
        const response = await fetch(resolveUrl(config.functionsUrl, 'auth-signup'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({ email, password, nickname }),
        });
        const data = await parseResponse(response);
        if (!response.ok) {
          const message = data?.error || data?.message || response.statusText;
          const error = new Error(String(message));
          error.code = data?.code || 'signup_failed';
          throw error;
        }
        const session = data?.session || data;
        if (session?.access_token) persistSession(session);
        return session;
      },
      async signInWithPassword({ email, password }) {
        const data = await authRequest(config, 'token?grant_type=password', { email, password });
        persistSession(data);
        return data;
      },
      async signOut() {
        const token = (() => {
          try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null')?.access_token || ''; } catch { return ''; }
        })();
        if (token) {
          await fetch(`${config.authUrl}/logout`, {
            method: 'POST',
            headers: { apikey: config.anonKey, Authorization: `Bearer ${token}` },
          }).catch(() => null);
        }
        persistSession(null);
      },
      getSession() {
        try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
      },
    },
    request(path, options = {}) {
      return request(config, path, options);
    },
    async json(path, options = {}) {
      const response = await request(config, path, options);
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`Supabase request failed (${response.status}): ${body || response.statusText}`);
      }
      return parseResponse(response);
    },
    async rpc(name, body = {}, options = {}) {
      const response = await request(config, `${config.restUrl}/rpc/${encodeURIComponent(name)}`, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {}),
        },
        ...options,
      });
      if (!response.ok) {
        const message = await response.text().catch(() => '');
        throw new Error(`Supabase RPC ${name} failed (${response.status}): ${message || response.statusText}`);
      }
      return parseResponse(response);
    },
    async invoke(functionName, body = {}, options = {}) {
      const functionUrl = `${String(config.functionsUrl || '').replace(/\/+$/, '')}/${encodeURIComponent(functionName)}`;
      const response = await request(config, functionUrl, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {}),
        },
        ...options,
      });
      if (!response.ok) {
        const message = await response.text().catch(() => '');
        throw new Error(`Supabase function ${functionName} failed (${response.status}): ${message || response.statusText}`);
      }
      return parseResponse(response);
    },
  };
}

let cachedClient = null;

export function getSupabaseClient(overrides = {}) {
  if (!cachedClient) {
    cachedClient = createSupabaseClient(overrides);
  }
  return cachedClient;
}
