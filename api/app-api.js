const {
  assertFlowOwner,
  getEnv,
  insertRows,
  readJson,
  requireUser,
  requestJson,
  rpc,
  selectMany,
  selectOne,
  sendJson,
  updateRows,
} = require('./_lib/supabase');

function pick(payload, ...keys) {
  for (const key of keys) {
    const value = payload?.[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
}

const text = (value) => String(value ?? '').trim();

function integer(value, label, min, max) {
  const result = Number(value);
  if (!Number.isInteger(result) || (min != null && result < min) || (max != null && result > max)) {
    throw Object.assign(new Error(`${label} is invalid`), { status: 400 });
  }
  return result;
}

function uuid(value, label = 'flowId') {
  const result = text(value);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result)) {
    throw Object.assign(new Error(`${label} is invalid`), { status: 400 });
  }
  return result;
}

function normalizeAnswers(value, partial = false) {
  if (!Array.isArray(value) || value.length !== 31) throw Object.assign(new Error('31 EMA answers are required'), { status: 400 });
  return value.map((item, index) => {
    if (partial && (item === null || item === undefined || item === '')) return null;
    return integer(item, `answer ${index + 1}`, 0, index >= 4 && index <= 18 ? 2 : 3);
  });
}

function startFlow(env, userId, partType, parentFlowId = null) {
  return rpc(env, 'start_activity_flow', { p_user_id: userId, p_part_type: partType, p_parent_flow_id: parentFlowId });
}

function completeFlow(env, flowId, userId) {
  const now = new Date().toISOString();
  return updateRows(env, 'activity_flows', { flow_id: flowId, user_id: userId }, { status: 'completed', submitted_at: now, completed_at: now });
}

