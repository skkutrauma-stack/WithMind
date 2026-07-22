import { applyPageStatus, describePage, renderStatusText } from './page-status.js';
import { patchFlowState, updatePageState } from './flow-state.js';
import { bindOnboardingPage } from './pages/onboarding.js?v=20260720-agreement-check';
import { bindDailyPage } from './pages/daily.js?v=20260722-mood-type-character';
import { bindSafetyPlanPage } from './pages/safetyplan.js';

const runtimeConfigReady = import('../runtime-config.js')
  .catch(() => null)
  .then(() => {
    const host = typeof location !== 'undefined' ? String(location.hostname || '') : '';
    const protocol = typeof location !== 'undefined' ? String(location.protocol || '') : '';
    const isLocalHost = /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(host);
    if (!isLocalHost && protocol !== 'file:') return null;
    return import('../runtime-config.local.js').catch(() => null);
  });
const globalKey = '__withmindEntryLoaded';
if (!globalThis[globalKey]) {
  globalThis[globalKey] = true;

  const bindLegacyNavigation = (doc) => {
    for (const element of doc.querySelectorAll('[onclick]')) {
      if (element.dataset.withmindLegacyNav === 'true') continue;
      const source = element.getAttribute('onclick') || '';
      const hrefMatch = source.match(/location\.href\s*=\s*['"]([^'"]+)['"]/i);
      const assignMatch = source.match(/location\.(?:assign|replace)\(\s*['"]([^'"]+)['"]\s*\)/i);
      const shouldGoBack = /history\.back\(\s*\)/i.test(source);
      const destination = hrefMatch?.[1] || assignMatch?.[1] || '';
      if (!destination && !shouldGoBack) continue;
      element.addEventListener('click', (event) => {
        if (element.dataset.withmindBound === 'true') return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (shouldGoBack) history.back();
        else location.href = destination;
      }, { capture: true });
      element.dataset.withmindLegacyNav = 'true';
    }
  };

  const boot = () => {
    const page = describePage(typeof location !== 'undefined' ? location.pathname : '');
    applyPageStatus(document, page);
    renderStatusText(page.label, document);
    updatePageState({
      key: page.key,
      section: page.section,
      label: page.label,
      lastSeenAt: new Date().toISOString(),
    });
    patchFlowState((state) => {
      state.page = {
        ...(state.page || {}),
        key: page.key,
        section: page.section,
        label: page.label,
        lastSeenAt: new Date().toISOString(),
      };
      return state;
    });
    bindLegacyNavigation(document);

    if (page.section === 'onboarding') {
      bindOnboardingPage(document);
      return;
    }

    if (page.section === 'daily') {
      bindDailyPage(document);
      return;
    }

    if (page.section === 'safetyplan') {
      bindSafetyPlanPage(document);
    }
  };

  const start = () => {
    const bootWhenRendered = () => {
      const dcRoot = document.querySelector('#dc-root');
      if (dcRoot?.firstElementChild) {
        boot();
        return;
      }
      if (!document.querySelector('x-dc') && !dcRoot) {
        boot();
        return;
      }

      const observer = new MutationObserver(() => {
        const renderedRoot = document.querySelector('#dc-root');
        if (!renderedRoot?.firstElementChild) return;
        observer.disconnect();
        boot();
      });
      observer.observe(document.body, { childList: true, subtree: true });
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', bootWhenRendered, { once: true });
    } else {
      bootWhenRendered();
    }
  };

  runtimeConfigReady.then(start, start);
}
