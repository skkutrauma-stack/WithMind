import {
  getEmaResult,
  getEmi,
  getEmiAiResult,
  getReflection,
  invokeWorkflow,
  saveEmaAnswers,
  saveEmaReflectionResponse,
  saveEmiResponse,
  startEma,
  startEmaReflectionFlow,
  startEmiFlow,
  submitEma,
  submitEmaReflection,
  submitEmi,
} from '../app-api.js';
import { getFlowId, readFlowState, setFlowId, updateDailyState } from '../flow-state.js';
import { getSupabaseClient } from '../supabase-client.js';

const GESTALT_IDS = Object.freeze({ 반전: 1, 투사: 2, 내사: 3, 편향: 4, 자의식: 5, 융합: 6 });

const CHARACTER_IMAGE_PATHS = Object.freeze({
  1: '../assets/02_characters/transparent_1024/character_sun_pebble_1024.png',
  2: '../assets/02_characters/transparent_1024/character_cloud_cushion_1024.png',
  3: '../assets/02_characters/transparent_1024/character_water_pot_1024.png',
  4: '../assets/02_characters/transparent_1024/character_radio_1024.png',
  5: '../assets/02_characters/transparent_1024/character_tense_balloon_1024.png',
  6: '../assets/02_characters/transparent_1024/character_tangled_earphones_1024.png',
});

function text(value) {
  return String(value ?? '').trim();
}

function readJson(storage, key) {
  try { return JSON.parse(storage?.getItem(key) || 'null'); } catch { return null; }
}

function dataOf(response) {
  if (!response?.ok) throw new Error(response?.reason || response?.error || '서버 요청에 실패했어요.');
  return response.data ?? response;
}

function setBusy(button, busy, label = '처리 중...') {
  if (!button) return;
  if (!button.dataset.idleText) button.dataset.idleText = text(button.textContent);
  button.disabled = busy;
  button.textContent = busy ? label : button.dataset.idleText;
  button.style.opacity = busy ? '.65' : '1';
}

function showError(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (/active completed user profile is required/i.test(message)) {
    globalThis.alert?.('계정은 있지만 프로필 설정이 아직 완료되지 않았어요. 프로필을 저장한 뒤 다시 감정검사를 시작해 주세요.');
    location.href = '../onboarding/profile.html?resume=ema';
    return;
  }
  globalThis.alert?.(message);
}

function captureClick(button, handler) {
  if (!button || button.dataset.withmindBound === 'true') return;
  button.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    try {
      await handler();
    } catch (error) {
      setBusy(button, false);
      showError(error);
    }
  }, { capture: true });
  button.dataset.withmindBound = 'true';
}

function bindEmotionMain(doc) {
  const cards = [...doc.querySelectorAll('button[data-slug][data-route]')];
  const button = doc.querySelector('#mainNext');
  const sync = () => {
    const active = cards.find((card) => card.dataset.active === 'true');
    updateDailyState({ emotionMain: { slug: active?.dataset.slug || '', label: text(active?.textContent), route: active?.dataset.route || '' } });
  };
  cards.forEach((card) => card.addEventListener('click', () => queueMicrotask(sync)));
  button?.addEventListener('click', sync);
  sync();
}

function bindEmotionSubcategory(doc) {
  const grid = doc.querySelector('#optionGrid');
  const button = doc.querySelector('#subNext');
  captureClick(button, async () => {
    const selectedLabels = [...grid.querySelectorAll('.option.is-active .label')].map((node) => text(node.textContent));
    const categoryKey = text(readFlowState().daily?.emotionMain?.slug) || text(location.pathname.match(/subcategory-([a-z-]+)/)?.[1]);
    if (!categoryKey || selectedLabels.length < 1 || selectedLabels.length > 3) throw new Error('감정을 1개에서 3개까지 선택해 주세요.');
    setBusy(button, true, '저장 중...');
    const result = dataOf(await startEma({ categoryKey, detailNames: selectedLabels }));
    const flowId = result?.flow_id || result;
    if (!flowId) throw new Error('EMA 흐름을 만들지 못했어요.');
    setFlowId('ema', flowId);
    updateDailyState({ emotionSubcategory: { categoryKey, selectedLabels } });
    location.href = './checkin.html';
  });
}

