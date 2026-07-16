import {
  acceptConsent,
  completeRegistration,
  saveSafetyPlan,
  submitBaselineValues,
} from '../app-api.js';
import { readFlowState, updateFlowIds, updateOnboardingState } from '../flow-state.js';
import { getSupabaseClient } from '../supabase-client.js';

function text(value) {
  return String(value ?? '').trim();
}

function setBusy(button, busy, label = '처리 중...') {
  if (!button) return;
  if (!button.dataset.idleText) button.dataset.idleText = text(button.textContent);
  button.disabled = busy;
  button.textContent = busy ? label : button.dataset.idleText;
  button.style.opacity = busy ? '.7' : '1';
}

function showError(doc, message) {
  const target = doc.querySelector('#account-error, [data-form-error], [aria-live="polite"]');
  if (target) {
    target.textContent = message;
    target.classList.add('is-visible');
    return;
  }
  globalThis.alert?.(message);
}

function friendlyAuthError(error) {
  const code = String(error?.code || '').toLowerCase();
  const message = String(error?.message || error || '');
  if (code === 'email_already_registered' || /already registered|already exists/i.test(message)) {
    return '이미 가입된 이메일이야. 로그인 화면에서 로그인해 줘.';
  }
  if (/rate limit|too many requests/i.test(message)) {
    return '가입 요청이 잠시 몰렸어. 잠깐 기다린 뒤 다시 눌러 줘.';
  }
  if (/failed to fetch|networkerror|network request failed/i.test(message)) {
    return '서버에 연결하지 못했어. 인터넷 연결을 확인하고 다시 시도해 줘.';
  }
  return message || '계정을 만들지 못했어. 잠시 후 다시 시도해 줘.';
}

function successful(response) {
  if (!response?.ok) throw new Error(response?.reason || response?.error || '저장하지 못했어요. 잠시 후 다시 시도해 주세요.');
  return response.data ?? response;
}

function captureClick(button, handler) {
  if (!button || button.dataset.withmindBound === 'true') return;
  button.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    try {
      await handler(event);
    } catch (error) {
      showError(button.ownerDocument, friendlyAuthError(error));
      setBusy(button, false);
    }
  }, { capture: true });
  button.dataset.withmindBound = 'true';
}

