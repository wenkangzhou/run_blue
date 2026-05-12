'use client';

import { useState, useEffect } from 'react';
import { StravaActivity } from '@/types';

interface UseLocalActivitiesResult {
  activities: StravaActivity[];
  isLoading: boolean;
  error: string | null;
}

let cachedActivities: StravaActivity[] | null = null;

export function useLocalActivities(): UseLocalActivitiesResult {
  const [activities, setActivities] = useState<StravaActivity[]>(cachedActivities || []);
  const [isLoading, setIsLoading] = useState(!cachedActivities);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cachedActivities) {
      setActivities(cachedActivities);
      setIsLoading(false);
      return;
    }

    async function load() {
      try {
        const res = await fetch('/data/activities.json');
        if (!res.ok) throw new Error('Failed to fetch');
        const acts = (await res.json()) as StravaActivity[];
        // Filter only runs
        const runs = acts.filter((a) => a.type === 'Run');
        // Sort by date desc
        runs.sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime());
        cachedActivities = runs;
        setActivities(runs);
      } catch (err) {
        setError('Failed to load activities data');
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    }

    load();
  }, []);

  return { activities, isLoading, error };
}
