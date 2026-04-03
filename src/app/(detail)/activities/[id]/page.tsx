'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { StravaActivity, ActivityStream, StravaSplit, StravaLap } from '@/types';
import { getActivity, getActivityStreams, formatDateTime, formatDistance, formatDuration, formatPace } from '@/lib/strava';
import { ActivityMap } from '@/components/map/ActivityMap';
import { SplitsTable } from '@/components/SplitsTable';
import { LapsTable } from '@/components/LapsTable';
import { ActivityStats } from '@/components/ActivityStats';
import { SimpleLineChart } from '@/components/charts/SimpleLineChart';
import { ChevronLeft, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';

// 20km threshold for collapsing
const SPLIT_DISTANCE_THRESHOLD = 20; // km
const LAP_DISTANCE_THRESHOLD = 20; // km

export default function ActivityDetailPage() {
  const router = useRouter();
  const params = useParams();
  const { isAuthenticated, user } = useAuth();
  const [activity, setActivity] = useState<StravaActivity | null>(null);
  const [streams, setStreams] = useState<Record<string, ActivityStream> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [splitsExpanded, setSplitsExpanded] = useState(false);
  const [lapsExpanded, setLapsExpanded] = useState(false);

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
      } catch (err) {
        setError('Failed to load activity');
      } finally {
        setLoading(false);
      }
    };

    loadActivity();
  }, [isAuthenticated, user, activityId, router]);

  // Split data into visible and hidden based on 20km threshold
  const { visibleSplits, hiddenSplits, hasHiddenSplits } = useMemo(() => {
    if (!activity?.splits_metric) {
      return { visibleSplits: [], hiddenSplits: [], hasHiddenSplits: false };
    }
    
    let accumulatedDistance = 0;
    const visible: StravaSplit[] = [];
    const hidden: StravaSplit[] = [];
    
    for (const split of activity.splits_metric) {
      if (accumulatedDistance < SPLIT_DISTANCE_THRESHOLD * 1000) {
        visible.push(split);
      } else {
        hidden.push(split);
      }
      accumulatedDistance += split.distance;
    }
    
    return { 
      visibleSplits: visible, 
      hiddenSplits: hidden, 
      hasHiddenSplits: hidden.length > 0 
    };
  }, [activity?.splits_metric]);

  // Lap data into visible and hidden based on 20km threshold
  const { visibleLaps, hiddenLaps, hasHiddenLaps } = useMemo(() => {
    if (!activity?.laps) {
      return { visibleLaps: [], hiddenLaps: [], hasHiddenLaps: false };
    }
    
    let accumulatedDistance = 0;
    const visible: StravaLap[] = [];
    const hidden: StravaLap[] = [];
    
    for (const lap of activity.laps) {
      if (accumulatedDistance < LAP_DISTANCE_THRESHOLD * 1000) {
        visible.push(lap);
      } else {
        hidden.push(lap);
      }
      accumulatedDistance += lap.distance;
    }
    
    return { 
      visibleLaps: visible, 
      hiddenLaps: hidden, 
      hasHiddenLaps: hidden.length > 0 
    };
  }, [activity?.laps]);

  if (!isAuthenticated) return null;

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
        {/* Minimal Header */}
        <div className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
          <div className="container mx-auto px-4 py-4 max-w-2xl">
            <Link 
              href="/activities" 
              className="inline-flex items-center gap-1 font-mono text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
            >
              <ChevronLeft size={16} />
              返回
            </Link>
          </div>
        </div>
        <div className="container mx-auto px-4 py-12">
          <div className="flex items-center justify-center h-64">
            <Loader2 className="animate-spin mr-2" />
            <span className="font-mono">加载中...</span>
          </div>
        </div>
      </div>
    );
  }

  if (error || !activity) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
        {/* Minimal Header */}
        <div className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
          <div className="container mx-auto px-4 py-4 max-w-2xl">
            <Link 
              href="/activities" 
              className="inline-flex items-center gap-1 font-mono text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
            >
              <ChevronLeft size={16} />
              返回
            </Link>
          </div>
        </div>
        <div className="container mx-auto px-4 py-12">
          <div className="text-center">
            <p className="font-mono text-red-500">{error || '活动未找到'}</p>
            <Link href="/activities" className="mt-4 inline-block font-mono text-blue-600">
              ← 返回
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Show splits only if more than 1 split
  const shouldShowSplits = activity.splits_metric && activity.splits_metric.length > 1;
  // Show laps only if more than 1 lap
  const shouldShowLaps = activity.laps && activity.laps.length > 1;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* Minimal Header */}
      <div className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 max-w-2xl">
          <Link 
            href="/activities" 
            className="inline-flex items-center gap-1 font-mono text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            <ChevronLeft size={16} />
            返回
          </Link>
        </div>
      </div>

      <div className="container mx-auto px-4 py-4 max-w-2xl">
        {/* Header */}
        <div className="mb-4">
          <h1 className="font-pixel text-xl font-bold mb-1">{activity.name}</h1>
          <p className="font-mono text-xs text-zinc-500">
            {formatDateTime(activity.start_date_local)}
          </p>
        </div>

        {/* Map */}
        {activity.map?.polyline && (
          <div className="mb-4 rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-700">
            <ActivityMap 
              polyline={activity.map.polyline}
              startLatlng={activity.start_latlng}
              endLatlng={activity.end_latlng}
              height="200px"
            />
          </div>
        )}

        {/* Main Stats - Compact, no truncate */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
          <StatCard 
            label="距离"
            value={formatDistance(activity.distance, 'km')}
          />
          <StatCard 
            label="时间"
            value={formatDuration(activity.moving_time)}
          />
          <StatCard 
            label="配速"
            value={formatPace(activity.distance, activity.moving_time, 'min/km')}
          />
          <StatCard 
            label="用时"
            value={formatDuration(activity.elapsed_time)}
          />
        </div>

        {/* Extended Stats */}
        <div className="mb-4">
          <ActivityStats activity={activity} />
        </div>

        {/* Charts */}
        {streams && (
          <div className="mb-4 space-y-4">
            {streams.heartrate && (
              <ChartSection 
                title="心率"
                subtitle={`${Math.round(activity.average_heartrate || 0)} bpm ~ ${Math.round(activity.max_heartrate || 0)} bpm`}
              >
                <SimpleLineChart 
                  data={streams.heartrate.data as number[]}
                  color="#ef4444"
                  height={100}
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
                  height={100}
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
                  height={100}
                  fill
                />
              </ChartSection>
            )}
          </div>
        )}

        {/* Splits - Show first 20km, collapse rest (only if more than 1) */}
        {shouldShowSplits && (
          <div className="mb-4">
            <button
              onClick={() => setSplitsExpanded(!splitsExpanded)}
              className="w-full flex items-center justify-between py-3 border-b border-zinc-200 dark:border-zinc-700"
            >
              <h2 className="font-mono text-xs font-bold uppercase text-zinc-500">
                分段 ({activity.splits_metric!.length})
              </h2>
              {hasHiddenSplits && (
                <span className="text-zinc-400">
                  {splitsExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </span>
              )}
            </button>
            <div className="mt-3">
              <SplitsTable splits={visibleSplits} />
              
              {hasHiddenSplits && splitsExpanded && (
                <div className="mt-2 pt-2 border-t border-zinc-100 dark:border-zinc-800/50">
                  <SplitsTable splits={hiddenSplits} />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Laps - Show first 20km, collapse rest (only if more than 1) */}
        {shouldShowLaps && (
          <div className="mb-4">
            <button
              onClick={() => setLapsExpanded(!lapsExpanded)}
              className="w-full flex items-center justify-between py-3 border-b border-zinc-200 dark:border-zinc-700"
            >
              <h2 className="font-mono text-xs font-bold uppercase text-zinc-500">
                圈数 ({activity.laps!.length})
              </h2>
              {hasHiddenLaps && (
                <span className="text-zinc-400">
                  {lapsExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </span>
              )}
            </button>
            <div className="mt-3">
              <LapsTable laps={visibleLaps} />
              
              {hasHiddenLaps && lapsExpanded && (
                <div className="mt-2 pt-2 border-t border-zinc-100 dark:border-zinc-800/50">
                  <LapsTable laps={hiddenLaps} />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 p-2">
      <p className="font-mono text-[10px] text-zinc-500 uppercase">{label}</p>
      <p className="font-mono text-sm font-bold">{value}</p>
    </div>
  );
}

function ChartSection({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <h3 className="font-mono text-[10px] font-bold uppercase text-zinc-500">{title}</h3>
        {subtitle && <span className="font-mono text-[10px] text-zinc-400">{subtitle}</span>}
      </div>
      {children}
    </div>
  );
}
