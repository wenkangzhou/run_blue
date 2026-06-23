'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { GUEST_USER } from '@/lib/guestMode';
import { useAuthStore } from '@/store/auth';
import { Activity, ArrowRight, Play } from 'lucide-react';

interface StravaConnectProps {
  className?: string;
}

export function StravaConnect({ className }: StravaConnectProps) {
  const { t } = useTranslation();

  const handleConnect = () => {
    // Use window.location for external redirect to avoid CORS
    window.location.href = '/api/auth/signin/strava';
  };

  const handleGuestMode = () => {
    useAuthStore.getState().setUser(GUEST_USER);
    window.location.href = '/activities';
  };

  return (
    <div className={cn('space-y-4', className)}>
      <button
        type="button"
        onClick={handleConnect}
        className="group flex w-full items-center justify-between gap-4 rounded-lg border border-orange-600 bg-orange-500 px-4 py-3 text-left text-white shadow-[0_10px_24px_rgba(234,88,12,0.22)] transition-colors hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-300 focus:ring-offset-2 dark:focus:ring-offset-zinc-950"
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-white/15">
            <Activity size={22} />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-bold">{t('auth.loginButton')}</span>
            <span className="block truncate text-xs text-orange-100">Powered by Strava API</span>
          </span>
        </span>
        <ArrowRight size={20} className="shrink-0 transition-transform group-hover:translate-x-0.5" />
      </button>

      <button
        type="button"
        onClick={handleGuestMode}
        className="group flex w-full items-center justify-between gap-4 rounded-lg border border-zinc-200 bg-white px-4 py-3 text-left text-zinc-800 transition-colors hover:border-blue-300 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:ring-offset-2 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:border-blue-700 dark:hover:bg-blue-950/30 dark:focus:ring-offset-zinc-950"
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-300">
            <Play size={20} />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-bold">{t('guest.enter', '游客体验')}</span>
            <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">
              {t('guest.enterHint', '使用示例数据先体验功能')}
            </span>
          </span>
        </span>
        <ArrowRight size={20} className="shrink-0 transition-transform group-hover:translate-x-0.5" />
      </button>

    </div>
  );
}
