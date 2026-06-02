import { withApiBase } from './apiBase';

let initialized = false;

const safeJson = (value) => {
  try {
    return JSON.stringify(value || {});
  } catch {
    return '{}';
  }
};

export const trackSiteEvent = (type, source = 'site', metadata = {}) => {
  if (!type || typeof window === 'undefined') return;

  const payload = {
    type,
    source,
    path: window.location.pathname,
    metadata: {
      ...metadata,
      title: document.title,
    },
  };

  const body = safeJson(payload);
  const url = withApiBase('/api/site-events');

  if (navigator.sendBeacon) {
    const blob = new Blob([body], { type: 'application/json' });
    navigator.sendBeacon(url, blob);
    return;
  }

  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => {});
};

export const initSiteAnalytics = () => {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;

  trackSiteEvent('page_view', 'initial_load', { path: window.location.pathname });

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const whatsappLink = target.closest('a[href*="wa.me"], a[href*="whatsapp"]');
    if (whatsappLink) {
      trackSiteEvent('whatsapp_click', whatsappLink.dataset.analyticsSource || 'whatsapp_cta', {
        text: whatsappLink.textContent?.trim().slice(0, 80) || '',
        href: whatsappLink.getAttribute('href') || '',
      });
      return;
    }

    const simulationButton = target.closest('.btn-simular, [data-analytics-event="simulation_click"]');
    if (simulationButton) {
      trackSiteEvent('simulation_click', simulationButton.dataset.analyticsSource || 'simulation_cta', {
        text: simulationButton.textContent?.trim().slice(0, 80) || '',
      });
    }
  });
};
