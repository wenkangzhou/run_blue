'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

const STORAGE_PREFIX = 'run_blue_scroll:';
const RESTORE_DELAYS = [0, 50, 150, 350, 700, 1200, 1800];

function storageKey(routeKey: string) {
  return `${STORAGE_PREFIX}${routeKey || '/'}`;
}

function saveScrollPosition(routeKey: string) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(storageKey(routeKey), String(window.scrollY));
  } catch {
    // Ignore private browsing / storage quota edge cases.
  }
}

function getSavedScrollPosition(routeKey: string) {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(storageKey(routeKey));
    if (!raw) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

export function ScrollRestoration() {
  const pathname = usePathname() || '/';
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const routeKey = query ? `${pathname}?${query}` : pathname;
  const routeKeyRef = useRef(routeKey);
  const saveTimerRef = useRef<number | null>(null);
  const restoreTimersRef = useRef<number[]>([]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';

    const saveCurrent = () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      saveScrollPosition(routeKeyRef.current);
    };

    const cancelPendingRestore = () => {
      restoreTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      restoreTimersRef.current = [];
    };

    const handlePointerDown = () => {
      cancelPendingRestore();
      saveCurrent();
    };

    const scheduleSave = () => {
      if (saveTimerRef.current !== null) return;
      saveTimerRef.current = window.setTimeout(() => {
        saveTimerRef.current = null;
        saveScrollPosition(routeKeyRef.current);
      }, 120);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') saveCurrent();
    };

    window.addEventListener('scroll', scheduleSave, { passive: true });
    document.addEventListener('pointerdown', handlePointerDown, { capture: true });
    document.addEventListener('click', saveCurrent, { capture: true });
    window.addEventListener('wheel', cancelPendingRestore, { passive: true });
    window.addEventListener('touchstart', cancelPendingRestore, { passive: true });
    window.addEventListener('keydown', cancelPendingRestore);
    window.addEventListener('pagehide', saveCurrent);
    window.addEventListener('beforeunload', saveCurrent);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.history.scrollRestoration = previous;
      window.removeEventListener('scroll', scheduleSave);
      document.removeEventListener('pointerdown', handlePointerDown, { capture: true });
      document.removeEventListener('click', saveCurrent, { capture: true });
      window.removeEventListener('wheel', cancelPendingRestore);
      window.removeEventListener('touchstart', cancelPendingRestore);
      window.removeEventListener('keydown', cancelPendingRestore);
      window.removeEventListener('pagehide', saveCurrent);
      window.removeEventListener('beforeunload', saveCurrent);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
      restoreTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    routeKeyRef.current = routeKey;
    restoreTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    restoreTimersRef.current = [];

    const savedY = getSavedScrollPosition(routeKey);
    if (savedY === null || savedY <= 0) return;

    restoreTimersRef.current = RESTORE_DELAYS.map((delay) =>
      window.setTimeout(() => {
        const maxY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
        window.scrollTo({ top: Math.min(savedY, maxY || savedY), left: 0, behavior: 'auto' });
      }, delay)
    );
  }, [routeKey]);

  return null;
}
