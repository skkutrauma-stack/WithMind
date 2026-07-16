import { requireUser } from '../_shared/auth.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { HttpError, jsonResponse, toErrorMessage, toHttpError } from '../_shared/errors.ts';
import { getActivePromptTemplate, rpc } from '../_shared/supabase.ts';
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

function readFlowId(body: any) {
  return body?.flowId || body?.flow_id || body?.p_flow_id || '';
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const runtime = env();
    if (!runtime.OPENAI_API_KEY) throw new HttpError(500, 'OPENAI_API_KEY is required');
    const user = await requireUser(req, runtime);
    const body = await req.json().catch(() => ({}));
    const flowId = readFlowId(body);
    if (!flowId) throw new HttpError(400, 'flowId is required');

    const context = await rpc<any>(runtime, 'get_ema_llm_context', { p_flow_id: flowId });
    const template = await getActivePromptTemplate(runtime, 'ema_interpretation');
    const userPrompt = renderPromptTemplate(template.user_prompt_template, {
      emotion_category: stringifyPromptValue(context.emotion_category),
      emotion_details_json: stringifyPromptValue(context.emotion_details),
      ema_responses_json: stringifyPromptValue(context.ema_responses),
      ema_scale_scores_json: stringifyPromptValue(context.ema_scale_scores),
      classification_json: stringifyPromptValue(context.classification),
    });

    const output = await runJsonCompletion<{
      characteristic_1: string;
      characteristic_2: string;
      characteristic_3: string;
      ai_comment: string;
    }>(runtime, {
      systemPrompt: template.system_prompt,
      userPrompt,
      outputSchema: template.output_schema,
    });

    await rpc(runtime, 'save_ema_ai_result', {
      p_flow_id: flowId,
      p_prompt_template_id: template.prompt_template_id,
      p_characteristic_1: output.characteristic_1,
      p_characteristic_2: output.characteristic_2,
      p_characteristic_3: output.characteristic_3,
      p_ai_comment: output.ai_comment,
    });

    return jsonResponse({
      ok: true,
      user_id: user.id,
      flow_id: flowId,
      prompt_template_id: template.prompt_template_id,
      output,
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
