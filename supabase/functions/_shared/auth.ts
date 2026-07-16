import { HttpError } from './errors.ts';
import type { SupabaseEnv, SupabaseUser } from './types.ts';

export function getBearerToken(req: Request) {
  const header = req.headers.get('authorization') || req.headers.get('Authorization') || '';
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : '';
}

export async function requireUser(req: Request, env: SupabaseEnv): Promise<SupabaseUser> {
  const token = getBearerToken(req);
  if (!token) {
    throw new HttpError(401, 'authorization bearer token is required');
  }

  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: env.SUPABASE_ANON_KEY || env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new HttpError(401, 'failed to authenticate user');
  }

  const user = await response.json().catch(() => null);
  if (!user || typeof user !== 'object' || !('id' in user)) {
    throw new HttpError(401, 'failed to load authenticated user');
  }

  return user as SupabaseUser;
}
