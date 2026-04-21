'use client';

import React from 'react';
import { StravaActivity } from '@/types';
import { SimpleLineChart } from './charts/SimpleLineChart';

interface RouteTrendChartProps {
  activities: StravaActivity[];
}

export function RouteTrendChart({ activities }: RouteTrendChartProps) {
  if (activities.length < 2) return null;

  // Sort by date ascending for the chart
  const sorted = [...activities].sort(
    (a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
  );

  // Pace in seconds per km
  const paceData = sorted.map((a) => {
    if (a.distance > 0) {
      return a.moving_time / (a.distance / 1000);
    }
    return 0;
  });

  const xLabels = sorted.map((a) => {
    const d = new Date(a.start_date_local);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  });

  const formatPaceLabel = (secPerKm: number) => {
    if (secPerKm <= 0) return '--';
    const min = Math.floor(secPerKm / 60);
    const sec = Math.round(secPerKm % 60);
    return `${min}'${sec.toString().padStart(2, '0')}"`;
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
