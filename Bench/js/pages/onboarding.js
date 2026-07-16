import { updateOnboardingState } from '../flow-state.js';

function safeTrim(value) {
  return String(value || '').trim();
}

function syncAccountDraft(doc) {
  const inputs = [...doc.querySelectorAll('input')];
  if (inputs.length < 3) return;
  const [emailInput, passwordInput, nicknameInput] = inputs;
  updateOnboardingState({
    account: {
      email: safeTrim(emailInput?.value),
      nickname: safeTrim(nicknameInput?.value),
      passwordLength: safeTrim(passwordInput?.value).length,
    },
  });
}

function bindAccountPage(doc) {
  const nextButton = doc.querySelector('.account-next');
  if (!nextButton || nextButton.dataset.withmindBound === 'true') return;
  const inputs = [...doc.querySelectorAll('input')];
  const sync = () => syncAccountDraft(doc);
  for (const input of inputs) {
    input.addEventListener('input', sync);
    input.addEventListener('change', sync);
  }
  nextButton.addEventListener('click', sync);
  nextButton.dataset.withmindBound = 'true';
  sync();
}

function getGenderValue(button, index) {
  const explicit = button?.dataset?.value;
  if (explicit) return explicit;
  return ['male', 'female', 'private'][index] || '';
}

function bindProfilePage(doc) {
  const genderButtons = [...doc.querySelectorAll('.gender')];
  const birthGroups = [...doc.querySelectorAll('.birth-group')];
  const regionGroup = doc.querySelector('.region-group');
  const educationGroup = doc.querySelector('.education-group');
  const nextButton = doc.querySelector('.next-btn');
  if (!genderButtons.length || nextButton?.dataset.withmindBound === 'true') return;

  const profileState = {
    genderCode: '',
    birthYear: '',
    birthMonth: '',
    birthDay: '',
    birthDate: '',
    regionName: '',
    educationCode: '',
  };

  const commit = () => {
    const birthDate = profileState.birthYear && profileState.birthMonth && profileState.birthDay
      ? `${profileState.birthYear}-${profileState.birthMonth}-${profileState.birthDay}`
      : '';
    updateOnboardingState({
      profile: {
        ...profileState,
        birthDate,
      },
    });
  };

  const setGender = (genderCode) => {
    profileState.genderCode = genderCode;
    genderButtons.forEach((button, index) => {
      const value = getGenderValue(button, index);
      button.dataset.active = String(value === genderCode);
      button.setAttribute('aria-pressed', String(value === genderCode));
    });
    commit();
  };

  genderButtons.forEach((button, index) => {
    const value = getGenderValue(button, index);
    button.dataset.value = value;
    button.addEventListener('click', () => setGender(value));
  });

  const closeBirthMenus = () => birthGroups.forEach((group) => {
    group.dataset.open = 'false';
  });

  const updateBirthState = (key, value) => {
    profileState[`birth${key[0].toUpperCase()}${key.slice(1)}`] = value;
    commit();
  };

  birthGroups.forEach((group) => {
    const key = group.dataset.key || '';
    const trigger = group.querySelector('.birth-trigger');
    const display = group.querySelector('.birth-display');
    const options = [...group.querySelectorAll('.birth-option')];
    trigger?.addEventListener('click', (event) => {
      event.stopPropagation();
      const willOpen = group.dataset.open !== 'true';
      closeBirthMenus();
      group.dataset.open = String(willOpen);
    });
    options.forEach((option) => {
      option.addEventListener('click', (event) => {
        event.stopPropagation();
        const value = safeTrim(option.dataset.value);
        display.textContent = value || (key === 'year' ? '년' : key === 'month' ? '월' : '일');
        group.dataset.open = 'false';
        if (key === 'year') updateBirthState('year', value);
        if (key === 'month') updateBirthState('month', value);
        if (key === 'day') updateBirthState('day', value);
      });
    });
  });

  const closeSingleSelect = (group) => {
    if (group) group.dataset.open = 'false';
  };

  const bindSingleSelect = (group, key, triggerSelector, displaySelector, optionSelector, fallbackLabel) => {
    if (!group) return;
    const trigger = group.querySelector(triggerSelector);
    const display = group.querySelector(displaySelector);
    const options = [...group.querySelectorAll(optionSelector)];
    trigger?.addEventListener('click', (event) => {
      event.stopPropagation();
      closeBirthMenus();
      closeSingleSelect(regionGroup);
      closeSingleSelect(educationGroup);
      group.dataset.open = String(group.dataset.open !== 'true');
    });
    options.forEach((option) => {
      option.addEventListener('click', (event) => {
        event.stopPropagation();
        const value = safeTrim(option.dataset.value);
        group.dataset.value = value;
        display.textContent = safeTrim(option.textContent) || fallbackLabel;
        group.dataset.open = 'false';
        profileState[key] = value;
        commit();
      });
    });
  };

  bindSingleSelect(regionGroup, 'regionName', '.region-trigger', '.region-display', '.region-option', '지역');
  bindSingleSelect(educationGroup, 'educationCode', '.education-trigger', '.education-display', '.education-option', '최종 학력');

  doc.addEventListener('click', () => {
    closeBirthMenus();
    closeSingleSelect(regionGroup);
    closeSingleSelect(educationGroup);
  });

  nextButton?.addEventListener('click', () => {
    commit();
  });

  const initialGender = genderButtons.find((button, index) => String(button.dataset.active) === 'true') || genderButtons[0];
  if (initialGender) {
    setGender(initialGender.dataset.value || getGenderValue(initialGender, genderButtons.indexOf(initialGender)));
  }

  nextButton && (nextButton.dataset.withmindBound = 'true');
  commit();
}

