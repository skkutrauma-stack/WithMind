const {
  getEnv,
  readJson,
  requestJson,
  sendJson,
} = require('./_lib/supabase');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function httpError(status, message, code) {
  return Object.assign(new Error(message), { status, code });
}

async function createSession(env, email, password) {
  return requestJson(env, '/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

function isRegisteredUserError(error) {
  const message = String(error?.message || '');
  return /user_already_exists|email_exists|already (?:been )?registered|already exists|user (?:already )?exists/i.test(message);
}

function isUnconfirmedUserError(error) {
  return /email_not_confirmed|email not confirmed/i.test(String(error?.message || ''));
}

async function confirmExistingUser(env, email) {
  const profiles = await requestJson(
    env,
    `/rest/v1/profiles?select=user_id&email=eq.${encodeURIComponent(email)}&limit=1`,
    { method: 'GET' },
  );
  const userId = profiles?.[0]?.user_id;
  if (!userId) throw httpError(409, '가입 정보를 찾지 못했어요. 다른 이메일로 다시 시도해 주세요.', 'unconfirmed_user_not_found');
  await requestJson(env, `/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: 'PUT',
    body: JSON.stringify({ email_confirm: true }),
  });
}

module.exports = async function authSignup(req, res) {
  if (req.method === 'OPTIONS') return sendJson(res, 204, {});
  if (req.method !== 'POST') return sendJson(res, 405, { ok: false, code: 'method_not_allowed', error: 'POST 요청만 지원합니다.' });

  const env = getEnv();
  if (!env.url || !env.serviceRoleKey) {
    return sendJson(res, 500, { ok: false, code: 'auth_not_configured', error: '회원가입 서버 설정이 누락되었습니다.' });
  }

  try {
    const body = await readJson(req);
    const email = String(body?.email || '').trim().toLowerCase();
    const password = String(body?.password || '');
    const nickname = String(body?.nickname || '').trim();

    if (!EMAIL_PATTERN.test(email)) throw httpError(400, '이메일 형식을 확인해 주세요.', 'invalid_email');
    if (password.length < 8) throw httpError(400, '비밀번호는 8자 이상이어야 합니다.', 'weak_password');
    if (!nickname) throw httpError(400, '별명을 입력해 주세요.', 'missing_nickname');
    if (nickname.length > 40) throw httpError(400, '별명은 40자 이하로 입력해 주세요.', 'nickname_too_long');

    // A repeated click after a successful request should return the existing session
    // instead of creating another account or sending another confirmation email.
    try {
      const session = await createSession(env, email, password);
      return sendJson(res, 200, { ok: true, existing: true, session });
    } catch (error) {
      if (isUnconfirmedUserError(error)) {
        // GoTrue checks the password before returning email_not_confirmed.
        // Complete the interrupted confirmation, then issue the normal session.
        await confirmExistingUser(env, email);
        const session = await createSession(env, email, password);
        return sendJson(res, 200, { ok: true, existing: true, recovered: true, session });
      }
      // Continue when the credentials do not belong to an existing account.
    }

    let user;
    try {
      user = await requestJson(env, '/auth/v1/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          email,
          password,
          email_confirm: true,
          user_metadata: { nickname },
        }),
      });
    } catch (error) {
      if (isRegisteredUserError(error)) {
        throw httpError(409, '이미 가입된 이메일이에요. 로그인 화면에서 로그인해 주세요.', 'email_already_registered');
      }
      throw error;
    }

    const session = await createSession(env, email, password);
    return sendJson(res, 201, {
      ok: true,
      existing: false,
      user: { id: user?.id || session?.user?.id || null, email },
      session,
    });
  } catch (error) {
    return sendJson(res, Number(error?.status || 500), {
      ok: false,
      code: error?.code || 'signup_failed',
      error: error?.message || '회원가입 중 문제가 발생했습니다.',
    });
  }
};
