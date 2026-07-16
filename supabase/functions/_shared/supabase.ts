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

async function requestJson(env: SupabaseEnv, path: string, init: RequestInit = {}, token = env.SUPABASE_SERVICE_ROLE_KEY) {
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
