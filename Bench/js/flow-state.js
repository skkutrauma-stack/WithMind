const STORAGE_KEY = 'withmind:flow-state:v1';
const SESSION_KEY = 'withmind:flow-state:session:v1';

const DEFAULT_STATE = Object.freeze({
  version: 1,
  updatedAt: null,
  page: {
    key: '',
    section: '',
    label: '',
    lastSeenAt: null,
  },
  flowIds: {},
  onboarding: {},
  daily: {},
});

function getStorage(area) {
  try {
    return area === 'session'
      ? sessionStorage
      : localStorage;
  } catch {
    return null;
  }
}

function clone(value) {
  if (value == null) return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

function readRaw(storage, key) {
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeRaw(storage, key, value) {
  if (!storage) return false;
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function mergeState(base, patch) {
  const next = {
    ...base,
    ...patch,
    page: {
      ...base.page,
      ...(patch.page || {}),
    },
    flowIds: {
      ...base.flowIds,
      ...(patch.flowIds || {}),
    },
    onboarding: {
      ...base.onboarding,
      ...(patch.onboarding || {}),
    },
    daily: {
      ...base.daily,
      ...(patch.daily || {}),
    },
  };
  next.updatedAt = new Date().toISOString();
  return next;
}

export function readFlowState() {
  const sessionState = readRaw(getStorage('session'), SESSION_KEY);
  const localState = readRaw(getStorage('local'), STORAGE_KEY);
  return mergeState(DEFAULT_STATE, sessionState || localState || {});
}

export function writeFlowState(nextState, options = {}) {
  const state = mergeState(DEFAULT_STATE, nextState || {});
  const storageArea = options.storage === 'session' ? 'session' : 'local';
  const primary = getStorage(storageArea);
  const secondary = storageArea === 'session' ? getStorage('local') : getStorage('session');
  writeRaw(primary, storageArea === 'session' ? SESSION_KEY : STORAGE_KEY, state);
  if (secondary) {
    writeRaw(secondary, storageArea === 'session' ? STORAGE_KEY : SESSION_KEY, state);
  }
  return state;
}

export function patchFlowState(mutator, options = {}) {
  const current = readFlowState();
  const draft = clone(current) || {};
  const result = typeof mutator === 'function' ? mutator(draft) || draft : { ...draft, ...(mutator || {}) };
  return writeFlowState(result, options);
}

export function resetFlowState() {
  const local = getStorage('local');
  const session = getStorage('session');
  if (local) {
    try {
      local.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }
  if (session) {
    try {
      session.removeItem(SESSION_KEY);
    } catch {
      // ignore
    }
  }
  return mergeState(DEFAULT_STATE, {});
}

export function getFlowId(name) {
  return readFlowState().flowIds?.[name] || '';
}

export function setFlowId(name, value, options = {}) {
  return patchFlowState((state) => {
    state.flowIds = {
      ...(state.flowIds || {}),
      [name]: value || '',
    };
    return state;
  }, options);
}

export function updatePageState(patch, options = {}) {
  return patchFlowState((state) => {
    state.page = {
      ...(state.page || {}),
      ...(patch || {}),
    };
    return state;
  }, options);
}

export function updateOnboardingState(patch, options = {}) {
  return patchFlowState((state) => {
    state.onboarding = {
      ...(state.onboarding || {}),
      ...(patch || {}),
    };
    return state;
  }, options);
}

export function updateDailyState(patch, options = {}) {
  return patchFlowState((state) => {
    state.daily = {
      ...(state.daily || {}),
      ...(patch || {}),
    };
    return state;
  }, options);
}

export function updateFlowIds(patch, options = {}) {
  return patchFlowState((state) => {
    state.flowIds = {
      ...(state.flowIds || {}),
      ...(patch || {}),
    };
    return state;
  }, options);
}

export function setFlowSnapshot({ page = {}, flowIds = {}, onboarding = {}, daily = {} } = {}, options = {}) {
  return writeFlowState({
    ...readFlowState(),
    page,
    flowIds,
    onboarding,
    daily,
  }, options);
}
