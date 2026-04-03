'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { PixelCard, PixelButton } from '@/components/ui';
import { Activity, ChevronRight } from 'lucide-react';

export function StravaConnect() {
  const { t } = useTranslation();
  const router = useRouter();

  const handleConnect = () => {
    router.push('/api/auth/signin/strava');
  };

  return (
    <PixelCard variant="primary" className="p-8 max-w-md mx-auto text-center">
      <div className="w-20 h-20 mx-auto mb-6 bg-orange-500 border-4 border-orange-700 flex items-center justify-center">
        <Activity size={40} className="text-white" />
      </div>
      
      <h2 className="font-mono text-2xl font-bold mb-3">
        {t('auth.loginTitle')}
      </h2>
      
      <p className="font-mono text-sm text-zinc-600 dark:text-zinc-400 mb-8">
        {t('auth.loginDescription')}
      </p>

      <PixelButton
        size="lg"
        onClick={handleConnect}
        className="w-full bg-orange-500 border-orange-700 hover:bg-orange-400 dark:bg-orange-600 dark:border-orange-800"
      >
        <span className="flex items-center justify-center gap-2">
          {t('auth.loginButton')}
          <ChevronRight size={18} />
        </span>
      </PixelButton>

      <div className="mt-6 flex items-center justify-center gap-2 text-xs font-mono text-zinc-500">
        <span className="w-2 h-2 bg-green-500" />
        <span>Powered by Strava API</span>
      </div>
    </PixelCard>
  );
}
