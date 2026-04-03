'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { StravaActivity, ActivityStream } from '@/types';
import { getActivity, getActivityStreams, formatDateTime, formatDistance, formatDuration, formatPace } from '@/lib/strava';
import { ActivityMap } from '@/components/map/ActivityMap';
import { SplitsTable } from '@/components/SplitsTable';
import { LapsTable } from '@/components/LapsTable';
import { ActivityStats } from '@/components/ActivityStats';
import { SimpleLineChart } from '@/components/charts/SimpleLineChart';
import { ChevronLeft, Loader2 } from 'lucide-react';

export default function ActivityDetailPage() {
  const router = useRouter();
  const params = useParams();
  const { isAuthenticated, user } = useAuth();
  const [activity, setActivity] = useState<StravaActivity | null>(null);
  const [streams, setStreams] = useState<Record<string, ActivityStream> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const activityId = parseInt(params.id as string, 10);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/');
      return;
    }

    if (!user?.accessToken || !activityId) return;

    const loadActivity = async () => {
      try {
        setLoading(true);
        const [activityData, streamsData] = await Promise.all([
          getActivity(user.accessToken, activityId),
          getActivityStreams(user.accessToken, activityId).catch(() => null),
        ]);
        setActivity(activityData);
        setStreams(streamsData);
      } catch (err) {
        setError('Failed to load activity');
      } finally {
        setLoading(false);
      }
    };

    loadActivity();
  }, [isAuthenticated, user, activityId, router]);

  if (!isAuthenticated) return null;

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-12">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="animate-spin mr-2" />
          <span className="font-mono">加载中...</span>
        </div>
      </div>
    );
  }

  if (error || !activity) {
    return (
      <div className="container mx-auto px-4 py-12">
        <div className="text-center">
          <p className="font-mono text-red-500">{error || '活动未找到'}</p>
          <Link href="/activities" className="mt-4 inline-block font-mono text-blue-600">
            ← 返回活动列表
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-2xl">
      {/* Back Button */}
      <Link 
        href="/activities" 
        className="inline-flex items-center gap-1 font-mono text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 mb-6"
      >
        <ChevronLeft size={16} />
        返回
      </Link>

      {/* Header */}
      <div className="mb-8">
        <h1 className="font-pixel text-2xl font-bold mb-2">{activity.name}</h1>
        <p className="font-mono text-sm text-zinc-500">
          {formatDateTime(activity.start_date_local)}
        </p>
      </div>

      {/* Map */}
      {activity.map?.polyline && (
        <div className="mb-8 rounded-lg overflow-hidden border-2 border-zinc-200 dark:border-zinc-700">
          <ActivityMap 
            polyline={activity.map.polyline}
            startLatlng={activity.start_latlng}
            endLatlng={activity.end_latlng}
            height="250px"
          />
        </div>
      )}

      {/* Main Stats */}
      <div className="mb-8">
        <div className="grid grid-cols-2 gap-4 mb-6">
          <StatCard 
            label="距离"
            value={formatDistance(activity.distance, 'km')}
          />
          <StatCard 
            label="移动时间"
            value={formatDuration(activity.moving_time)}
          />
          <StatCard 
            label="平均配速"
            value={formatPace(activity.distance, activity.moving_time, 'min/km')}
          />
          <StatCard 
            label=" elapsed时间"
            value={formatDuration(activity.elapsed_time)}
          />
        </div>

        {/* Extended Stats */}
        <ActivityStats activity={activity} />
      </div>

      {/* Charts */}
      {streams && (
        <div className="mb-8 space-y-6">
          {streams.heartrate && (
            <ChartSection 
              title="心率"
              subtitle={`${Math.round(activity.average_heartrate || 0)} bpm ~ ${Math.round(activity.max_heartrate || 0)} bpm`}
            >
              <SimpleLineChart 
                data={streams.heartrate.data as number[]}
                color="#ef4444"
                height={120}
              />
            </ChartSection>
          )}
          
          {streams.velocity_smooth && (
            <ChartSection 
              title="配速"
              subtitle=""
            >
              <SimpleLineChart 
                data={(streams.velocity_smooth.data as number[]).map(v => v > 0 ? 1000 / v : 0)}
                color="#3b82f6"
                height={120}
              />
            </ChartSection>
          )}
          
          {streams.altitude && (
            <ChartSection 
              title="海拔"
              subtitle={`${Math.round(activity.elev_low || 0)}m ~ ${Math.round(activity.elev_high || 0)}m`}
            >
              <SimpleLineChart 
                data={streams.altitude.data as number[]}
                color="#22c55e"
                height={120}
                fill
              />
            </ChartSection>
          )}
        </div>
      )}

      {/* Splits */}
      {activity.splits_metric && activity.splits_metric.length > 0 && (
        <div className="mb-8">
          <h2 className="font-mono text-sm font-bold uppercase text-zinc-500 mb-4">分段</h2>
          <SplitsTable splits={activity.splits_metric} />
        </div>
      )}

      {/* Laps */}
      {activity.laps && activity.laps.length > 0 && (
        <div className="mb-8">
          <h2 className="font-mono text-sm font-bold uppercase text-zinc-500 mb-4">圈数</h2>
          <LapsTable laps={activity.laps} />
        </div>
      )}

      {/* Gear & Device */}
      <div className="border-t-2 border-zinc-200 dark:border-zinc-700 pt-6">
        {activity.gear && (
          <p className="font-mono text-sm text-zinc-500 mb-1">
            {activity.gear.name}
          </p>
        )}
        {activity.device_name && (
          <p className="font-mono text-sm text-zinc-500">
            {activity.device_name}
          </p>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-zinc-50 dark:bg-zinc-900 p-4">
      <p className="font-mono text-xs text-zinc-500 uppercase mb-1">{label}</p>
      <p className="font-mono text-lg font-bold">{value}</p>
    </div>
  );
}

function ChartSection({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="font-mono text-xs font-bold uppercase text-zinc-500">{title}</h3>
        {subtitle && <span className="font-mono text-xs text-zinc-400">{subtitle}</span>}
      </div>
      {children}
    </div>
  );
}
