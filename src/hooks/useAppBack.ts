'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import {
  consumeAppReturnTarget,
  getCurrentBrowserRoute,
  markRouteAsBackNavigation,
} from '@/lib/appNavigation';

export function useAppBack(fallback: string) {
  const router = useRouter();

  return React.useCallback(() => {
    const target = consumeAppReturnTarget(getCurrentBrowserRoute(), fallback);
    markRouteAsBackNavigation(target);
    router.replace(target);
  }, [fallback, router]);
}
