import { getOnboardingStatus } from './app-api.js';
import { readFlowState, updateOnboardingState } from './flow-state.js';
import { getSupabaseClient } from './supabase-client.js';

function text(value) {
  return String(value ?? '').trim();
}

export function formatNicknameVocative(value) {
  const nickname = text(value);
  if (!nickname) return '친구야';

  const compactName = nickname.replace(/\s+/g, '');
  if (!compactName || !/^[가-힣]+$/.test(compactName)) return `${nickname} 친구야`;

  const lastSyllable = compactName.at(-1);
  const hasFinalConsonant = (lastSyllable.charCodeAt(0) - 0xAC00) % 28 !== 0;
  return `${nickname}${hasFinalConsonant ? '아' : '야'}`;
}

function cachedNickname() {
  const onboarding = readFlowState().onboarding || {};
  return text(onboarding.profile?.nickname) || text(onboarding.account?.nickname);
}

function renderVocative(doc, nickname) {
  const vocative = formatNicknameVocative(nickname);
  for (const target of doc.querySelectorAll('[data-user-vocative]')) {
    target.textContent = vocative;
  }
  return vocative;
}

function rememberNickname(nickname) {
  const normalized = text(nickname);
  if (!normalized) return;
  const onboarding = readFlowState().onboarding || {};
  updateOnboardingState({
    account: { ...(onboarding.account || {}), nickname: normalized },
    profile: { ...(onboarding.profile || {}), nickname: normalized },
  });
}

export function bindUserGreeting(doc = document) {
  if (!doc.querySelector('[data-user-vocative]')) return;
  renderVocative(doc, cachedNickname());

  const session = getSupabaseClient().auth.getSession();
  if (!session?.access_token) return;

  getOnboardingStatus()
    .then((response) => {
      if (!response?.ok) return;
      const nickname = text((response.data ?? response)?.profile?.nickname);
      if (!nickname) return;
      rememberNickname(nickname);
      renderVocative(doc, nickname);
    })
    .catch(() => {
      // Keep the cached nickname or the neutral fallback when the profile request fails.
    });
}
