'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

const STORAGE_PREFIX = 'run_blue_scroll:';
const RESTORE_DELAYS = [0, 50, 150, 350, 700];

function storageKey(pathname: string) {
  return `${STORAGE_PREFIX}${pathname || '/'}`;
}

function saveScrollPosition(pathname: string) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(storageKey(pathname), String(window.scrollY));
  } catch {
    // Ignore private browsing / storage quota edge cases.
  }
}

function getSavedScrollPosition(pathname: string) {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(storageKey(pathname));
    if (!raw) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

export function ScrollRestoration() {
  const pathname = usePathname() || '/';
  const pathnameRef = useRef(pathname);
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
      saveScrollPosition(pathnameRef.current);
    };

    const scheduleSave = () => {
      if (saveTimerRef.current !== null) return;
      saveTimerRef.current = window.setTimeout(() => {
        saveTimerRef.current = null;
        saveScrollPosition(pathnameRef.current);
      }, 120);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') saveCurrent();
    };

    window.addEventListener('scroll', scheduleSave, { passive: true });
    document.addEventListener('pointerdown', saveCurrent, { capture: true });
    document.addEventListener('click', saveCurrent, { capture: true });
    window.addEventListener('pagehide', saveCurrent);
    window.addEventListener('beforeunload', saveCurrent);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.history.scrollRestoration = previous;
      window.removeEventListener('scroll', scheduleSave);
      document.removeEventListener('pointerdown', saveCurrent, { capture: true });
      document.removeEventListener('click', saveCurrent, { capture: true });
      window.removeEventListener('pagehide', saveCurrent);
      window.removeEventListener('beforeunload', saveCurrent);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
      restoreTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    pathnameRef.current = pathname;
    restoreTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    restoreTimersRef.current = [];

    const savedY = getSavedScrollPosition(pathname);
    if (savedY === null || savedY <= 0) return;

    restoreTimersRef.current = RESTORE_DELAYS.map((delay) =>
      window.setTimeout(() => {
        window.scrollTo({ top: savedY, left: 0, behavior: 'auto' });
      }, delay)
    );
  }, [pathname]);

  return null;
}
