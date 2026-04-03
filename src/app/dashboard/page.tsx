'use client';

import React, { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useActivitiesStore } from '@/store/activities';
import { StatsCard } from '@/components/StatsCard';
import { ActivityCard } from '@/components/ActivityCard';
import { PixelCard, PixelButton } from '@/components/ui';
import { getActivities, formatDistance, formatDuration } from '@/lib/strava';
import { useSettingsStore } from '@/store/settings';
import {
  Activity,
  Clock,
  Route,
  TrendingUp,
  Flame,
  Calendar,
  ChevronRight,
} from 'lucide-react';
import Link from 'next/link';

export default function DashboardPage() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { isAuthenticated, user } = useAuth();
  const { activities, setActivities } = useActivitiesStore();
  const { unit } = useSettingsStore();

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/');
      return;
    }

    if (activities.length === 0 && user?.accessToken) {
      getActivities(user.accessToken, 1, 10).then(setActivities);
    }
  }, [isAuthenticated, user, activities.length, router, setActivities]);

  const stats = useMemo(() => {
    if (activities.length === 0) {
      return {
        totalDistance: 0,
        totalTime: 0,
        totalActivities: 0,
        avgDistance: 0,
        longestRun: 0,
      };
    }

    const runs = activities.filter((a) => a.type === 'Run');
    const totalDistance = runs.reduce((sum, a) => sum + a.distance, 0);
    const totalTime = runs.reduce((sum, a) => sum + a.moving_time, 0);
    const longestRun = Math.max(...runs.map((a) => a.distance), 0);

    return {
      totalDistance,
      totalTime,
      totalActivities: runs.length,
      avgDistance: runs.length > 0 ? totalDistance / runs.length : 0,
      longestRun,
    };
  }, [activities]);

  const recentActivities = activities.slice(0, 5);

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="font-pixel text-3xl md:text-4xl font-bold mb-8">
        {t('nav.dashboard')}
      </h1>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatsCard
          title={t('stats.totalDistance')}
          value={formatDistance(
            stats.totalDistance,
            unit === 'imperial' ? 'mi' : 'km'
          )}
          icon={Route}
          variant="primary"
        />
        <StatsCard
          title={t('stats.totalTime')}
          value={formatDuration(stats.totalTime)}
          icon={Clock}
          variant="success"
        />
        <StatsCard
          title={t('stats.totalActivities')}
          value={stats.totalActivities.toString()}
          icon={Activity}
          variant="warning"
        />
        <StatsCard
          title={t('stats.avgDistance')}
          value={formatDistance(
            stats.avgDistance,
            unit === 'imperial' ? 'mi' : 'km'
          )}
          icon={TrendingUp}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Activities */}
        <div className="lg:col-span-2">
          <PixelCard className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-mono font-bold text-lg flex items-center gap-2">
                <Calendar size={20} />
                {t('activity.title')}
              </h2>
              <Link href="/activities">
                <PixelButton variant="ghost" size="sm">
                  <span className="flex items-center gap-1">
                    {t('common.view')}
                    <ChevronRight size={16} />
                  </span>
                </PixelButton>
              </Link>
            </div>

            {recentActivities.length === 0 ? (
              <div className="text-center py-8">
                <p className="font-mono text-sm text-zinc-500">
                  {t('activity.noActivities')}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {recentActivities.map((activity) => (
                  <ActivityCard key={activity.id} activity={activity} showMap={false} />
                ))}
              </div>
            )}
          </PixelCard>
        </div>

        {/* Side Panel */}
        <div className="space-y-6">
          {/* Quick Stats */}
          <PixelCard className="p-4">
            <h2 className="font-mono font-bold text-lg mb-4">
              {t('stats.title')}
            </h2>
            <div className="space-y-4">
              <div className="flex justify-between items-center py-2 border-b-2 border-zinc-100 dark:border-zinc-800">
                <span className="font-mono text-sm text-zinc-500">
                  {t('stats.longestRun')}
                </span>
                <span className="font-mono font-bold">
                  {formatDistance(
                    stats.longestRun,
                    unit === 'imperial' ? 'mi' : 'km'
                  )}
                </span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="font-mono text-sm text-zinc-500">
                  {t('stats.thisWeek')}
                </span>
                <span className="font-mono font-bold">--</span>
              </div>
            </div>
          </PixelCard>

          {/* Action Card */}
          <PixelCard variant="primary" className="p-4">
            <h2 className="font-mono font-bold text-lg mb-2">
              Sync Activities
            </h2>
            <p className="font-mono text-sm text-zinc-600 dark:text-zinc-400 mb-4">
              Your activities are automatically synced from Strava
            </p>
            <PixelButton size="sm" className="w-full">
              Refresh
            </PixelButton>
          </PixelCard>
        </div>
      </div>
    </div>
  );
}
