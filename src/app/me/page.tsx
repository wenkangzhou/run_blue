'use client';

import React, { useMemo } from 'react';
import { useLocalActivities } from '@/hooks/useLocalActivities';
import { TerminalHeader } from '@/components/me/TerminalHeader';
import { HeroSection } from '@/components/me/HeroSection';
import { MeMap } from '@/components/me/MeMap';
import { MeStats } from '@/components/me/MeStats';
import { ActivityTimeline } from '@/components/me/ActivityTimeline';
import { CrtOverlay } from '@/components/me/CrtOverlay';
import { FadeInSection } from '@/components/me/FadeInSection';
import { TerminalLoader } from '@/components/me/TerminalLoader';
import { ParticleBackground } from '@/components/me/ParticleBackground';

export default function MePage() {
  const { activities, isLoading, error } = useLocalActivities();

  const stats = useMemo(() => {
    if (activities.length === 0) return null;
    const totalDistance = activities.reduce((s, a) => s + a.distance, 0);
    const totalTime = activities.reduce((s, a) => s + a.moving_time, 0);
    const totalElevation = activities.reduce((s, a) => s + (a.total_elevation_gain || 0), 0);
    const totalRuns = activities.length;
    const years = new Set(activities.map((a) => new Date(a.start_date).getFullYear()));
    const firstRun = activities[activities.length - 1];
    const latestRun = activities[0];
    return {
      totalDistance,
      totalTime,
      totalElevation,
      totalRuns,
      yearCount: years.size,
      firstRunDate: firstRun?.start_date,
      latestRunDate: latestRun?.start_date,
    };
  }, [activities]);

  if (isLoading) {
    return <TerminalLoader />;
  }

  if (error) {
    return (
      <div className="min-h-screen bg-black text-red-400 font-mono flex items-center justify-center">
        <span className="text-sm">[ERROR] {error}</span>
      </div>
    );
  }

  return (
    <main className="dark min-h-screen bg-black text-zinc-100 font-mono selection:bg-green-400/30">
      <ParticleBackground />
      <CrtOverlay />
      <TerminalHeader stats={stats} />
      <FadeInSection>
        <HeroSection activities={activities} stats={stats} />
      </FadeInSection>
      <FadeInSection delay={100}>
        <MeMap activities={activities} />
      </FadeInSection>
      <FadeInSection delay={100}>
        <MeStats activities={activities} />
      </FadeInSection>
      <FadeInSection delay={100}>
        <ActivityTimeline activities={activities} />
      </FadeInSection>

      {/* Footer */}
      <footer className="border-t border-zinc-800 py-12 px-4">
        <div className="max-w-6xl mx-auto text-center">
          <p className="text-xs text-zinc-600">
            RUNNER_PROFILE v1.0 // {stats?.totalRuns} RECORDS // {stats?.yearCount} YEARS
          </p>
          <p className="text-[10px] text-zinc-700 mt-2">
            BUILT WITH STRAVA DATA // NO LOGIN REQUIRED
          </p>
        </div>
      </footer>
    </main>
  );
}
