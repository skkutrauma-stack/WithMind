import { requireUser } from '../_shared/auth.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { HttpError, jsonResponse, toErrorMessage, toHttpError } from '../_shared/errors.ts';
import { rpc, selectMany } from '../_shared/supabase.ts';
import type { SupabaseEnv } from '../_shared/types.ts';

function env(): SupabaseEnv {
  return {
    SUPABASE_URL: Deno.env.get('SUPABASE_URL') || '',
    SUPABASE_SERVICE_ROLE_KEY: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
    SUPABASE_ANON_KEY: Deno.env.get('SUPABASE_ANON_KEY') || '',
    OPENAI_API_KEY: Deno.env.get('OPENAI_API_KEY') || '',
    OPENAI_MODEL: Deno.env.get('OPENAI_MODEL') || 'gpt-5.4-mini',
  };
}

function pick(payload: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = payload[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

async function handleAction(action: string, payload: Record<string, unknown>, userId: string, runtime: SupabaseEnv) {
  switch (action) {
    case 'complete_registration':
      return await rpc(runtime, 'complete_registration', {
        p_user_id: userId,
        p_nickname: pick(payload, 'nickname', 'p_nickname'),
        p_birth_date: pick(payload, 'birthDate', 'birth_date', 'p_birth_date'),
        p_education_code: pick(payload, 'educationCode', 'education_code', 'p_education_code'),
        p_region_name: pick(payload, 'regionName', 'region_name', 'p_region_name'),
        p_gender_code: pick(payload, 'genderCode', 'gender_code', 'p_gender_code'),
      });

    case 'start_activity_flow':
      return await rpc(runtime, 'start_activity_flow', {
        p_user_id: userId,
        p_part_type: pick(payload, 'partType', 'part_type'),
        p_parent_flow_id: pick(payload, 'parentFlowId', 'parent_flow_id') || null,
      });

    case 'submit_baseline':
      return await rpc(runtime, 'submit_baseline', {
        p_flow_id: pick(payload, 'flowId', 'flow_id'),
      });

    case 'save_weekly_feedback':
      return await rpc(runtime, 'save_weekly_feedback', {
        p_user_id: userId,
        p_week_start: pick(payload, 'weekStart', 'week_start'),
        p_satisfaction_score: pick(payload, 'satisfactionScore', 'satisfaction_score'),
        p_opinion_text: pick(payload, 'opinionText', 'opinion_text'),
      });

    case 'submit_ema':
      return await rpc(runtime, 'submit_ema', {
        p_flow_id: pick(payload, 'flowId', 'flow_id'),
      });

    case 'get_ema_llm_context':
      return await rpc(runtime, 'get_ema_llm_context', {
        p_flow_id: pick(payload, 'flowId', 'flow_id'),
      });

    case 'save_ema_ai_result':
      return await rpc(runtime, 'save_ema_ai_result', {
        p_flow_id: pick(payload, 'flowId', 'flow_id'),
        p_prompt_template_id: pick(payload, 'promptTemplateId', 'prompt_template_id'),
        p_characteristic_1: pick(payload, 'characteristic1', 'characteristic_1'),
        p_characteristic_2: pick(payload, 'characteristic2', 'characteristic_2'),
        p_characteristic_3: pick(payload, 'characteristic3', 'characteristic_3'),
        p_ai_comment: pick(payload, 'aiComment', 'ai_comment'),
      });

    case 'start_ema_reflection_flow':
      return await rpc(runtime, 'start_ema_reflection_flow', {
        p_user_id: userId,
        p_source_ema_flow_id: pick(payload, 'sourceEmaFlowId', 'source_ema_flow_id'),
      });

    case 'save_ema_reflection_question':
      return await rpc(runtime, 'save_ema_reflection_question', {
        p_flow_id: pick(payload, 'flowId', 'flow_id'),
        p_prompt_template_id: pick(payload, 'promptTemplateId', 'prompt_template_id'),
        p_reflection_question: pick(payload, 'reflectionQuestion', 'reflection_question'),
      });

    case 'save_ema_reflection_response':
      return await rpc(runtime, 'save_ema_reflection_response', {
        p_flow_id: pick(payload, 'flowId', 'flow_id'),
        p_user_response: pick(payload, 'userResponse', 'user_response'),
      });

    case 'submit_ema_reflection':
      return await rpc(runtime, 'submit_ema_reflection', {
        p_flow_id: pick(payload, 'flowId', 'flow_id'),
      });

    case 'get_ema_reflection_llm_context':
      return await rpc(runtime, 'get_ema_reflection_llm_context', {
        p_flow_id: pick(payload, 'flowId', 'flow_id'),
      });

    case 'start_emi_flow':
      return await rpc(runtime, 'start_emi_flow', {
        p_user_id: userId,
        p_source_reflection_flow_id: pick(payload, 'sourceReflectionFlowId', 'source_reflection_flow_id'),
        p_gestalt_type_ids: pick(payload, 'gestaltTypeIds', 'gestalt_type_ids'),
      });

    case 'get_emi_llm_context':
      return await rpc(runtime, 'get_emi_llm_context', {
        p_flow_id: pick(payload, 'flowId', 'flow_id'),
      });

    case 'save_emi_questions':
      return await rpc(runtime, 'save_emi_questions', {
        p_flow_id: pick(payload, 'flowId', 'flow_id'),
        p_prompt_template_id: pick(payload, 'promptTemplateId', 'prompt_template_id'),
        p_question_1: pick(payload, 'question1', 'question_1'),
        p_question_2: pick(payload, 'question2', 'question_2'),
        p_question_3: pick(payload, 'question3', 'question_3'),
        p_question_4: pick(payload, 'question4', 'question_4'),
        p_question_5: pick(payload, 'question5', 'question_5'),
      });

    case 'save_emi_response':
      return await rpc(runtime, 'save_emi_response', {
        p_flow_id: pick(payload, 'flowId', 'flow_id'),
        p_selected_question_1_no: pick(payload, 'selectedQuestion1No', 'selected_question_1_no'),
        p_selected_question_2_no: pick(payload, 'selectedQuestion2No', 'selected_question_2_no'),
        p_combined_response: pick(payload, 'combinedResponse', 'combined_response'),
      });

    case 'submit_emi':
      return await rpc(runtime, 'submit_emi', {
        p_flow_id: pick(payload, 'flowId', 'flow_id'),
      });

    case 'save_emi_ai_result':
      return await rpc(runtime, 'save_emi_ai_result', {
        p_flow_id: pick(payload, 'flowId', 'flow_id'),
        p_prompt_template_id: pick(payload, 'promptTemplateId', 'prompt_template_id'),
        p_ai_comment: pick(payload, 'aiComment', 'ai_comment'),
      });

    case 'get_emi_ai_result': {
      const flowId = pick(payload, 'flowId', 'flow_id');
      const select = 'flow_id,user_id,prompt_template_id,ai_comment,generated_at';
      const path = flowId
        ? `/rest/v1/emi_ai_results?select=${select}&flow_id=eq.${encodeURIComponent(String(flowId))}&user_id=eq.${encodeURIComponent(userId)}&limit=1`
        : `/rest/v1/emi_ai_results?select=${select}&user_id=eq.${encodeURIComponent(userId)}&order=generated_at.desc&limit=1`;
      const rows = await selectMany<Record<string, unknown>>(runtime, path);
      const row = rows[0] || null;
      return {
        ok: true,
        found: Boolean(row),
        result: row,
      };
    }

    case 'ping':
      return { ok: true, user_id: userId };

    default:
      throw new HttpError(400, `unsupported action: ${action}`);
  }
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const runtime = env();
    if (!runtime.SUPABASE_URL || !runtime.SUPABASE_SERVICE_ROLE_KEY) {
      throw new HttpError(500, 'Supabase environment variables are missing');
    }

    const user = await requireUser(req, runtime);
    const body = await req.json().catch(() => ({}));
    const action = typeof body?.action === 'string' ? body.action : '';
    const payload = body?.payload && typeof body.payload === 'object' ? body.payload : {};

    if (!action) {
      throw new HttpError(400, 'action is required');
    }

    const data = await handleAction(action, payload as Record<string, unknown>, user.id, runtime);
    return jsonResponse({
      ok: true,
      action,
      data,
      user_id: user.id,
    }, 200, corsHeaders);
  } catch (error) {
    const httpError = toHttpError(error);
    return jsonResponse({
      ok: false,
      error: httpError.message,
      details: httpError.details ?? toErrorMessage(error),
    }, httpError.status, corsHeaders);
  }
});
