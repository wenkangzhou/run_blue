'use client';

import React from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useActivitiesStore } from '@/store/activities';
import { useRoutesStore } from '@/store/routes';
import { RouteCard } from '@/components/RouteCard';
import { MapPinOff, ChevronLeft } from 'lucide-react';

export default function RoutesPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const { activities } = useActivitiesStore();
  const { savedRoutes } = useRoutesStore();

  React.useEffect(() => {
    if (!isAuthenticated) {
      router.push('/');
    }
  }, [isAuthenticated, router]);

  if (!isAuthenticated) return null;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* Minimal Header */}
      <div className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 max-w-2xl flex items-center justify-between">
          <Link
            href="/activities"
            className="inline-flex items-center gap-1 font-mono text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            <ChevronLeft size={16} />
            {t('common.back')}
          </Link>
          <h1 className="font-pixel text-base font-bold">{t('routes.title', '收藏路线')}</h1>
          <div className="w-16" />
        </div>
      </div>

      <div className="container mx-auto px-3 py-4 max-w-2xl">
        <p className="font-mono text-sm text-zinc-500 dark:text-zinc-400 mb-6">
          {t('routes.description', '收藏常跑路线，追踪每次表现变化')}
        </p>

        {savedRoutes.length === 0 ? (
          <div className="text-center py-16">
            <MapPinOff size={40} className="mx-auto text-zinc-300 dark:text-zinc-700 mb-4" />
            <p className="font-mono text-zinc-500 mb-2">{t('routes.emptyTitle', '还没有收藏任何路线')}</p>
            <p className="font-mono text-xs text-zinc-400">
              {t('routes.emptyHint', '在活动详情页点击「收藏路线」即可添加')}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {savedRoutes.map((route) => (
              <RouteCard key={route.key} route={route} activities={activities} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
