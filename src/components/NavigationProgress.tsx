'use client';

import React from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { Loader2, WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

const SLOW_NAVIGATION_DELAY = 650;
const SETTLE_DELAY = 260;
const FALLBACK_IDLE_DELAY = 18000;

function isTrackableUrl(url: URL) {
  if (typeof window === 'undefined') return false;
  if (url.origin !== window.location.origin) return false;
  if (url.pathname.startsWith('/_next')) return false;
  if (url.pathname === window.location.pathname && url.search === window.location.search) return false;
  return true;
}

function getAnchorFromEvent(event: MouseEvent) {
  const target = event.target;
  if (!(target instanceof Element)) return null;
  return target.closest<HTMLAnchorElement>('a[href]');
}

export function NavigationProgress() {
  const { t } = useTranslation();
  const isOnline = useOnlineStatus();
  const pathname = usePathname() || '/';
  const searchParams = useSearchParams();
  const routeKey = React.useMemo(() => {
    const query = searchParams.toString();
    return query ? `${pathname}?${query}` : pathname;
  }, [pathname, searchParams]);

  const [phase, setPhase] = React.useState<'idle' | 'pending' | 'settling'>('idle');
  const [progress, setProgress] = React.useState(0);
  const [showSlowHint, setShowSlowHint] = React.useState(false);
  const currentRouteRef = React.useRef(routeKey);
  const phaseRef = React.useRef(phase);
  const timersRef = React.useRef<number[]>([]);
  const intervalRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const clearTimers = React.useCallback(() => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current = [];
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const finish = React.useCallback(() => {
    if (phaseRef.current === 'idle') return;
    clearTimers();
    setShowSlowHint(false);
    setProgress(100);
    setPhase('settling');

    timersRef.current.push(
      window.setTimeout(() => {
        setPhase('idle');
        setProgress(0);
      }, SETTLE_DELAY)
    );
  }, [clearTimers]);

  const begin = React.useCallback((nextUrl?: URL | string) => {
    if (typeof window === 'undefined') return;

    if (nextUrl) {
      const url = typeof nextUrl === 'string' ? new URL(nextUrl, window.location.href) : nextUrl;
      if (!isTrackableUrl(url)) return;
    }

    clearTimers();
    setShowSlowHint(false);
    setPhase('pending');
    setProgress((value) => (value > 8 && value < 100 ? value : 12));

    intervalRef.current = window.setInterval(() => {
      setProgress((value) => {
        if (value >= 88) return value;
        const step = value < 38 ? 9 : value < 70 ? 5 : 2;
        return Math.min(88, value + step);
      });
    }, 190);

    timersRef.current.push(
      window.setTimeout(() => setShowSlowHint(true), SLOW_NAVIGATION_DELAY),
      window.setTimeout(() => finish(), FALLBACK_IDLE_DELAY)
    );
  }, [clearTimers, finish]);

  React.useEffect(() => {
    currentRouteRef.current = routeKey;
    finish();
  }, [finish, routeKey]);

  React.useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const anchor = getAnchorFromEvent(event);
      if (!anchor) return;
      if (anchor.target && anchor.target !== '_self') return;
      if (anchor.hasAttribute('download')) return;
      if (anchor.dataset.noProgress === 'true') return;

      begin(new URL(anchor.href, window.location.href));
    };

    const handlePopState = () => {
      begin();
    };

    document.addEventListener('click', handleClick, { capture: true });
    window.addEventListener('popstate', handlePopState);

    return () => {
      document.removeEventListener('click', handleClick, { capture: true });
      window.removeEventListener('popstate', handlePopState);
      clearTimers();
    };
  }, [begin, clearTimers]);

  if (phase === 'idle') return null;

  return (
    <>
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-[10000] h-[3px] overflow-hidden bg-transparent"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress)}
      >
        <div
          className="h-full rounded-r-full bg-blue-600 shadow-[0_0_16px_rgba(37,99,235,0.55)] transition-[width] duration-200 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {showSlowHint && (
        <div
          className="pointer-events-none fixed left-1/2 z-[10000] flex -translate-x-1/2 items-center gap-2 rounded-lg border border-zinc-200 bg-white/95 px-3 py-2 font-mono text-xs font-bold text-zinc-700 shadow-lg shadow-zinc-900/10 backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/95 dark:text-zinc-100"
          style={{ bottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}
          aria-live="polite"
        >
          {isOnline ? <Loader2 size={14} className="animate-spin text-blue-600" /> : <WifiOff size={14} className="text-amber-500" />}
          <span>
            {isOnline
              ? t('navigation.slow', '网络有点慢，正在加载')
              : t('navigation.offline', '网络已断开，正在尝试读取缓存')}
          </span>
        </div>
      )}
    </>
  );
}