function bindAccountPage(doc) {
  const button = doc.querySelector('.account-next');
  const inputs = [...doc.querySelectorAll('input')];
  const [emailInput, passwordInput, nicknameInput] = inputs;
  captureClick(button, async () => {
    const email = text(emailInput?.value);
    const password = String(passwordInput?.value || '');
    const nickname = text(nicknameInput?.value);
    if (!email || !password || !nickname) throw new Error('이메일, 비밀번호, 별명을 모두 입력해 줘.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('이메일 형식을 확인해 줘.');
    if (password.length < 8) throw new Error('비밀번호는 8자 이상이어야 해.');
    setBusy(button, true, '계정 만드는 중...');
    updateOnboardingState({ account: { email, nickname } });
    const result = await getSupabaseClient().auth.signUp({ email, password, nickname });
    if (!result?.access_token) {
      throw new Error('로그인 세션을 만들지 못했어. 다시 시도해 줘.');
    }
    location.href = './profile.html';
  });
}

function bindLoginPage(doc) {
  const button = doc.querySelector('.login-btn');
  const inputs = [...doc.querySelectorAll('input.field')];
  captureClick(button, async () => {
    const email = text(inputs[0]?.value);
    const password = String(inputs[1]?.value || '');
    if (!email || !password) throw new Error('이메일과 비밀번호를 입력해 주세요.');
    setBusy(button, true, '로그인 중...');
    await getSupabaseClient().auth.signInWithPassword({ email, password });
    updateOnboardingState({ login: { email, signedInAt: new Date().toISOString() } });
    location.href = '../home/home.html';
  });
}

function bindProfilePage(doc) {
  const button = doc.querySelector('.next-btn');
  captureClick(button, async () => {
    const genderCode = doc.querySelector('.gender[data-active="true"]')?.dataset.value || '';
    const birth = [...doc.querySelectorAll('.birth-display')].map((node) => text(node.textContent));
    const regionName = text(doc.querySelector('.region-group')?.dataset.value);
    const educationCode = Number(doc.querySelector('.education-group')?.dataset.value || 0);
    const nickname = text(readFlowState().onboarding?.account?.nickname);
    const birthDate = birth.length === 3 ? `${birth[0]}-${birth[1].padStart(2, '0')}-${birth[2].padStart(2, '0')}` : '';
    if (!nickname) throw new Error('가입 단계의 별명 정보가 없어요. 계정 만들기부터 다시 진행해 주세요.');
    if (!genderCode || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || !regionName || !educationCode) {
      throw new Error('성별, 생년월일, 지역, 학력을 모두 선택해 주세요.');
    }
    setBusy(button, true, '저장 중...');
    successful(await completeRegistration({ nickname, genderCode, birthDate, educationCode, regionName }));
    updateOnboardingState({ profile: { nickname, genderCode, birthDate, educationCode, regionName, saved: true } });
    location.href = './agreement.html';
  });
}

function bindAgreementPage(doc) {
  const button = doc.querySelector('#startBtn');
  captureClick(button, async () => {
    if ([...doc.querySelectorAll('.agree-item')].some((item) => item.dataset.active !== 'true')) {
      throw new Error('필수 동의 항목을 모두 확인해 주세요.');
    }
    setBusy(button, true, '동의 저장 중...');
    const data = successful(await acceptConsent({ accepted: true }));
    updateFlowIds({ consent: data.flow_id });
    location.href = './baseline_assessment.html';
  });
}

function bindBaselinePage(doc) {
  const button = doc.querySelector('#nextButton');
  captureClick(button, async () => {
    const score = (key) => Number(doc.querySelector(`[data-key="${key}"]`)?.dataset.value || 0);
    const payload = {
      moodScore: score('mood_score'),
      burdenScore: score('burden_score'),
      connectionScore: score('connection_score'),
    };
    if (Object.values(payload).some((value) => value < 1 || value > 5)) throw new Error('세 문항에 모두 답해 주세요.');
    setBusy(button, true, '저장 중...');
    const data = successful(await submitBaselineValues(payload));
    updateFlowIds({ baseline: data.flow_id });
    location.href = './safety_contact.html';
  });
}

function bindSafetyContactPage(doc) {
  const saveButton = doc.querySelector('.primary-btn');
  const skipButton = doc.querySelector('.ghost-btn');
  captureClick(saveButton, async () => {
    const fields = [...doc.querySelectorAll('textarea, input')];
    const payload = {
      warningSigns: text(fields[0]?.value),
      calmingMethods: text(fields[1]?.value),
      contactText: text(fields[2]?.value),
    };
    if (!payload.warningSigns || !payload.calmingMethods) throw new Error('위험 신호와 진정 방법을 입력해 주세요.');
    setBusy(saveButton, true, '저장 중...');
    const data = successful(await saveSafetyPlan(payload));
    updateFlowIds({ safetyPlan: data.flow_id });
    location.href = './alert.html';
  });
  captureClick(skipButton, async () => {
    location.href = './alert.html';
  });
}

export function bindOnboardingPage(doc = document) {
  const pageKey = doc?.documentElement?.dataset?.pageKey || '';
  if (pageKey === 'account') return bindAccountPage(doc);
  if (pageKey === 'login') return bindLoginPage(doc);
  if (pageKey === 'profile') return bindProfilePage(doc);
  if (pageKey === 'agreement') return bindAgreementPage(doc);
  if (pageKey === 'baseline_assessment') return bindBaselinePage(doc);
  if (pageKey === 'safety_contact') return bindSafetyContactPage(doc);
  updateOnboardingState({ lastOnboardingPage: pageKey });
}
