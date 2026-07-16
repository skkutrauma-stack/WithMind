import { getEmiAiResult } from '../app-api.js';
import { getFlowId, setFlowId, updateDailyState } from '../flow-state.js';

const DEFAULT_AI_COMMENT = '화를 삼키고 스스로를 다독인 하루였네. 참은 게 나빴다는 뜻은 아니야. 다음엔 "나 지금 좀 속상했어" 한마디가 너를 덜 젖게 해줄 거야.';

function safeTrim(value) {
  return String(value || '').trim();
}

function readJson(storage, key) {
  try {
    const raw = storage?.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeState(section, patch) {
  updateDailyState({
    [section]: patch,
  });
}

function syncEmotionMain(doc) {
  const cards = [...doc.querySelectorAll('button[data-slug][data-route]')];
  const nextButton = doc.querySelector('#mainNext');
  if (!cards.length || !nextButton) return;

  const sync = () => {
    const active = cards.find((card) => card.dataset.active === 'true') || null;
    writeState('emotionMain', {
      slug: active?.dataset.slug || '',
      label: safeTrim(active?.textContent),
      route: active?.dataset.route || '',
    });
  };

  cards.forEach((card) => card.addEventListener('click', () => queueMicrotask(sync)));
  nextButton.addEventListener('click', () => queueMicrotask(sync));
  sync();
}

function syncEmotionSubcategory(doc) {
  const grid = doc.querySelector('#optionGrid');
  const nextButton = doc.querySelector('#subNext');
  if (!grid || !nextButton) return;

  const sync = () => {
    const labels = [...grid.querySelectorAll('.option.is-active .label')].map((node) => safeTrim(node.textContent));
    writeState('emotionSubcategory', {
      main: safeTrim(doc.querySelector('#mainEmotionPill')?.textContent),
      label: safeTrim(doc.querySelector('#mainEmotionTitle')?.textContent),
      selectedLabels: labels,
    });
  };

  grid.addEventListener('click', () => queueMicrotask(sync));
  nextButton.addEventListener('click', () => queueMicrotask(sync));
  sync();
}

function syncCheckin(doc) {
  const nextButton = doc.querySelector('#nextButton');
  if (!nextButton) return;
  const sync = () => {
    const answers = readJson(sessionStorage, 'checkinAnswers') || readJson(localStorage, 'checkinAnswers') || {};
    writeState('checkin', { answers });
  };
  nextButton.addEventListener('click', () => queueMicrotask(sync));
  sync();
}

function syncMoodCharacter(doc) {
  const characterName = safeTrim(doc.querySelector('#characterName')?.textContent);
  if (!characterName) return;
  writeState('moodCharacter', {
    name: characterName,
  });
}

function syncMoodType(doc) {
  const nextButton = doc.querySelector('#nextBtn');
  const input = doc.querySelector('#situationInput');
  if (!nextButton || !input) return;
  const sync = () => {
    writeState('moodType', {
      characterName: safeTrim(doc.querySelector('#moodCharacterName')?.textContent),
      situation: safeTrim(input.value),
    });
  };
  input.addEventListener('input', sync);
  input.addEventListener('change', sync);
  nextButton.addEventListener('click', sync);
  sync();
}

function syncHardnessCheck(doc) {
  const nextButton = doc.querySelector('#nextBtn');
  const strategy = safeTrim(localStorage.getItem('selectedStrategy'));
  if (strategy) {
    writeState('hardness', { strategy });
  }
  if (!nextButton) return;
  const sync = () => {
    const activeChecks = [...doc.querySelectorAll('.check-item[data-active="true"]')].map((node) => safeTrim(node.textContent));
    writeState('hardness', {
      strategy: safeTrim(localStorage.getItem('selectedStrategy')),
      selectedChecks: activeChecks,
    });
  };
  nextButton.addEventListener('click', () => queueMicrotask(sync));
  sync();
}

function syncJournal(doc) {
  const doneButton = doc.querySelector('#doneBtn');
  const input = doc.querySelector('#journalInput');
  if (!doneButton || !input) return;
  const sync = () => {
    const selectedChecks = [...doc.querySelectorAll('.check-item[data-active="true"]')].map((node) => safeTrim(node.textContent));
    writeState('journal', {
      checks: selectedChecks,
      text: safeTrim(input.value),
    });
  };
  input.addEventListener('input', sync);
  input.addEventListener('change', sync);
  doneButton.addEventListener('click', sync);
  sync();
}

function syncAiComment(doc) {
  const textEl = doc.querySelector('#aiCommentText');
  if (!textEl) return;

  const fallbackText = safeTrim(textEl.dataset.fallbackText) || safeTrim(textEl.textContent) || DEFAULT_AI_COMMENT;
  const query = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
  const queryFlowId = safeTrim(query?.get('flowId') || query?.get('flow_id'));
  const storedFlowId = safeTrim(getFlowId('emi'));
  const candidates = [queryFlowId, storedFlowId].filter((value, index, list) => value && list.indexOf(value) === index);

  const baseState = {
    selectedEmotion: safeTrim(localStorage.getItem('selectedEmotion')),
    strategy: safeTrim(localStorage.getItem('selectedStrategy')),
    journalText: safeTrim(localStorage.getItem('journalText')),
    journalSelectedQuestions: readJson(localStorage, 'journalSelectedQuestions') || readJson(sessionStorage, 'journalSelectedQuestions') || [],
  };

  writeState('aiComment', {
    ...baseState,
    flowId: candidates[0] || '',
    status: 'loading',
  });

  const attemptLoad = async (payload) => {
    try {
      const response = await getEmiAiResult(payload);
      const data = response?.data || {};
      const result = data?.result || null;
      if (response?.ok && data?.found && result?.ai_comment) {
        return result;
      }
    } catch {
      // fall through to the next candidate and final fallback
    }
    return null;
  };

  (async () => {
    let result = null;
    for (const flowId of candidates) {
      result = await attemptLoad({ flowId });
      if (result) break;
    }
    if (!result) {
      result = await attemptLoad({});
    }

    if (result?.ai_comment) {
      const comment = safeTrim(result.ai_comment) || fallbackText;
      const resolvedFlowId = safeTrim(result.flow_id) || candidates[0] || '';
      textEl.textContent = comment;
      if (resolvedFlowId) {
        setFlowId('emi', resolvedFlowId);
      }
      writeState('aiComment', {
        ...baseState,
        flowId: resolvedFlowId,
        status: 'loaded',
        source: 'db',
        comment,
        loadedAt: new Date().toISOString(),
      });
      return;
    }

    textEl.textContent = fallbackText;
    writeState('aiComment', {
      ...baseState,
      flowId: candidates[0] || '',
      status: 'fallback',
      source: 'fallback',
      comment: fallbackText,
      loadedAt: new Date().toISOString(),
    });
  })();
}

export function bindDailyPage(doc = document) {
  const pageKey = doc?.documentElement?.dataset?.pageKey || '';
  if (!pageKey) return;

  if (pageKey === 'emotion-card-main') {
    syncEmotionMain(doc);
    return;
  }

  if (pageKey.startsWith('emotion-subcategory-')) {
    syncEmotionSubcategory(doc);
    return;
  }

  if (pageKey === 'checkin') {
    syncCheckin(doc);
    return;
  }

  if (pageKey === 'mood-character') {
    syncMoodCharacter(doc);
    return;
  }

  if (pageKey === 'mood-type') {
    syncMoodType(doc);
    return;
  }

  if (pageKey === 'hardness-check') {
    syncHardnessCheck(doc);
    return;
  }

  if (pageKey === 'journal') {
    syncJournal(doc);
    return;
  }

  if (pageKey === 'ai-comment') {
    syncAiComment(doc);
  }
}
