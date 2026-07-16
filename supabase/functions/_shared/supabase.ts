import { HttpError } from './errors.ts';
import type { PromptTemplateRow, SupabaseEnv } from './types.ts';

function buildHeaders(env: SupabaseEnv, token = env.SUPABASE_SERVICE_ROLE_KEY, extra: HeadersInit = {}) {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...extra,
  };
}

export async function requestJson(env: SupabaseEnv, path: string, init: RequestInit = {}, token = env.SUPABASE_SERVICE_ROLE_KEY) {
  const response = await fetch(`${env.SUPABASE_URL}${path}`, {
    ...init,
    headers: buildHeaders(env, token, init.headers || {}),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new HttpError(response.status, text || response.statusText);
  }
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function rpc<T>(env: SupabaseEnv, functionName: string, body: Record<string, unknown> = {}, token = env.SUPABASE_SERVICE_ROLE_KEY) {
  return await requestJson(env, `/rest/v1/rpc/${encodeURIComponent(functionName)}`, {
    method: 'POST',
    body: JSON.stringify(body),
  }, token) as T;
}

export async function getActivePromptTemplate(env: SupabaseEnv, promptType: string) {
  const rows = await requestJson(
    env,
    `/rest/v1/llm_prompt_templates?select=*&prompt_type=eq.${encodeURIComponent(promptType)}&active=eq.true&order=version_no.desc&limit=1`,
    { method: 'GET' }
  ) as PromptTemplateRow[] | null;

  const template = rows?.[0];
  if (!template) {
    throw new HttpError(404, `active prompt template not found for ${promptType}`);
  }
  return template;
}

export async function selectOne<T>(env: SupabaseEnv, path: string, token = env.SUPABASE_SERVICE_ROLE_KEY) {
  const rows = await requestJson(env, path, { method: 'GET' }, token) as T[] | null;
  return rows?.[0] ?? null;
}

export async function selectMany<T>(env: SupabaseEnv, path: string, token = env.SUPABASE_SERVICE_ROLE_KEY) {
  return (await requestJson(env, path, { method: 'GET' }, token) as T[] | null) || [];
}

export async function assertFlowOwner(env: SupabaseEnv, flowId: string, userId: string, partType: string) {
  const row = await selectOne<Record<string, unknown>>(
    env,
    `/rest/v1/activity_flows?select=flow_id,status&flow_id=eq.${encodeURIComponent(flowId)}&user_id=eq.${encodeURIComponent(userId)}&part_type=eq.${encodeURIComponent(partType)}&limit=1`,
  );
  if (!row) throw new HttpError(403, 'flow is not available');
  return row;
}

export async function insertRows<T>(
  env: SupabaseEnv,
  table: string,
  rows: Record<string, unknown> | Record<string, unknown>[],
  options: { upsert?: boolean; onConflict?: string; returning?: boolean } = {},
) {
  const query = new URLSearchParams();
  if (options.onConflict) query.set('on_conflict', options.onConflict);
  const suffix = query.size ? `?${query.toString()}` : '';
  const prefer = [
    options.upsert ? 'resolution=merge-duplicates' : '',
    options.returning === false ? 'return=minimal' : 'return=representation',
  ].filter(Boolean).join(',');
  return await requestJson(env, `/rest/v1/${encodeURIComponent(table)}${suffix}`, {
    method: 'POST',
    headers: { Prefer: prefer },
    body: JSON.stringify(rows),
  }) as T;
}

export async function updateRows<T>(
  env: SupabaseEnv,
  table: string,
  filters: Record<string, string | number | boolean>,
  patch: Record<string, unknown>,
  returning = true,
) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    query.set(key, `eq.${String(value)}`);
  }
  return await requestJson(env, `/rest/v1/${encodeURIComponent(table)}?${query.toString()}`, {
    method: 'PATCH',
    headers: { Prefer: returning ? 'return=representation' : 'return=minimal' },
    body: JSON.stringify(patch),
  }) as T;
}