function bindAgreementPage(doc) {
  const items = [...doc.querySelectorAll('.agree-item')];
  const startButton = doc.querySelector('#startBtn');
  if (!items.length || !startButton || startButton.dataset.withmindBound === 'true') return;
  const sync = () => {
    updateOnboardingState({
      agreement: {
        accepted: items.every((item) => item.dataset.active === 'true'),
      },
    });
  };
  items.forEach((item) => item.addEventListener('click', () => queueMicrotask(sync)));
  startButton.addEventListener('click', sync);
  startButton.dataset.withmindBound = 'true';
  sync();
}

function bindBaselinePage(doc) {
  const nextButton = doc.querySelector('#nextButton');
  if (!nextButton || nextButton.dataset.withmindBound === 'true') return;
  const sync = () => {
    const cards = [...doc.querySelectorAll('.assessment-card')];
    const values = {};
    for (const card of cards) {
      const key = card.dataset.key;
      if (!key) continue;
      values[key] = Number(card.dataset.value || '');
    }
    updateOnboardingState({ baselineAssessment: values });
  };
  nextButton.addEventListener('click', sync);
  nextButton.dataset.withmindBound = 'true';
  sync();
}

function bindSafetyContactPage(doc) {
  const primaryButton = doc.querySelector('.primary-btn');
  const ghostButton = doc.querySelector('.ghost-btn');
  const fields = [...doc.querySelectorAll('textarea, input')];
  if ((!primaryButton && !ghostButton) || primaryButton?.dataset.withmindBound === 'true') return;
  const sync = () => {
    const [warningSigns, calmingMethods, contactText] = fields.map((field) => safeTrim(field.value));
    updateOnboardingState({
      safetyContact: {
        warningSigns,
        calmingMethods,
        contactText,
      },
    });
  };
  for (const field of fields) {
    field.addEventListener('input', sync);
    field.addEventListener('change', sync);
  }
  primaryButton?.addEventListener('click', sync);
  ghostButton?.addEventListener('click', sync);
  if (primaryButton) primaryButton.dataset.withmindBound = 'true';
  sync();
}

function bindLoginPage(doc) {
  const loginButton = doc.querySelector('.login-btn');
  if (!loginButton || loginButton.dataset.withmindBound === 'true') return;
  const inputs = [...doc.querySelectorAll('input.field')];
  const sync = () => {
    updateOnboardingState({
      login: {
        email: safeTrim(inputs[0]?.value),
        hasPassword: safeTrim(inputs[1]?.value).length > 0,
      },
    });
  };
  for (const input of inputs) {
    input.addEventListener('input', sync);
    input.addEventListener('change', sync);
  }
  loginButton.addEventListener('click', sync);
  loginButton.dataset.withmindBound = 'true';
  sync();
}

function bindSimplePage(doc, key) {
  updateOnboardingState({
    lastOnboardingPage: key,
  });
}

export function bindOnboardingPage(doc = document) {
  const pageKey = doc?.documentElement?.dataset?.pageKey || '';
  if (!pageKey) return;

  if (pageKey === 'account') {
    bindAccountPage(doc);
    return;
  }
  if (pageKey === 'profile') {
    bindProfilePage(doc);
    return;
  }
  if (pageKey === 'agreement') {
    bindAgreementPage(doc);
    return;
  }
  if (pageKey === 'baseline_assessment') {
    bindBaselinePage(doc);
    return;
  }
  if (pageKey === 'safety_contact') {
    bindSafetyContactPage(doc);
    return;
  }
  if (pageKey === 'login') {
    bindLoginPage(doc);
    return;
  }
  bindSimplePage(doc, pageKey);
}
