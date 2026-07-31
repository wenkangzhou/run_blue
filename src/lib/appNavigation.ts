import { readSessionState, writeSessionState } from '@/lib/navigationState';

const RETURN_TARGETS_KEY = 'run_blue_navigation:return-targets';
const CURRENT_ROUTE_KEY = 'run_blue_navigation:current-route';
const SKIP_ROUTE_KEY = 'run_blue_navigation:skip-route';
const RETURN_TARGET_TTL = 1000 * 60 * 60 * 12;
const MAX_RETURN_TARGETS = 60;

export interface AppReturnTarget {
  source: string;
  capturedAt: number;
}

export type AppReturnTargets = Record<string, AppReturnTarget>;

function isReturnTargets(value: unknown): value is AppReturnTargets {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.values(value).every((entry) => (
    Boolean(entry)
    && typeof entry === 'object'
    && typeof (entry as AppReturnTarget).source === 'string'
    && typeof (entry as AppReturnTarget).capturedAt === 'number'
  ));
}

export function normalizeAppRoute(value: string, origin: string): string | null {
  try {
    const url = new URL(value, origin);
    if (url.origin !== origin) return null;
    if (!url.pathname.startsWith('/')) return null;
    if (url.pathname.startsWith('/_next') || url.pathname.startsWith('/api/')) return null;
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

export function isUsableReturnSource(source: string | null, current: string): source is string {
  return Boolean(
    source
    && source !== '/'
    && source !== '/~offline'
    && source !== current
  );
}

export function resolveAppBackTarget(
  current: string,
  fallback: string,
  targets: AppReturnTargets,
  now = Date.now()
): string {
  const entry = targets[current];
  if (
    entry
    && now - entry.capturedAt <= RETURN_TARGET_TTL
    && isUsableReturnSource(entry.source, current)
  ) {
    return entry.source;
  }
  return fallback;
}

function readReturnTargets(): AppReturnTargets {
  return readSessionState<AppReturnTargets>(RETURN_TARGETS_KEY, isReturnTargets) ?? {};
}

function writeReturnTargets(targets: AppReturnTargets) {
  const recentEntries = Object.entries(targets)
    .sort(([, left], [, right]) => right.capturedAt - left.capturedAt)
    .slice(0, MAX_RETURN_TARGETS);
  writeSessionState(RETURN_TARGETS_KEY, Object.fromEntries(recentEntries));
}

export function rememberAppReturnTarget(target: string, source: string) {
  if (typeof window === 'undefined') return;
  const origin = window.location.origin;
  const normalizedTarget = normalizeAppRoute(target, origin);
  const normalizedSource = normalizeAppRoute(source, origin);
  if (!normalizedTarget || !isUsableReturnSource(normalizedSource, normalizedTarget)) return;

  const targets = readReturnTargets();
  targets[normalizedTarget] = {
    source: normalizedSource,
    capturedAt: Date.now(),
  };
  writeReturnTargets(targets);
}

export function consumeAppReturnTarget(current: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const origin = window.location.origin;
  const normalizedCurrent = normalizeAppRoute(current, origin) ?? current;
  const normalizedFallback = normalizeAppRoute(fallback, origin) ?? fallback;
  const targets = readReturnTargets();
  const target = resolveAppBackTarget(normalizedCurrent, normalizedFallback, targets);

  if (targets[normalizedCurrent]) {
    delete targets[normalizedCurrent];
    writeReturnTargets(targets);
  }
  return target;
}

export function getCurrentBrowserRoute(): string {
  if (typeof window === 'undefined') return '/';
  return `${window.location.pathname}${window.location.search}`;
}

export function readTrackedCurrentRoute(): string | null {
  return readSessionState<string>(CURRENT_ROUTE_KEY, (value): value is string => typeof value === 'string');
}

export function writeTrackedCurrentRoute(route: string) {
  writeSessionState(CURRENT_ROUTE_KEY, route);
}

export function markRouteAsBackNavigation(route: string) {
  writeSessionState(SKIP_ROUTE_KEY, route);
}

export function consumeBackNavigationMark(route: string): boolean {
  const markedRoute = readSessionState<string>(SKIP_ROUTE_KEY, (value): value is string => typeof value === 'string');
  if (markedRoute !== route) return false;
  writeSessionState(SKIP_ROUTE_KEY, '');
  return true;
}
