import { requireUser } from '../_shared/auth.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { HttpError, jsonResponse, toErrorMessage, toHttpError } from '../_shared/errors.ts';
import { assertFlowOwner, getActivePromptTemplate, rpc } from '../_shared/supabase.ts';
import { renderPromptTemplate, stringifyPromptValue } from '../_shared/prompts.ts';
import { runJsonCompletion } from '../_shared/openai.ts';
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

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const runtime = env();
    const user = await requireUser(req, runtime);
    const body = await req.json().catch(() => ({}));
    const flowId = body?.flowId || body?.flow_id || body?.p_flow_id || '';
    if (!flowId) throw new HttpError(400, 'flowId is required');
    await assertFlowOwner(runtime, flowId, user.id, 'emi');

    const context = await rpc<any>(runtime, 'get_emi_llm_context', { p_flow_id: flowId });
    const template = await getActivePromptTemplate(runtime, 'emi_question_generation');
    const userPrompt = renderPromptTemplate(template.user_prompt_template, {
      emotion_category: stringifyPromptValue(context.ema_context?.emotion_category),
      emotion_details_json: stringifyPromptValue(context.ema_context?.emotion_details),
      ema_responses_json: stringifyPromptValue(context.ema_context?.ema_responses),
      ema_scale_scores_json: stringifyPromptValue(context.ema_context?.ema_scale_scores),
      classification_json: stringifyPromptValue(context.ema_context?.classification),
      ema_analysis_json: stringifyPromptValue(context.reflection_context?.ema_analysis),
      reflection_question: stringifyPromptValue(context.reflection_context?.reflection_question),
      reflection_response: stringifyPromptValue(context.reflection_context?.reflection_response),
      gestalt_types_json: stringifyPromptValue(context.gestalt_types),
    });

    const output = await runJsonCompletion<{ questions: string[] }>(runtime, {
      systemPrompt: template.system_prompt,
      userPrompt,
      outputSchema: template.output_schema,
    });

    const questions = Array.isArray(output.questions) ? output.questions.map((item) => String(item || '').trim()) : [];
    if (questions.length !== 5 || questions.some((item) => !item)) {
      throw new HttpError(502, 'OpenAI did not return five EMI questions');
    }

    await rpc(runtime, 'save_emi_questions', {
      p_flow_id: flowId,
      p_prompt_template_id: template.prompt_template_id,
      p_question_1: questions[0],
      p_question_2: questions[1],
      p_question_3: questions[2],
      p_question_4: questions[3],
      p_question_5: questions[4],
    });

    return jsonResponse({
      ok: true,
      user_id: user.id,
      flow_id: flowId,
      prompt_template_id: template.prompt_template_id,
      output: { questions },
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
