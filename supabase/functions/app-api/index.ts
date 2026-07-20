import { requireUser } from '../_shared/auth.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { HttpError, jsonResponse, toErrorMessage, toHttpError } from '../_shared/errors.ts';
import { insertRows, requestJson, rpc, selectMany, selectOne, updateRows } from '../_shared/supabase.ts';
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

function text(value: unknown) {
  return String(value ?? '').trim();
}

function isMissingExtendedProfileColumns(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '');
  return /42703|column profiles\.(?:gender_code|region_name) does not exist/i.test(message);
}

async function loadOnboardingProfile(
  runtime: SupabaseEnv,
  userId: string,
  userMetadata: Record<string, unknown> = {},
) {
  try {
    return await selectOne<Record<string, unknown>>(
      runtime,
      `/rest/v1/profiles?select=user_id,nickname,gender_code,birth_date,education_code,region_name,registration_status&user_id=eq.${encodeURIComponent(userId)}&limit=1`,
    );
  } catch (error) {
    if (!isMissingExtendedProfileColumns(error)) throw error;
    const profile = await selectOne<Record<string, unknown>>(
      runtime,
      `/rest/v1/profiles?select=user_id,nickname,birth_date,education_code,registration_status&user_id=eq.${encodeURIComponent(userId)}&limit=1`,
    );
    return profile ? {
      ...profile,
      gender_code: text(userMetadata.gender_code),
      region_name: text(userMetadata.region_name),
    } : null;
  }
}

function integer(value: unknown, label: string, min?: number, max?: number) {
  const result = Number(value);
  if (!Number.isInteger(result) || (min != null && result < min) || (max != null && result > max)) {
    throw new HttpError(400, `${label} is invalid`);
  }
  return result;
}

function asUuid(value: unknown, label = 'flowId') {
  const result = text(value);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result)) {
    throw new HttpError(400, `${label} is invalid`);
  }
  return result;
}

async function assertOwnedFlow(runtime: SupabaseEnv, flowId: string, userId: string, partType?: string) {
  const typeFilter = partType ? `&part_type=eq.${encodeURIComponent(partType)}` : '';
  const row = await selectOne<Record<string, unknown>>(
    runtime,
    `/rest/v1/activity_flows?select=flow_id,user_id,part_type,status&flow_id=eq.${encodeURIComponent(flowId)}&user_id=eq.${encodeURIComponent(userId)}${typeFilter}&limit=1`,
  );
  if (!row) throw new HttpError(403, 'flow is not available');
  return row;
}

async function startFlow(runtime: SupabaseEnv, userId: string, partType: string, parentFlowId: string | null = null) {
  return await rpc<string>(runtime, 'start_activity_flow', {
    p_user_id: userId,
    p_part_type: partType,
    p_parent_flow_id: parentFlowId,
  });
}

async function completeFlow(runtime: SupabaseEnv, flowId: string, userId: string) {
  await updateRows(runtime, 'activity_flows', { flow_id: flowId, user_id: userId }, {
    status: 'completed',
    submitted_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
  }, false);
}

function normalizeAnswers(value: unknown, allowPartial = false) {
  if (!Array.isArray(value) || value.length !== 31) {
    throw new HttpError(400, '31 EMA answers are required');
  }
  return value.map((item, index) => {
    if (allowPartial && (item === null || item === undefined || item === '')) return null;
    return integer(item, `answer ${index + 1}`, 0, index >= 4 && index <= 18 ? 2 : 3);
  });
}