function bindCheckin(doc) {
  const button = doc.querySelector('#nextButton');
  const list = doc.querySelector('#questionList');
  let draftTimer = null;
  const readAnswers = () => {
    const stored = readJson(sessionStorage, 'checkinAnswers');
    if (Array.isArray(stored) && stored.length === 31) return stored;
    return [...doc.querySelectorAll('.qcard')].map((card) => {
      const dots = [...card.querySelectorAll('.dot')];
      const active = dots.findIndex((dot) => dot.dataset.active === 'true');
      return active >= 0 ? active : null;
    });
  };
  list?.addEventListener('click', () => {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(async () => {
      const flowId = getFlowId('ema');
      if (!flowId) return;
      await saveEmaAnswers({ flowId, answers: readAnswers(), partial: true }).catch(() => null);
    }, 700);
  });
  captureClick(button, async () => {
    const flowId = getFlowId('ema');
    const answers = readAnswers();
    if (!flowId) throw new Error('EMA 흐름 정보가 없어요. 감정 선택부터 다시 시작해 주세요.');
    if (answers.length !== 31 || answers.some((value) => value == null)) throw new Error('31개 문항에 모두 답해 주세요.');
    clearTimeout(draftTimer);
    setBusy(button, true, '마음 분석 중...');
    dataOf(await saveEmaAnswers({ flowId, answers }));
    dataOf(await submitEma({ flowId }));
    const interpretation = await invokeWorkflow('ema-interpret', { flowId });
    if (!interpretation?.ok) throw new Error(interpretation?.error || 'EMA AI 분석에 실패했어요.');
    const reflectionResult = dataOf(await startEmaReflectionFlow({ sourceEmaFlowId: flowId }));
    const reflectionFlowId = reflectionResult?.flow_id || reflectionResult;
    setFlowId('emaReflection', reflectionFlowId);
    const reflection = await invokeWorkflow('ema-reflection-question', { flowId: reflectionFlowId });
    if (!reflection?.ok) throw new Error(reflection?.error || '성찰 질문 생성에 실패했어요.');
    updateDailyState({ checkin: { completedAt: new Date().toISOString() } });
    location.href = './mood-character.html';
  });
}

async function bindMoodCharacter(doc) {
  const flowId = getFlowId('ema');
  const commentEl = doc.querySelector('.comment-scroll');
  const setComment = (message, state) => {
    if (!commentEl) return;
    commentEl.textContent = message;
    commentEl.dataset.aiCommentState = state;
    commentEl.setAttribute('aria-busy', String(state === 'loading'));
  };
  const session = getSupabaseClient().auth.getSession();
  if (!flowId && !session?.access_token) {
    setComment('감정 검사를 완료하면 마음 도사의 코멘트를 확인할 수 있어요.', 'empty');
    return;
  }
  try {
    const result = dataOf(await getEmaResult(flowId ? { flowId } : {}));
    const name = text(result?.type?.character_name);
    const comment = text(result?.analysis?.ai_comment);
    const nameEl = doc.querySelector('#characterName');
    const imageEl = doc.querySelector('.character-panel img');
    if (name && nameEl) nameEl.textContent = name;
    if (comment) setComment(comment, 'ready');
    else setComment('저장된 AI 분석 결과가 없어요. 감정 검사를 다시 완료해 주세요.', 'empty');
    if (imageEl) {
      const localImagePath = CHARACTER_IMAGE_PATHS[Number(result?.type?.type_id)];
      if (localImagePath) {
        imageEl.src = localImagePath;
      } else if (result?.type?.image_bucket && result?.type?.image_path) {
        const base = getSupabaseClient().config.storageUrl;
        imageEl.src = `${base}/object/public/${encodeURIComponent(result.type.image_bucket)}/${String(result.type.image_path).split('/').map(encodeURIComponent).join('/')}`;
      }
      imageEl.alt = name || imageEl.alt;
    }
    if (!flowId && result?.analysis?.flow_id) setFlowId('ema', result.analysis.flow_id);
    if (name) localStorage.setItem('selectedMoodCharacter', name);
    updateDailyState({ moodCharacter: { ...result, name } });
  } catch {
    setComment('AI 코멘트를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.', 'error');
  }
}

async function bindMoodType(doc) {
  const button = doc.querySelector('#nextBtn');
  const input = doc.querySelector('#situationInput');
  const flowId = getFlowId('emaReflection');
  if (flowId) {
    try {
      const result = dataOf(await getReflection({ flowId }));
      const question = text(result?.reflection?.reflection_question);
      const questionEl = doc.querySelector('.input-card p:nth-of-type(2)');
      if (question && questionEl) questionEl.textContent = question;
      if (result?.reflection?.user_response && input) input.value = result.reflection.user_response;
    } catch (error) {
      showError(error);
    }
  }
  captureClick(button, async () => {
    const response = text(input?.value);
    if (!flowId) throw new Error('성찰 흐름 정보가 없어요. EMA부터 다시 진행해 주세요.');
    if (!response) throw new Error('질문에 대한 답을 적어 주세요.');
    setBusy(button, true, '저장 중...');
    dataOf(await saveEmaReflectionResponse({ flowId, userResponse: response }));
    dataOf(await submitEmaReflection({ flowId }));
    updateDailyState({ moodType: { response, savedAt: new Date().toISOString() } });
    location.href = './hardness-check.html';
  });
}

