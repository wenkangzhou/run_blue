'use client';

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StravaConnect } from '@/components/StravaConnect';
import { PixelButton } from '@/components/ui';
import { Activity, Map, TrendingUp, Zap } from 'lucide-react';
import Link from 'next/link';

export default function HomePage() {
  const { t } = useTranslation();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    // Check URL for error
    const params = new URLSearchParams(window.location.search);
    const error = params.get('error');
    if (error) {
      setErrorMsg(decodeURIComponent(error));
    }

    // Check if user is logged in
    const checkAuth = async () => {
      try {
        const response = await fetch('/api/auth/session');
        if (response.ok) {
          const session = await response.json();
          setIsAuthenticated(!!session.user);
        }
      } catch {
        setIsAuthenticated(false);
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, []);

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-12">
        <div className="flex items-center justify-center h-64">
          <div className="animate-pulse font-mono text-xl">◼◼◼ LOADING ◼◼◼</div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="container mx-auto px-4 py-12">
        {/* Error Message */}
        {errorMsg && (
          <div className="max-w-md mx-auto mb-6 p-4 border-4 border-red-600 bg-red-50 dark:bg-red-950">
            <p className="font-mono text-red-600 dark:text-red-400 text-sm">
              登录失败: {errorMsg}
            </p>
          </div>
        )}

        <div className="text-center mb-12">
          <h1 className="font-pixel text-5xl md:text-7xl font-bold mb-4 text-blue-600 dark:text-blue-400">
            {t('common.appName')}
          </h1>
          <p className="font-mono text-lg text-zinc-600 dark:text-zinc-400">
            {t('common.appSlogan')}
          </p>
        </div>

        <StravaConnect />

        {/* Features */}
        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          <FeatureCard
            icon={<Map size={32} />}
            title={t('features.routeVisualization.title')}
            description={t('features.routeVisualization.description')}
          />
          <FeatureCard
            icon={<TrendingUp size={32} />}
            title={t('features.trackProgress.title')}
            description={t('features.trackProgress.description')}
          />
          <FeatureCard
            icon={<Zap size={32} />}
            title={t('features.syncStrava.title')}
            description={t('features.syncStrava.description')}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="text-center mb-12">
        <h1 className="font-pixel text-4xl md:text-5xl font-bold mb-4">
          {t('nav.dashboard')}
        </h1>
        <p className="font-mono text-zinc-600 dark:text-zinc-400">
          {t('common.appSlogan')}
        </p>
      </div>

      <div className="flex justify-center gap-4">
        <Link href="/activities">
          <PixelButton size="lg">
            <span className="flex items-center gap-2">
              <Activity size={20} />
              {t('nav.activities')}
            </span>
          </PixelButton>
        </Link>
      </div>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="border-4 border-zinc-800 dark:border-zinc-200 p-6 bg-white dark:bg-zinc-900 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.2)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.1)]">
      <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900 border-2 border-blue-800 dark:border-blue-400 flex items-center justify-center mb-4 text-blue-600 dark:text-blue-400">
        {icon}
      </div>
      <h3 className="font-mono font-bold text-lg mb-2">{title}</h3>
      <p className="font-mono text-sm text-zinc-600 dark:text-zinc-400">
        {description}
      </p>
    </div>
  );
}
