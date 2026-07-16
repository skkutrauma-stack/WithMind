const DEFAULT_CONFIG = Object.freeze({
  url: '',
  anonKey: '',
  restUrl: '',
  functionsUrl: '',
  authUrl: '',
  storageUrl: '',
  configured: false,
});

function readMetaContent(name) {
  if (typeof document === 'undefined') return '';
  const metas = document.querySelectorAll('meta[name]');
  for (const meta of metas) {
    if (meta.getAttribute('name') === name) {
      return (meta.getAttribute('content') || '').trim();
    }
  }
  return '';
}

function normalizeUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

export function readSupabaseConfig(overrides = {}) {
  const win = typeof window === 'undefined' ? globalThis : window;
  const directConfig = win.__WITHMIND_SUPABASE_CONFIG__ || win.__SUPABASE_CONFIG__ || {};
  const url = normalizeUrl(
    overrides.url ||
      directConfig.url ||
      win.__WITHMIND_SUPABASE_URL__ ||
      readMetaContent('supabase-url') ||
      readMetaContent('withmind-supabase-url')
  );
  const functionsUrl = normalizeUrl(
    overrides.functionsUrl ||
      directConfig.functionsUrl ||
      win.__WITHMIND_SUPABASE_FUNCTIONS_URL__ ||
      readMetaContent('supabase-functions-url') ||
      readMetaContent('withmind-supabase-functions-url') ||
      (url ? `${url}/functions/v1` : '')
  );
  const anonKey =
    overrides.anonKey ||
    directConfig.anonKey ||
    win.__WITHMIND_SUPABASE_ANON_KEY__ ||
    readMetaContent('supabase-anon-key') ||
    readMetaContent('withmind-supabase-anon-key') ||
    '';

  if (!url || !anonKey) {
    return {
      ...DEFAULT_CONFIG,
      url,
      anonKey,
      restUrl: url ? `${url}/rest/v1` : '',
      functionsUrl,
      authUrl: url ? `${url}/auth/v1` : '',
      storageUrl: url ? `${url}/storage/v1` : '',
      configured: false,
    };
  }

  return {
    url,
    anonKey,
    restUrl: `${url}/rest/v1`,
    functionsUrl,
    authUrl: `${url}/auth/v1`,
    storageUrl: `${url}/storage/v1`,
    configured: true,
  };
}

export function readSupabaseAuthToken() {
  for (const storage of [typeof localStorage !== 'undefined' ? localStorage : null, typeof sessionStorage !== 'undefined' ? sessionStorage : null]) {
    if (!storage) continue;
    try {
      const parsed = JSON.parse(storage.getItem('withmind:supabase-session') || 'null');
      const token = parsed?.access_token || parsed?.session?.access_token || '';
      if (typeof token === 'string' && token.trim()) return token.trim();
    } catch {
      // continue with the standard Supabase storage keys
    }
  }
  const candidates = [];
  const storages = [];
  if (typeof localStorage !== 'undefined') storages.push(localStorage);
  if (typeof sessionStorage !== 'undefined') storages.push(sessionStorage);

  for (const storage of storages) {
    try {
      for (let i = 0; i < storage.length; i += 1) {
        const key = storage.key(i);
        if (!key || !/sb-.*-auth-token/i.test(key)) continue;
        candidates.push(storage.getItem(key) || '');
      }
    } catch {
      continue;
    }
  }

  for (const raw of candidates) {
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === 'string' && parsed.trim()) return parsed.trim();
      if (parsed && typeof parsed === 'object') {
        const token =
          parsed.access_token ||
          parsed.currentSession?.access_token ||
          parsed.session?.access_token ||
          parsed.token ||
          '';
        if (typeof token === 'string' && token.trim()) return token.trim();
      }
    } catch {
      if (raw.trim()) return raw.trim();
    }
  }

  return typeof globalThis.__WITHMIND_ACCESS_TOKEN__ === 'string'
    ? globalThis.__WITHMIND_ACCESS_TOKEN__.trim()
    : '';
}

export function buildSupabaseHeaders(config = readSupabaseConfig(), extraHeaders = {}) {
  const token = readSupabaseAuthToken();
  const headers = {
    apikey: config.anonKey,
    Authorization: `Bearer ${token || config.anonKey}`,
    'X-Client-Info': 'withmind-browser',
    ...extraHeaders,
  };
  if (!headers.Accept) headers.Accept = 'application/json';
  return headers;
}