function bindHardness(doc) {
  const button = doc.querySelector('#nextBtn');
  captureClick(button, async () => {
    const active = doc.querySelector('.choice[data-active="true"]');
    const strategy = text(active?.dataset.key);
    const gestaltTypeId = GESTALT_IDS[strategy];
    const reflectionFlowId = getFlowId('emaReflection');
    if (!reflectionFlowId) throw new Error('성찰 흐름 정보가 없어요.');
    if (!gestaltTypeId) throw new Error('가장 가까운 접촉경계 유형을 선택해 주세요.');
    setBusy(button, true, '질문 만드는 중...');
    localStorage.setItem('selectedStrategy', strategy);
    const result = dataOf(await startEmiFlow({ sourceReflectionFlowId: reflectionFlowId, gestaltTypeIds: [gestaltTypeId] }));
    const flowId = result?.flow_id || result;
    setFlowId('emi', flowId);
    const generated = await invokeWorkflow('emi-generate-questions', { flowId });
    if (!generated?.ok) throw new Error(generated?.error || 'EMI 질문 생성에 실패했어요.');
    updateDailyState({ hardness: { strategy, gestaltTypeId } });
    location.href = './journal.html';
  });
}

async function bindJournal(doc) {
  const button = doc.querySelector('#doneBtn');
  const input = doc.querySelector('#journalInput');
  const items = [...doc.querySelectorAll('.check-item')];
  const flowId = getFlowId('emi');
  if (flowId) {
    try {
      const result = dataOf(await getEmi({ flowId }));
      const questions = [1, 2, 3, 4, 5].map((index) => text(result?.emi?.[`question_${index}`]));
      items.forEach((item, index) => {
        const label = item.querySelector('span');
        if (label && questions[index]) label.textContent = questions[index];
      });
    } catch (error) {
      showError(error);
    }
  }
  captureClick(button, async () => {
    const selectedNumbers = items.map((item, index) => item.dataset.active === 'true' ? index + 1 : 0).filter(Boolean);
    const combinedResponse = text(input?.value);
    if (!flowId) throw new Error('EMI 흐름 정보가 없어요.');
    if (!selectedNumbers.length || !combinedResponse) throw new Error('질문을 선택하고 답을 적어 주세요.');
    setBusy(button, true, 'AI 코멘트 생성 중...');
    dataOf(await saveEmiResponse({
      flowId,
      selectedQuestion1No: selectedNumbers[0],
      selectedQuestion2No: selectedNumbers[1] || 0,
      combinedResponse,
    }));
    dataOf(await submitEmi({ flowId }));
    const comment = await invokeWorkflow('emi-comment', { flowId });
    if (!comment?.ok) throw new Error(comment?.error || 'AI 코멘트 생성에 실패했어요.');
    updateDailyState({ journal: { selectedNumbers, completedAt: new Date().toISOString() } });
    location.href = './ai-comment.html';
  });
}

async function bindAiComment(doc) {
  const target = doc.querySelector('#aiCommentText');
  const flowId = getFlowId('emi');
  if (!target || !flowId) return;
  try {
    const result = dataOf(await getEmiAiResult({ flowId }));
    const comment = text(result?.result?.ai_comment);
    if (comment) target.textContent = comment;
  } catch (error) {
    showError(error);
  }
}

export function bindDailyPage(doc = document) {
  const pageKey = doc?.documentElement?.dataset?.pageKey || '';
  if (pageKey === 'emotion-card-main') return bindEmotionMain(doc);
  if (pageKey.startsWith('emotion-subcategory-')) return bindEmotionSubcategory(doc);
  if (pageKey === 'checkin') return bindCheckin(doc);
  if (pageKey === 'mood-character') return void bindMoodCharacter(doc);
  if (pageKey === 'mood-type') return void bindMoodType(doc);
  if (pageKey === 'hardness-check') return bindHardness(doc);
  if (pageKey === 'journal') return void bindJournal(doc);
  if (pageKey === 'ai-comment') return void bindAiComment(doc);
}
