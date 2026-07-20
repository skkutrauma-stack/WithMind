const PAGE_TITLES = {
  account: '계정',
  agreement: '동의',
  alert: '안내',
  baseline_assessment: '기초평가',
  checkin: 'EMA',
  'emotion-card-main': '감정 선택',
  'emotion-subcategory-anger': '분노',
  'emotion-subcategory-apathy': '무기력함',
  'emotion-subcategory-discomfort': '불편함',
  'emotion-subcategory-fear': '두려움',
  'emotion-subcategory-joy': '기쁨',
  'emotion-subcategory-sadness': '슬픔',
  'emotion-subcategory-surprise': '놀람',
  'hardness-check': '경계',
  home: '홈',
  journal: '일기',
  landing: '시작',
  login: '로그인',
  'password-reset': '비밀번호 재설정',
  'mood-character': '캐릭터',
  'mood-type': '상황',
  profile: '프로필',
  safety_contact: '안전연락처',
  welcome: '환영',
  'ai-comment': 'AI 코멘트',
};

export function getPageName(pathname = '') {
  const path = String(pathname || '').replace(/\\/g, '/');
  const base = path.split('/').pop() || '';
  return base.replace(/\.html?$/i, '');
}

export function getPageSection(pathname = '') {
  const path = String(pathname || '').replace(/\\/g, '/');
  if (path.includes('/onboarding/')) return 'onboarding';
  if (path.includes('/daily/')) return 'daily';
  if (path.includes('/home/')) return 'home';
  if (path.includes('/record/')) return 'record';
  if (path.includes('/safetyplan/')) return 'safetyplan';
  if (path.includes('/etc/')) return 'etc';
  if (path.includes('/loading') || path.includes('/prototype')) return 'system';
  return 'other';
}

export function describePage(pathname = (typeof location !== 'undefined' ? location.pathname : '')) {
  const key = getPageName(pathname);
  return {
    key,
    section: getPageSection(pathname),
    label: PAGE_TITLES[key] || key.replace(/-/g, ' ') || 'page',
    pathname,
  };
}

export function applyPageStatus(doc = document, descriptor = describePage()) {
  if (!doc?.documentElement) return descriptor;
  doc.documentElement.dataset.pageKey = descriptor.key;
  doc.documentElement.dataset.pageSection = descriptor.section;
  if (doc.body) {
    doc.body.dataset.pageKey = descriptor.key;
    doc.body.dataset.pageSection = descriptor.section;
  }
  return descriptor;
}

export function renderStatusText(text, doc = document) {
  if (!doc?.querySelectorAll) return;
  for (const el of doc.querySelectorAll('[data-page-status-text]')) {
    el.textContent = text;
  }
}
