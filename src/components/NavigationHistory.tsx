'use client';

import React from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  consumeBackNavigationMark,
  getCurrentBrowserRoute,
  markRouteAsBackNavigation,
  normalizeAppRoute,
  readTrackedCurrentRoute,
  rememberAppReturnTarget,
  writeTrackedCurrentRoute,
} from '@/lib/appNavigation';

function getAnchor(event: MouseEvent) {
  const target = event.target;
  return target instanceof Element ? target.closest<HTMLAnchorElement>('a[href]') : null;
}

export function NavigationHistory() {
  const pathname = usePathname() || '/';
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const routeKey = query ? `${pathname}?${query}` : pathname;

  React.useEffect(() => {
    const previousRoute = readTrackedCurrentRoute();
    const isBackNavigation = consumeBackNavigationMark(routeKey);
    if (!isBackNavigation && previousRoute && previousRoute !== routeKey) {
      rememberAppReturnTarget(routeKey, previousRoute);
    }
    writeTrackedCurrentRoute(routeKey);
  }, [routeKey]);

  React.useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const anchor = getAnchor(event);
      if (!anchor || anchor.hasAttribute('download')) return;
      if (anchor.target && anchor.target !== '_self') return;

      const targetRoute = normalizeAppRoute(anchor.href, window.location.origin);
      const sourceRoute = getCurrentBrowserRoute();
      if (targetRoute && targetRoute !== sourceRoute) {
        rememberAppReturnTarget(targetRoute, sourceRoute);
      }
    };

    const handlePopState = () => {
      markRouteAsBackNavigation(getCurrentBrowserRoute());
    };

    document.addEventListener('click', handleClick, { capture: true });
    window.addEventListener('popstate', handlePopState);
    return () => {
      document.removeEventListener('click', handleClick, { capture: true });
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  return null;
}
