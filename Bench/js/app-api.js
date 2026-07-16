import { getSupabaseClient } from './supabase-client.js';

function normalizePayload(payload) {
  return payload && typeof payload === 'object' ? payload : {};
}

async function call(action, payload = {}, options = {}) {
  const client = getSupabaseClient(options.config || {});
  if (!client.isConfigured) {
    return {
      ok: false,
      action,
      reason: 'supabase-not-configured',
      payload: normalizePayload(payload),
    };
  }

  try {
    return await client.invoke('app-api', {
      action,
      payload: normalizePayload(payload),
    }, options);
  } catch (error) {
    return {
      ok: false,
      action,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function completeRegistration(payload, options = {}) {
  return call('complete_registration', payload, options);
}

export async function getOnboardingStatus(payload = {}, options = {}) {
  return call('onboarding_status', payload, options);
}

export async function acceptConsent(payload = { accepted: true }, options = {}) {
  return call('accept_consent', payload, options);
}

export async function submitBaselineValues(payload, options = {}) {
  return call('submit_baseline_values', payload, options);
}

export async function saveSafetyPlan(payload, options = {}) {
  return call('save_safety_plan', payload, options);
}

export async function startEma(payload, options = {}) {
  return call('start_ema', payload, options);
}

export async function saveEmaAnswers(payload, options = {}) {
  return call('save_ema_answers', payload, options);
}

export async function getEmaResult(payload, options = {}) {
  return call('get_ema_result', payload, options);
}

export async function getReflection(payload, options = {}) {
  return call('get_reflection', payload, options);
}

export async function getEmi(payload, options = {}) {
  return call('get_emi', payload, options);
}

export async function invokeWorkflow(functionName, payload, options = {}) {
  const client = getSupabaseClient(options.config || {});
  if (!client.isConfigured) throw new Error('Supabase is not configured');
  return client.invoke(functionName, payload, options);
}

export async function startActivityFlow(payload, options = {}) {
  return call('start_activity_flow', payload, options);
}

export async function submitBaseline(payload, options = {}) {
  return call('submit_baseline', payload, options);
}

export async function saveWeeklyFeedback(payload, options = {}) {
  return call('save_weekly_feedback', payload, options);
}

export async function submitEma(payload, options = {}) {
  return call('submit_ema', payload, options);
}

export async function getEmaLlmContext(payload, options = {}) {
  return call('get_ema_llm_context', payload, options);
}

export async function saveEmaAiResult(payload, options = {}) {
  return call('save_ema_ai_result', payload, options);
}

export async function startEmaReflectionFlow(payload, options = {}) {
  return call('start_ema_reflection_flow', payload, options);
}

export async function saveEmaReflectionQuestion(payload, options = {}) {
  return call('save_ema_reflection_question', payload, options);
}

export async function saveEmaReflectionResponse(payload, options = {}) {
  return call('save_ema_reflection_response', payload, options);
}

export async function submitEmaReflection(payload, options = {}) {
  return call('submit_ema_reflection', payload, options);
}

export async function getEmaReflectionLlmContext(payload, options = {}) {
  return call('get_ema_reflection_llm_context', payload, options);
}

export async function startEmiFlow(payload, options = {}) {
  return call('start_emi_flow', payload, options);
}

export async function getEmiLlmContext(payload, options = {}) {
  return call('get_emi_llm_context', payload, options);
}

export async function saveEmiQuestions(payload, options = {}) {
  return call('save_emi_questions', payload, options);
}

export async function saveEmiResponse(payload, options = {}) {
  return call('save_emi_response', payload, options);
}

export async function submitEmi(payload, options = {}) {
  return call('submit_emi', payload, options);
}

export async function saveEmiAiResult(payload, options = {}) {
  return call('save_emi_ai_result', payload, options);
}

export async function getEmiAiResult(payload, options = {}) {
  return call('get_emi_ai_result', payload, options);
}

export async function callAppApi(action, payload = {}, options = {}) {
  return call(action, payload, options);
}
