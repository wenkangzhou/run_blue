'use client';

import React from 'react';
import { StravaActivity } from '@/types';
import { SimpleLineChart } from './charts/SimpleLineChart';
import { getActivityDate, getActivityTimestamp } from '@/lib/dates';
import { formatPaceSeconds } from '@/lib/paceFormat';

interface RouteTrendChartProps {
  activities: StravaActivity[];
}

export function RouteTrendChart({ activities }: RouteTrendChartProps) {
  if (activities.length < 2) return null;

  // Sort by date ascending for the chart
  const sorted = [...activities].sort(
    (a, b) => getActivityTimestamp(a) - getActivityTimestamp(b)
  );

  // Pace in seconds per km
  const paceData = sorted.map((a) => {
    if (a.distance > 0) {
      return a.moving_time / (a.distance / 1000);
    }
    return 0;
  });

  const xLabels = sorted.map((a) => {
    const d = getActivityDate(a);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  });

  const formatPaceLabel = (secPerKm: number) => {
    return formatPaceSeconds(secPerKm);
  };

  return (
    <div className="mt-4">
      <SimpleLineChart
        data={paceData}
        color="#3b82f6"
        height={220}
        fill
        xLabels={xLabels}
        yUnit=""
        formatYLabel={formatPaceLabel}
        smooth={3}
      />
    </div>
  );
}
