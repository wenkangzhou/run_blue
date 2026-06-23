'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '@/store/settings';
import { useAuthStore } from '@/store/auth';
import i18n from '@/i18n';
import { StravaConnect } from '@/components/StravaConnect';
import { isGuestUser } from '@/lib/guestMode';
import {
  AlertCircle,
  BarChart3,
  Globe,
  MapPinned,
  Route,
  Sparkles,
  TrendingUp,
  WifiOff,
  X,
} from 'lucide-react';

export default function HomePage() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { language, setLanguage } = useSettingsStore();
  const authUser = useAuthStore((state) => state.user);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'warning' | 'info' } | null>(null);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = language;
    }
  }, [language]);

  useEffect(() => {
    const error = searchParams.get('error');
    if (error) {
      setToast({ message: decodeURIComponent(error), type: 'error' });
    }
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;

    const checkAuth = async () => {
      if (isGuestUser(authUser)) {
        setIsAuthenticated(true);
        setIsLoading(false);
        return;
      }

      try {
        const response = await fetch('/api/auth/session');
        if (!response.ok) return;

        const session = await response.json();
        if (cancelled) return;

        if (session.user) {
          setIsAuthenticated(true);
        } else if (session.error === 'token_expired') {
          setToast({ message: t('auth.sessionExpired'), type: 'warning' });
        } else if (session.error === 'rate_limited') {
          setToast({ message: t('errors.rateLimitedDesc'), type: 'warning' });
        } else if (session.error === 'strava_error' && session.status === 429) {
          setToast({ message: t('errors.rateLimitedDesc'), type: 'warning' });
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
  };

    checkAuth();
    return () => {
      cancelled = true;
    };
  }, [authUser, t]);

  useEffect(() => {
    if (isAuthenticated && !isLoading) router.push('/activities');
  }, [isAuthenticated, isLoading, router]);

  const toggleLanguage = () => {
    const newLang = language === 'zh' ? 'en' : 'zh';
    setLanguage(newLang);
    i18n.changeLanguage(newLang);
  };

  if (isLoading && !toast) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
        <div className="flex items-center gap-3 text-sm font-bold">
          <span className="h-2 w-2 animate-pulse rounded-sm bg-blue-600" />
          <span>{t('common.loading', '加载中')}</span>
        </div>
      </div>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-zinc-50 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
      <div
        className="pointer-events-none absolute inset-0 opacity-70 dark:opacity-80"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(37, 99, 235, 0.16) 1px, transparent 1px), linear-gradient(to bottom, rgba(37, 99, 235, 0.16) 1px, transparent 1px), linear-gradient(to right, rgba(24, 24, 27, 0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(24, 24, 27, 0.08) 1px, transparent 1px)',
          backgroundSize: '112px 112px, 112px 112px, 28px 28px, 28px 28px',
          backgroundPosition: '-1px -1px, -1px -1px, -1px -1px, -1px -1px',
          maskImage: 'linear-gradient(to bottom, transparent, black 14%, black 86%, transparent)',
          WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 14%, black 86%, transparent)',
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-60 dark:opacity-35"
        style={{
          backgroundImage:
            'repeating-linear-gradient(135deg, transparent 0 82px, rgba(249, 115, 22, 0.10) 82px 83px, transparent 83px 168px)',
          maskImage: 'linear-gradient(115deg, transparent, black 28%, black 72%, transparent)',
          WebkitMaskImage: 'linear-gradient(115deg, transparent, black 28%, black 72%, transparent)',
        }}
      />

      <header className="relative z-10 flex items-center justify-between px-4 py-4 sm:px-6 lg:px-10">
        <div className="flex min-w-0 items-center gap-3">
          <Image src="/logo.png" alt="跑蓝" width={36} height={36} className="h-9 w-9 object-contain" priority />
          <div className="min-w-0">
            <p className="text-base font-bold leading-tight">{t('common.appName')}</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Run Blue</p>
          </div>
        </div>

        <button
          onClick={toggleLanguage}
          className="inline-flex items-center gap-2 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-bold text-zinc-800 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
          aria-label={t('language.title')}
        >
          <Globe size={16} />
          <span>{language === 'zh' ? 'EN' : '中'}</span>
        </button>
      </header>

      {toast && (
        <div className="fixed inset-x-0 top-20 z-50 flex justify-center px-4 pointer-events-none">
          <div
            className={`flex w-full max-w-md items-center gap-3 rounded-lg border p-4 shadow-lg pointer-events-auto ${
              toast.type === 'error'
                ? 'border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-200'
                : toast.type === 'warning'
                  ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200'
                  : 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200'
            }`}
          >
            <AlertCircle size={20} className="shrink-0" />
            <p className="flex-1 text-sm">{toast.message}</p>
            <button onClick={() => setToast(null)} className="rounded-md p-1 hover:bg-black/5 dark:hover:bg-white/10">
              <X size={18} />
            </button>
          </div>
        </div>
      )}

      <div className="relative z-10 mx-auto flex min-h-[calc(100vh-76px)] max-w-5xl items-center justify-center px-4 pb-10 pt-4 sm:px-6 lg:px-10">
        <section className="grid min-h-[72vh] w-full overflow-hidden rounded-xl border border-zinc-200 bg-white/95 shadow-2xl backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95 sm:min-h-[76vh] lg:grid-cols-[1.08fr_0.92fr]">
          <div className="order-2 flex flex-col justify-center p-6 sm:p-8 lg:order-1 lg:p-10">
            <div className="grid gap-2.5">
              <HeroPill
                icon={<MapPinned size={18} />}
                label={t('landing.features.routeVisualization.title')}
                value={t('landing.features.routeVisualization.tag')}
              />
              <HeroPill
                icon={<BarChart3 size={18} />}
                label={t('landing.features.dataDashboard.title')}
                value={t('landing.features.dataDashboard.tag')}
              />
              <HeroPill
                icon={<Sparkles size={18} />}
                label={t('landing.features.aiAnalysis.title')}
                value={t('landing.features.aiAnalysis.tag')}
              />
              <HeroPill
                icon={<Route size={18} />}
                label={t('landing.features.routeCollection.title')}
                value={t('landing.features.routeCollection.tag')}
              />
              <HeroPill
                icon={<WifiOff size={18} />}
                label={t('landing.features.offlineReady.title')}
                value={t('landing.features.offlineReady.tag')}
              />
            </div>
          </div>

          <div className="order-1 flex flex-col justify-center border-b border-zinc-200 bg-zinc-50/80 p-6 dark:border-zinc-800 dark:bg-zinc-950/40 sm:p-8 lg:order-2 lg:border-b-0 lg:border-l lg:p-10">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="mb-2 text-xs font-bold uppercase text-orange-600 dark:text-orange-400">Strava Connect</p>
                <h2 className="text-2xl font-black sm:text-3xl">{t('auth.loginTitle')}</h2>
                <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                  {t('landing.tagline')}
                </p>
              </div>
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white">
                <TrendingUp size={24} />
              </div>
            </div>

            <StravaConnect />

            <p className="mt-6 text-center text-xs text-zinc-500 dark:text-zinc-400">
              {t('landing.poweredBy')}{' '}
              <Link href="/me" className="font-bold text-blue-700 hover:underline dark:text-blue-300">
                · Jim
              </Link>
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

function HeroPill({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white p-2.5 dark:border-zinc-800 dark:bg-zinc-900">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-bold">{label}</span>
        <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">{value}</span>
      </span>
    </div>
  );
}