async function handleAction(
  action: string,
  payload: Record<string, unknown>,
  userId: string,
  runtime: SupabaseEnv,
  userMetadata: Record<string, unknown> = {},
) {
  switch (action) {
    case 'onboarding_status': {
      const profile = await loadOnboardingProfile(runtime, userId, userMetadata);
      return { profile };
    }

    case 'get_safety_plan': {
      const safetyPlan = await selectOne<Record<string, unknown>>(
        runtime,
        `/rest/v1/safety_plans?select=flow_id,warning_signs,calming_methods,contact_text,created_at,updated_at&user_id=eq.${encodeURIComponent(userId)}&limit=1`,
      );
      return { safety_plan: safetyPlan };
    }

    case 'accept_consent': {
      const accepted = pick(payload, 'accepted');
      if (accepted !== true) throw new HttpError(400, 'all consent items must be accepted');
      const versions = await selectMany<Record<string, unknown>>(
        runtime,
        '/rest/v1/consent_document_versions?select=consent_version_id,consent_type,effective_from&active=eq.true&order=effective_from.desc',
      );
      const byType = new Map<string, number>();
      for (const row of versions) {
        const type = text(row.consent_type);
        if (type && !byType.has(type)) byType.set(type, Number(row.consent_version_id));
      }
      const required = ['terms_of_service', 'privacy_collection', 'sensitive_information', 'research_data_use'];
      if (required.some((type) => !byType.has(type))) {
        throw new HttpError(500, 'active consent documents are incomplete');
      }
      const flowId = await startFlow(runtime, userId, 'consent');
      await insertRows(runtime, 'consent_sessions', {
        flow_id: flowId,
        user_id: userId,
        consent_action: 'acceptance',
        terms_version_id: byType.get('terms_of_service'),
        privacy_version_id: byType.get('privacy_collection'),
        sensitive_version_id: byType.get('sensitive_information'),
        research_version_id: byType.get('research_data_use'),
        terms_accepted: true,
        privacy_accepted: true,
        sensitive_accepted: true,
        research_accepted: true,
        submitted_at: new Date().toISOString(),
      }, { returning: false });
      await completeFlow(runtime, flowId, userId);
      return { flow_id: flowId };
    }

    case 'submit_baseline_values': {
      const scores = {
        mood_score: integer(pick(payload, 'moodScore', 'mood_score'), 'mood score', 1, 5),
        burden_score: integer(pick(payload, 'burdenScore', 'burden_score'), 'burden score', 1, 5),
        connection_score: integer(pick(payload, 'connectionScore', 'connection_score'), 'connection score', 1, 5),
      };
      const flowId = await startFlow(runtime, userId, 'baseline');
      await insertRows(runtime, 'baseline_assessments', {
        flow_id: flowId,
        user_id: userId,
        ...scores,
      }, { returning: false });
      await rpc(runtime, 'submit_baseline', { p_flow_id: flowId });
      return { flow_id: flowId, ...scores };
    }

    case 'save_safety_plan': {
      const warningSigns = text(pick(payload, 'warningSigns', 'warning_signs'));
      const calmingMethods = text(pick(payload, 'calmingMethods', 'calming_methods'));
      const contactText = text(pick(payload, 'contactText', 'contact_text'));
      if (!warningSigns || !calmingMethods) {
        throw new HttpError(400, 'warning signs and calming methods are required');
      }
      const flowId = await startFlow(runtime, userId, 'safety_plan');
      await insertRows(runtime, 'safety_plans', {
        user_id: userId,
        flow_id: flowId,
        warning_signs: warningSigns,
        calming_methods: calmingMethods,
        contact_text: contactText,
      }, { upsert: true, onConflict: 'user_id', returning: false });
      await completeFlow(runtime, flowId, userId);
      return {
        flow_id: flowId,
        warning_signs: warningSigns,
        calming_methods: calmingMethods,
        contact_text: contactText,
      };
    }

    case 'start_ema': {
      const categoryKey = text(pick(payload, 'categoryKey', 'category_key'));
      const detailNames = Array.isArray(pick(payload, 'detailNames', 'detail_names'))
        ? (pick(payload, 'detailNames', 'detail_names') as unknown[]).map(text).filter(Boolean)
        : [];
      if (!categoryKey || detailNames.length < 1 || detailNames.length > 3) {
        throw new HttpError(400, 'one to three emotion details are required');
      }
      const category = await selectOne<Record<string, unknown>>(
        runtime,
        `/rest/v1/emotion_categories?select=emotion_category_id,category_key&category_key=eq.${encodeURIComponent(categoryKey)}&limit=1`,
      );
      if (!category) throw new HttpError(400, 'emotion category is invalid');
      const details = await selectMany<Record<string, unknown>>(
        runtime,
        `/rest/v1/emotion_details?select=emotion_detail_id,emotion_category_id,detail_name&emotion_category_id=eq.${category.emotion_category_id}`,
      );
      const ordered = detailNames.map((name) => details.find((row) => text(row.detail_name) === name)).filter(Boolean) as Record<string, unknown>[];
      if (ordered.length !== detailNames.length) throw new HttpError(400, 'emotion detail is invalid');
      const activeInstrument = await selectOne<Record<string, unknown>>(
        runtime,
        '/rest/v1/ema_instrument_versions?select=instrument_version_id&active=eq.true&order=version_no.desc&limit=1',
      );
      if (!activeInstrument) throw new HttpError(500, 'active EMA instrument is missing');
      const flowId = await startFlow(runtime, userId, 'ema');
      await insertRows(runtime, 'ema_sessions', {
        flow_id: flowId,
        user_id: userId,
        instrument_version_id: activeInstrument.instrument_version_id,
        emotion_category_id: category.emotion_category_id,
      }, { returning: false });
      await insertRows(runtime, 'ema_session_emotions', ordered.map((row, index) => ({
        flow_id: flowId,
        user_id: userId,
        emotion_detail_id: row.emotion_detail_id,
        selection_order: index + 1,
      })), { returning: false });
      return { flow_id: flowId };
    }

    case 'save_ema_answers': {
      const flowId = asUuid(pick(payload, 'flowId', 'flow_id'));
      const allowPartial = pick(payload, 'partial') === true;
      const answers = normalizeAnswers(pick(payload, 'answers'), allowPartial);
      await assertOwnedFlow(runtime, flowId, userId, 'ema');
      const answerPatch = Object.fromEntries(answers.map((value, index) => [`q${String(index + 1).padStart(3, '0')}`, value]));
      await updateRows(runtime, 'ema_sessions', { flow_id: flowId, user_id: userId }, answerPatch, false);
      const scoring = await selectOne<Record<string, unknown>>(
        runtime,
        '/rest/v1/ema_scoring_versions?select=scoring_version_id&active=eq.true&order=version_no.desc&limit=1',
      );
      if (!scoring) throw new HttpError(500, 'active EMA scoring version is missing');
      const complete = answers.every((value) => value != null);
      if (complete) {
        const numericAnswers = answers as number[];
        const sums = [
          numericAnswers.slice(0, 3).reduce((sum, value) => sum + value, 0),
          numericAnswers[3],
          numericAnswers.slice(4, 19).reduce((sum, value) => sum + value, 0),
          numericAnswers.slice(19, 31).reduce((sum, value) => sum + value, 0),
        ];
        await insertRows(runtime, 'ema_scale_scores', {
          flow_id: flowId,
          user_id: userId,
          scoring_version_id: scoring.scoring_version_id,
          scale01: sums[0],
          scale02: sums[1],
          scale03: sums[2],
          scale04: sums[3],
        }, { upsert: true, onConflict: 'flow_id', returning: false });
      }
      return { flow_id: flowId, saved: true, complete };
    }

    case 'get_ema_result': {
      const requestedFlowId = text(pick(payload, 'flowId', 'flow_id'));
      let flowId = '';
      let analysis: Record<string, unknown> | null = null;
      if (requestedFlowId) {
        flowId = asUuid(requestedFlowId);
        await assertOwnedFlow(runtime, flowId, userId, 'ema');
      } else {
        analysis = await selectOne<Record<string, unknown>>(
          runtime,
          `/rest/v1/ema_ai_results?select=flow_id,characteristic_1,characteristic_2,characteristic_3,ai_comment,generated_at&user_id=eq.${encodeURIComponent(userId)}&order=generated_at.desc&limit=1`,
        );
        flowId = text(analysis?.flow_id);
      }
      if (!flowId) return { classification: null, type: null, analysis: null };
      const classification = await selectOne<Record<string, unknown>>(
        runtime,
        `/rest/v1/ema_classifications?select=flow_id,type_id,classified_at&flow_id=eq.${encodeURIComponent(flowId)}&user_id=eq.${encodeURIComponent(userId)}&limit=1`,
      );
      const type = classification ? await selectOne<Record<string, unknown>>(
        runtime,
        `/rest/v1/classification_types?select=type_id,node_code,internal_type_name,character_name,image_bucket,image_path&type_id=eq.${classification.type_id}&limit=1`,
      ) : null;
      if (!analysis) {
        analysis = await selectOne<Record<string, unknown>>(
          runtime,
          `/rest/v1/ema_ai_results?select=flow_id,characteristic_1,characteristic_2,characteristic_3,ai_comment,generated_at&flow_id=eq.${encodeURIComponent(flowId)}&user_id=eq.${encodeURIComponent(userId)}&limit=1`,
        );
      }
      return { classification, type, analysis };
    }

    case 'get_reflection': {
      const flowId = asUuid(pick(payload, 'flowId', 'flow_id'));
      await assertOwnedFlow(runtime, flowId, userId, 'ema_reflection');
      const reflection = await selectOne<Record<string, unknown>>(
        runtime,
        `/rest/v1/ema_reflection_sessions?select=flow_id,source_ema_flow_id,reflection_question,user_response,question_generated_at,submitted_at&flow_id=eq.${encodeURIComponent(flowId)}&user_id=eq.${encodeURIComponent(userId)}&limit=1`,
      );
      return { reflection };
    }

    case 'get_emi': {
      const flowId = asUuid(pick(payload, 'flowId', 'flow_id'));
      await assertOwnedFlow(runtime, flowId, userId, 'emi');
      const emi = await selectOne<Record<string, unknown>>(
        runtime,
        `/rest/v1/emi_sessions?select=flow_id,question_1,question_2,question_3,question_4,question_5,selected_question_1_no,selected_question_2_no,combined_response,questions_generated_at,submitted_at&flow_id=eq.${encodeURIComponent(flowId)}&user_id=eq.${encodeURIComponent(userId)}&limit=1`,
      );
      return { emi };
    }

    case 'complete_registration': {
      const legacy = {
        p_user_id: userId,
        p_nickname: pick(payload, 'nickname', 'p_nickname'),
        p_birth_date: pick(payload, 'birthDate', 'birth_date', 'p_birth_date'),
        p_education_code: pick(payload, 'educationCode', 'education_code', 'p_education_code'),
      };
      const regionName = pick(payload, 'regionName', 'region_name', 'p_region_name');
      const genderCode = pick(payload, 'genderCode', 'gender_code', 'p_gender_code');
      try {
        return await rpc(runtime, 'complete_registration', {
          ...legacy,
          p_region_name: regionName,
          p_gender_code: genderCode,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error || '');
        if (!message.includes('PGRST202')) throw error;
        const result = await rpc(runtime, 'complete_registration', legacy);
        await requestJson(runtime, `/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
          method: 'PUT',
          body: JSON.stringify({
            user_metadata: {
              ...userMetadata,
              gender_code: genderCode,
              region_name: regionName,
            },
          }),
        });
        return result;
      }
    }

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

    case 'submit_ema': {
      const flowId = asUuid(pick(payload, 'flowId', 'flow_id'));
      await assertOwnedFlow(runtime, flowId, userId, 'ema');
      return await rpc(runtime, 'submit_ema', { p_flow_id: flowId });
    }

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

    case 'start_ema_reflection_flow': {
      const sourceFlowId = asUuid(pick(payload, 'sourceEmaFlowId', 'source_ema_flow_id'), 'sourceEmaFlowId');
      await assertOwnedFlow(runtime, sourceFlowId, userId, 'ema');
      return await rpc(runtime, 'start_ema_reflection_flow', {
        p_user_id: userId,
        p_source_ema_flow_id: sourceFlowId,
      });
    }

    case 'save_ema_reflection_question':
      return await rpc(runtime, 'save_ema_reflection_question', {
        p_flow_id: pick(payload, 'flowId', 'flow_id'),
        p_prompt_template_id: pick(payload, 'promptTemplateId', 'prompt_template_id'),
        p_reflection_question: pick(payload, 'reflectionQuestion', 'reflection_question'),
      });

    case 'save_ema_reflection_response': {
      const flowId = asUuid(pick(payload, 'flowId', 'flow_id'));
      await assertOwnedFlow(runtime, flowId, userId, 'ema_reflection');
      return await rpc(runtime, 'save_ema_reflection_response', {
        p_flow_id: flowId,
        p_user_response: pick(payload, 'userResponse', 'user_response'),
      });
    }

    case 'submit_ema_reflection': {
      const flowId = asUuid(pick(payload, 'flowId', 'flow_id'));
      await assertOwnedFlow(runtime, flowId, userId, 'ema_reflection');
      return await rpc(runtime, 'submit_ema_reflection', { p_flow_id: flowId });
    }

    case 'get_ema_reflection_llm_context':
      return await rpc(runtime, 'get_ema_reflection_llm_context', {
        p_flow_id: pick(payload, 'flowId', 'flow_id'),
      });

    case 'start_emi_flow': {
      const sourceFlowId = asUuid(pick(payload, 'sourceReflectionFlowId', 'source_reflection_flow_id'), 'sourceReflectionFlowId');
      await assertOwnedFlow(runtime, sourceFlowId, userId, 'ema_reflection');
      return await rpc(runtime, 'start_emi_flow', {
        p_user_id: userId,
        p_source_reflection_flow_id: sourceFlowId,
        p_gestalt_type_ids: pick(payload, 'gestaltTypeIds', 'gestalt_type_ids'),
      });
    }

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

    case 'save_emi_response': {
      const flowId = asUuid(pick(payload, 'flowId', 'flow_id'));
      await assertOwnedFlow(runtime, flowId, userId, 'emi');
      return await rpc(runtime, 'save_emi_response', {
        p_flow_id: flowId,
        p_selected_question_1_no: pick(payload, 'selectedQuestion1No', 'selected_question_1_no'),
        p_selected_question_2_no: pick(payload, 'selectedQuestion2No', 'selected_question_2_no'),
        p_combined_response: pick(payload, 'combinedResponse', 'combined_response'),
      });
    }

    case 'submit_emi': {
      const flowId = asUuid(pick(payload, 'flowId', 'flow_id'));
      await assertOwnedFlow(runtime, flowId, userId, 'emi');
      return await rpc(runtime, 'submit_emi', { p_flow_id: flowId });
    }

    case 'save_emi_ai_result':
      return await rpc(runtime, 'save_emi_ai_result', {
        p_flow_id: pick(payload, 'flowId', 'flow_id'),
        p_prompt_template_id: pick(payload, 'promptTemplateId', 'prompt_template_id'),
        p_ai_comment: pick(payload, 'aiComment', 'ai_comment'),
      });

    case 'get_emi_ai_result': {
      const flowId = pick(payload, 'flowId', 'flow_id');
      if (flowId) await assertOwnedFlow(runtime, asUuid(flowId), userId, 'emi');
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

    const data = await handleAction(action, payload as Record<string, unknown>, user.id, runtime, user.user_metadata || {});
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
