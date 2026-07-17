import { getSafetyPlan } from '../app-api.js';
import { readFlowState, updateOnboardingState } from '../flow-state.js';

const EMPTY_TEXT = '아직 입력하지 않았어요.';

function text(value) {
  return String(value ?? '').trim();
}

function normalizeSafetyPlan(value = {}) {
  return {
    warningSigns: text(value.warningSigns ?? value.warning_signs),
    calmingMethods: text(value.calmingMethods ?? value.calming_methods),
    contactText: text(value.contactText ?? value.contact_text),
    updatedAt: value.updatedAt ?? value.updated_at ?? null,
  };
}

function renderSafetyPlan(doc, value) {
  const plan = normalizeSafetyPlan(value);
  const fields = {
    warningSigns: doc.querySelector('[data-safety-value="warningSigns"]'),
    calmingMethods: doc.querySelector('[data-safety-value="calmingMethods"]'),
    contactText: doc.querySelector('[data-safety-value="contactText"]'),
  };
  for (const [key, element] of Object.entries(fields)) {
    if (element) element.textContent = plan[key] || EMPTY_TEXT;
  }
  const hasPlan = Boolean(plan.warningSigns || plan.calmingMethods || plan.contactText);
  doc.querySelector('.phone')?.setAttribute('data-has-safety-plan', String(hasPlan));
  return plan;
}

function dataOf(response) {
  if (!response?.ok) throw new Error(response?.reason || response?.error || '안전 계획을 불러오지 못했어요.');
  return response.data ?? response;
}

async function hydrateSafetyPlan(doc) {
  const cached = normalizeSafetyPlan(readFlowState().onboarding?.safetyPlan || {});
  renderSafetyPlan(doc, cached);
  try {
    const data = dataOf(await getSafetyPlan());
    if (!data?.safety_plan) return cached;
    const plan = renderSafetyPlan(doc, data.safety_plan);
    updateOnboardingState({ safetyPlan: plan });
    return plan;
  } catch {
    return cached;
  }
}

export function bindSafetyPlanPage(doc = document) {
  if (doc?.documentElement?.dataset?.pageKey !== 'plan') return;
  const editButton = doc.querySelector('#edit-safety-plan');
  editButton?.addEventListener('click', () => {
    location.href = '../onboarding/safety_contact.html?mode=edit&return=safetyplan';
  });
  hydrateSafetyPlan(doc);
}
