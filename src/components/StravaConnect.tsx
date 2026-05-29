'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Activity, ArrowRight } from 'lucide-react';

interface StravaConnectProps {
  className?: string;
}

export function StravaConnect({ className }: StravaConnectProps) {
  const { t } = useTranslation();

  const handleConnect = () => {
    // Use window.location for external redirect to avoid CORS
    window.location.href = '/api/auth/signin/strava';
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

    </div>
  );
}
