'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useActivitiesStore } from '@/store/activities';
import { useRoutesStore } from '@/store/routes';
import { RouteCard } from '@/components/RouteCard';
import { Loader2, MapPinOff } from 'lucide-react';

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
    <div className="container mx-auto px-3 py-4">
      <div className="mb-6">
        <h1 className="font-pixel text-2xl font-bold">
          {t('routes.title', '收藏路线')}
        </h1>
        <p className="font-mono text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          {t('routes.description', '收藏常跑路线，追踪每次表现变化')}
        </p>
      </div>

      {savedRoutes.length === 0 ? (
        <div className="text-center py-16">
          <MapPinOff size={40} className="mx-auto text-zinc-300 dark:text-zinc-700 mb-4" />
          <p className="font-mono text-zinc-500 mb-2">{t('routes.emptyTitle', '还没有收藏任何路线')}</p>
          <p className="font-mono text-xs text-zinc-400">
            {t('routes.emptyHint', '在活动详情页点击「收藏路线」即可添加')}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {savedRoutes.map((route) => (
            <RouteCard key={route.key} route={route} activities={activities} />
          ))}
        </div>
      )}
    </div>
  );
}
