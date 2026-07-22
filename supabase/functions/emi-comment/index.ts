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

const PERSONALIZATION_RULES = `
[personalization-rules-v2]
- 선택 질문과 사용자의 통합 응답을 가장 중요한 근거로 삼는다.
- [reflect-user-phrase] 첫 문장에는 통합 응답에서 핵심 단어·표현·행동 하나를 자연스럽게 포함하여, 이 기록에만 해당하는 구체적인 관찰을 작성한다.
- [connect-supported-context] 둘째 문장에는 현재 감정과 게슈탈트 접촉 방식 중 입력으로 확인되는 맥락 하나를 연결하되, "EMA", "점수", "분류", "게슈탈트", "유형" 같은 내부 용어는 사용자에게 노출하지 않는다.
- [suggest-concrete-next-step] 셋째 문장에는 지금 바로 해볼 수 있는 작고 구체적인 행동 하나 또는 짧은 알아차림 질문 하나를 제안한다.
- 입력에 없는 상황, 관계, 원인, 의도는 추측하지 않는다. 진단하거나 단정하지 않는다.
- 두 질문에 하나의 통합 응답만 있는 경우, 질문별로 따로 답했다고 꾸며내지 않는다.
- 3문장, 120~240자 정도의 자연스러운 한국어로 작성한다.
- [avoid-generic-language] "잘 정리해 주셨어요", "그 상황을 중심으로", "정답을 찾기보다", "마음과 몸의 반응을 구분", "충분히 의미가 있습니다" 같은 범용 문구를 사용하지 않는다.
`;

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
    const template = await getActivePromptTemplate(runtime, 'emi_response_comment');
    const renderedUserPrompt = renderPromptTemplate(template.user_prompt_template, {
      emotion_category: stringifyPromptValue(context.ema_context?.emotion_category),
      emotion_details_json: stringifyPromptValue(context.ema_context?.emotion_details),
      ema_responses_json: stringifyPromptValue(context.ema_context?.ema_responses),
      ema_scale_scores_json: stringifyPromptValue(context.ema_context?.ema_scale_scores),
      classification_json: stringifyPromptValue(context.ema_context?.classification),
      ema_analysis_json: stringifyPromptValue(context.reflection_context?.ema_analysis),
      reflection_question: stringifyPromptValue(context.reflection_context?.reflection_question),
      reflection_response: stringifyPromptValue(context.reflection_context?.reflection_response),
      gestalt_types_json: stringifyPromptValue(context.gestalt_types),
      selected_question_1: stringifyPromptValue(context.selected_question_1),
      selected_question_2: stringifyPromptValue(context.selected_question_2),
      combined_response: stringifyPromptValue(context.combined_response),
    });
    const systemPrompt = template.system_prompt.includes('[personalization-rules-v2]')
      ? template.system_prompt
      : `${template.system_prompt.trim()}\n\n${PERSONALIZATION_RULES.trim()}`;
    const priorityContext = `[priority-journal-context]
[최우선 자기성찰 기록]
선택 질문 1: ${stringifyPromptValue(context.selected_question_1)}
선택 질문 2: ${stringifyPromptValue(context.selected_question_2)}
사용자의 통합 응답: ${stringifyPromptValue(context.combined_response)}`;
    const userPrompt = renderedUserPrompt.includes('[priority-journal-context]')
      ? renderedUserPrompt
      : `${priorityContext}\n\n[보조 맥락]\n${renderedUserPrompt}`;

    const output = await runJsonCompletion<{ ai_comment: string }>(runtime, {
      systemPrompt,
      userPrompt,
      outputSchema: template.output_schema,
    });

    await rpc(runtime, 'save_emi_ai_result', {
      p_flow_id: flowId,
      p_prompt_template_id: template.prompt_template_id,
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
