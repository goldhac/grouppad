// Product analytics + client-side error monitoring, via PostHog.
//
// The project key is injected at runtime by the server into
// `window.__PUBLIC_CONFIG__` (see server.js), so it's configured with a normal
// Railway variable (POSTHOG_KEY) and needs no rebuild to change. For local dev
// it also falls back to Vite's VITE_POSTHOG_KEY. When no key is present every
// function here is a silent no-op, so the app runs identically without analytics.

import posthog from 'posthog-js';

type PublicConfig = { posthogKey?: string; posthogHost?: string };

declare global {
  interface Window {
    __PUBLIC_CONFIG__?: PublicConfig;
  }
}

let enabled = false;

function readConfig(): PublicConfig {
  const injected = (typeof window !== 'undefined' && window.__PUBLIC_CONFIG__) || {};
  const key = injected.posthogKey || (import.meta.env.VITE_POSTHOG_KEY as string | undefined);
  const host =
    injected.posthogHost ||
    (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ||
    'https://us.i.posthog.com';
  return { posthogKey: key, posthogHost: host };
}

/** Initialise PostHog once, in production, only when a key is configured. */
export function initAnalytics(): void {
  if (enabled) return;
  if (!import.meta.env.PROD) return; // never phone home from the dev server
  const { posthogKey, posthogHost } = readConfig();
  if (!posthogKey) return; // no key configured → stay a no-op

  posthog.init(posthogKey, {
    api_host: posthogHost,
    // HashRouter: '#/...' navigations aren't real page loads, so we capture
    // pageviews manually on route change (see trackPageview) instead.
    capture_pageview: false,
    capture_pageleave: true,
    // Client-side error monitoring — unhandled exceptions/rejections become
    // PostHog error-tracking issues (the "no error visibility" audit gap).
    capture_exceptions: true,
    persistence: 'localStorage+cookie',
    autocapture: true,
  });
  enabled = true;
}

/** Manual pageview for the current hash route. Safe before init (no-op). */
export function trackPageview(pathname: string): void {
  if (!enabled) return;
  posthog.capture('$pageview', { $current_url: window.location.href, route: pathname });
}

/** Named funnel/product event. Safe before init (no-op). */
export function track(event: string, props?: Record<string, unknown>): void {
  if (!enabled) return;
  posthog.capture(event, props);
}

/** Tie subsequent events to a signed-in user. Safe before init (no-op). */
export function identify(userId: string, traits?: Record<string, unknown>): void {
  if (!enabled || !userId) return;
  posthog.identify(userId, traits);
}

/** Clear identity on sign-out. Safe before init (no-op). */
export function resetAnalytics(): void {
  if (!enabled) return;
  posthog.reset();
}