async function handleAction(action, payload, userId, env) {
  if (action === 'ping') return { ok: true, user_id: userId };

  if (action === 'onboarding_status') {
    const profile = await selectOne(env, `/rest/v1/profiles?select=user_id,nickname,gender_code,birth_date,education_code,region_name,registration_status&user_id=eq.${encodeURIComponent(userId)}&limit=1`);
    return { profile };
  }

  if (action === 'complete_registration') {
    const common = {
      p_user_id: userId,
      p_nickname: pick(payload, 'nickname'),
      p_birth_date: pick(payload, 'birthDate', 'birth_date'),
      p_education_code: pick(payload, 'educationCode', 'education_code'),
      p_region_name: pick(payload, 'regionName', 'region_name'),
    };
    const genderCode = pick(payload, 'genderCode', 'gender_code');
    let result;
    try {
      result = await rpc(env, 'complete_registration', { ...common, p_gender_code: genderCode });
    } catch (error) {
      if (!String(error?.message || '').includes('PGRST202')) throw error;
      result = await rpc(env, 'complete_registration', common);
      await requestJson(env, `/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
        method: 'PUT',
        body: JSON.stringify({ user_metadata: { gender_code: genderCode } }),
      });
    }
    return result;
  }

  if (action === 'accept_consent') {
    if (payload.accepted !== true) throw Object.assign(new Error('all consent items must be accepted'), { status: 400 });
    const rows = await selectMany(env, '/rest/v1/consent_document_versions?select=consent_version_id,consent_type,effective_from&active=eq.true&order=effective_from.desc');
    const versions = new Map();
    for (const row of rows) if (!versions.has(row.consent_type)) versions.set(row.consent_type, row.consent_version_id);
    const required = ['terms_of_service', 'privacy_collection', 'sensitive_information', 'research_data_use'];
    if (required.some((type) => !versions.has(type))) throw new Error('active consent documents are incomplete');
    const flowId = await startFlow(env, userId, 'consent');
    await insertRows(env, 'consent_sessions', {
      flow_id: flowId, user_id: userId, consent_action: 'acceptance',
      terms_version_id: versions.get('terms_of_service'), privacy_version_id: versions.get('privacy_collection'),
      sensitive_version_id: versions.get('sensitive_information'), research_version_id: versions.get('research_data_use'),
      terms_accepted: true, privacy_accepted: true, sensitive_accepted: true, research_accepted: true,
      submitted_at: new Date().toISOString(),
    });
    await completeFlow(env, flowId, userId);
    return { flow_id: flowId };
  }

  if (action === 'submit_baseline_values') {
    const scores = {
      mood_score: integer(pick(payload, 'moodScore', 'mood_score'), 'mood score', 1, 5),
      burden_score: integer(pick(payload, 'burdenScore', 'burden_score'), 'burden score', 1, 5),
      connection_score: integer(pick(payload, 'connectionScore', 'connection_score'), 'connection score', 1, 5),
    };
    const flowId = await startFlow(env, userId, 'baseline');
    await insertRows(env, 'baseline_assessments', { flow_id: flowId, user_id: userId, ...scores });
    await rpc(env, 'submit_baseline', { p_flow_id: flowId });
    return { flow_id: flowId, ...scores };
  }

  if (action === 'save_safety_plan') {
    const warningSigns = text(pick(payload, 'warningSigns', 'warning_signs'));
    const calmingMethods = text(pick(payload, 'calmingMethods', 'calming_methods'));
    const contactText = text(pick(payload, 'contactText', 'contact_text'));
    if (!warningSigns || !calmingMethods) throw Object.assign(new Error('warning signs and calming methods are required'), { status: 400 });
    const flowId = await startFlow(env, userId, 'safety_plan');
    await insertRows(env, 'safety_plans', { user_id: userId, flow_id: flowId, warning_signs: warningSigns, calming_methods: calmingMethods, contact_text: contactText });
    await completeFlow(env, flowId, userId);
    return { flow_id: flowId };
  }

  if (action === 'start_ema') {
    const categoryKey = text(pick(payload, 'categoryKey', 'category_key'));
    const detailNames = Array.isArray(pick(payload, 'detailNames', 'detail_names')) ? pick(payload, 'detailNames', 'detail_names').map(text).filter(Boolean) : [];
    if (!categoryKey || detailNames.length < 1 || detailNames.length > 3) throw Object.assign(new Error('one to three emotion details are required'), { status: 400 });
    const category = await selectOne(env, `/rest/v1/emotion_categories?select=emotion_category_id&category_key=eq.${encodeURIComponent(categoryKey)}&limit=1`);
    if (!category) throw Object.assign(new Error('emotion category is invalid'), { status: 400 });
    const details = await selectMany(env, `/rest/v1/emotion_details?select=emotion_detail_id,detail_name&emotion_category_id=eq.${category.emotion_category_id}`);
    const ordered = detailNames.map((name) => details.find((row) => text(row.detail_name) === name)).filter(Boolean);
    if (ordered.length !== detailNames.length) throw Object.assign(new Error('emotion detail is invalid'), { status: 400 });
    const instrument = await selectOne(env, '/rest/v1/ema_instrument_versions?select=instrument_version_id&active=eq.true&order=version_no.desc&limit=1');
    if (!instrument) throw new Error('active EMA instrument is missing');
    const flowId = await startFlow(env, userId, 'ema');
    await insertRows(env, 'ema_sessions', { flow_id: flowId, user_id: userId, instrument_version_id: instrument.instrument_version_id, emotion_category_id: category.emotion_category_id });
    await insertRows(env, 'ema_session_emotions', ordered.map((row, index) => ({ flow_id: flowId, user_id: userId, emotion_detail_id: row.emotion_detail_id, selection_order: index + 1 })));
    return { flow_id: flowId };
  }

  if (action === 'save_ema_answers') {
    const flowId = uuid(pick(payload, 'flowId', 'flow_id'));
    await assertFlowOwner(env, flowId, userId, 'ema');
    const answers = normalizeAnswers(payload.answers, payload.partial === true);
    const patch = Object.fromEntries(answers.map((value, index) => [`q${String(index + 1).padStart(3, '0')}`, value]));
    await updateRows(env, 'ema_sessions', { flow_id: flowId, user_id: userId }, patch);
    const complete = answers.every((value) => value != null);
    if (complete) {
      const scoring = await selectOne(env, '/rest/v1/ema_scoring_versions?select=scoring_version_id&active=eq.true&order=version_no.desc&limit=1');
      if (!scoring) throw new Error('active EMA scoring version is missing');
      const sums = [answers.slice(0, 3).reduce((a, b) => a + b, 0), answers[3], answers.slice(4, 19).reduce((a, b) => a + b, 0), answers.slice(19).reduce((a, b) => a + b, 0)];
      await insertRows(env, 'ema_scale_scores', { flow_id: flowId, user_id: userId, scoring_version_id: scoring.scoring_version_id, scale01: sums[0], scale02: sums[1], scale03: sums[2], scale04: sums[3] }, { upsert: true, onConflict: 'flow_id' });
    }
    return { flow_id: flowId, saved: true, complete };
  }

  if (action === 'submit_ema') {
    const flowId = uuid(pick(payload, 'flowId', 'flow_id'));
    await assertFlowOwner(env, flowId, userId, 'ema');
    return rpc(env, 'submit_ema', { p_flow_id: flowId });
  }

  if (action === 'get_ema_result') {
    const flowId = uuid(pick(payload, 'flowId', 'flow_id'));
    await assertFlowOwner(env, flowId, userId, 'ema');
    const classification = await selectOne(env, `/rest/v1/ema_classifications?select=flow_id,type_id,classified_at&flow_id=eq.${flowId}&user_id=eq.${userId}&limit=1`);
    const type = classification ? await selectOne(env, `/rest/v1/classification_types?select=type_id,node_code,internal_type_name,character_name,image_bucket,image_path&type_id=eq.${classification.type_id}&limit=1`) : null;
    const analysis = await selectOne(env, `/rest/v1/ema_ai_results?select=flow_id,characteristic_1,characteristic_2,characteristic_3,ai_comment,generated_at&flow_id=eq.${flowId}&user_id=eq.${userId}&limit=1`);
    return { classification, type, analysis };
  }

  if (action === 'start_ema_reflection_flow') {
    const sourceFlowId = uuid(pick(payload, 'sourceEmaFlowId', 'source_ema_flow_id'), 'sourceEmaFlowId');
    await assertFlowOwner(env, sourceFlowId, userId, 'ema');
    return rpc(env, 'start_ema_reflection_flow', { p_user_id: userId, p_source_ema_flow_id: sourceFlowId });
  }

  if (action === 'get_reflection') {
    const flowId = uuid(pick(payload, 'flowId', 'flow_id'));
    await assertFlowOwner(env, flowId, userId, 'ema_reflection');
    const reflection = await selectOne(env, `/rest/v1/ema_reflection_sessions?select=flow_id,source_ema_flow_id,reflection_question,user_response,question_generated_at,submitted_at&flow_id=eq.${flowId}&user_id=eq.${userId}&limit=1`);
    return { reflection };
  }

  if (action === 'save_ema_reflection_response' || action === 'submit_ema_reflection') {
    const flowId = uuid(pick(payload, 'flowId', 'flow_id'));
    await assertFlowOwner(env, flowId, userId, 'ema_reflection');
    return action === 'save_ema_reflection_response'
      ? rpc(env, action, { p_flow_id: flowId, p_user_response: pick(payload, 'userResponse', 'user_response') })
      : rpc(env, action, { p_flow_id: flowId });
  }

  if (action === 'start_emi_flow') {
    const sourceFlowId = uuid(pick(payload, 'sourceReflectionFlowId', 'source_reflection_flow_id'), 'sourceReflectionFlowId');
    await assertFlowOwner(env, sourceFlowId, userId, 'ema_reflection');
    return rpc(env, 'start_emi_flow', { p_user_id: userId, p_source_reflection_flow_id: sourceFlowId, p_gestalt_type_ids: pick(payload, 'gestaltTypeIds', 'gestalt_type_ids') });
  }

  if (action === 'get_emi') {
    const flowId = uuid(pick(payload, 'flowId', 'flow_id'));
    await assertFlowOwner(env, flowId, userId, 'emi');
    const emi = await selectOne(env, `/rest/v1/emi_sessions?select=flow_id,question_1,question_2,question_3,question_4,question_5,selected_question_1_no,selected_question_2_no,combined_response,questions_generated_at,submitted_at&flow_id=eq.${flowId}&user_id=eq.${userId}&limit=1`);
    return { emi };
  }

  if (action === 'save_emi_response' || action === 'submit_emi') {
    const flowId = uuid(pick(payload, 'flowId', 'flow_id'));
    await assertFlowOwner(env, flowId, userId, 'emi');
    return action === 'save_emi_response'
      ? rpc(env, action, { p_flow_id: flowId, p_selected_question_1_no: pick(payload, 'selectedQuestion1No', 'selected_question_1_no'), p_selected_question_2_no: pick(payload, 'selectedQuestion2No', 'selected_question_2_no'), p_combined_response: pick(payload, 'combinedResponse', 'combined_response') })
      : rpc(env, action, { p_flow_id: flowId });
  }

  if (action === 'get_emi_ai_result') {
    const flowId = pick(payload, 'flowId', 'flow_id');
    if (flowId) await assertFlowOwner(env, uuid(flowId), userId, 'emi');
    const select = 'flow_id,user_id,prompt_template_id,ai_comment,generated_at';
    const path = flowId
      ? `/rest/v1/emi_ai_results?select=${select}&flow_id=eq.${encodeURIComponent(flowId)}&user_id=eq.${userId}&limit=1`
      : `/rest/v1/emi_ai_results?select=${select}&user_id=eq.${userId}&order=generated_at.desc&limit=1`;
    const row = await selectOne(env, path);
    return { ok: true, found: Boolean(row), result: row };
  }

  throw Object.assign(new Error(`unsupported action: ${action}`), { status: 400 });
}

module.exports = async function appApi(req, res) {
  if (req.method === 'OPTIONS') return sendJson(res, 204, {});
  const env = getEnv();
  if (!env.url || !env.serviceRoleKey) return sendJson(res, 500, { ok: false, error: 'Supabase environment variables are missing' });
  try {
    const user = await requireUser(req, env);
    const body = await readJson(req);
    const action = typeof body?.action === 'string' ? body.action : '';
    const payload = body?.payload && typeof body.payload === 'object' ? body.payload : {};
    if (!action) throw Object.assign(new Error('action is required'), { status: 400 });
    const data = await handleAction(action, payload, user.id, env);
    sendJson(res, 200, { ok: true, action, data, user_id: user.id });
  } catch (error) {
    sendJson(res, Number(error?.status || 500), { ok: false, error: error?.message || 'internal server error' });
  }
};
