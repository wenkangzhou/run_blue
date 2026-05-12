'use client';

import React, { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '@/store/settings';
import i18n from '@/i18n';
import { StravaConnect } from '@/components/StravaConnect';
import { Map, TrendingUp, Zap, AlertCircle, X, Route, Sparkles, Bookmark, WifiOff, Globe } from 'lucide-react';

export default function HomePage() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { language, setLanguage } = useSettingsStore();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'warning' | 'info' } | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  // Sync html lang attribute with current language
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
    const checkAuth = async () => {
      try {
        const response = await fetch('/api/auth/session');
        if (response.ok) {
          const session = await response.json();
          if (session.user) {
            setIsAuthenticated(true);
            return;
          }
          if (session.error === 'token_expired') {
            setToast({ message: t('auth.sessionExpired'), type: 'warning' });
          } else if (session.error === 'rate_limited') {
            setToast({ message: t('errors.rateLimitedDesc'), type: 'warning' });
          } else if (session.error === 'strava_error' && session.status === 429) {
            setToast({ message: t('errors.rateLimitedDesc'), type: 'warning' });
          }
        }
        if (retryCount < 3) {
          setTimeout(() => setRetryCount(c => c + 1), 500);
        }
      } catch {
        if (retryCount < 3) {
          setTimeout(() => setRetryCount(c => c + 1), 500);
        }
      } finally {
        if (retryCount >= 2) setIsLoading(false);
      }
    };

    checkAuth();
    const timeout = setTimeout(() => setIsLoading(false), 5000);
    return () => clearTimeout(timeout);
  }, [retryCount, t]);

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
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="animate-pulse font-pixel text-2xl">◼◼◼ LOADING ◼◼◼</div>
      </div>
    );
  }

  const features = [
    {
      icon: <Map />,
      titleKey: 'landing.features.routeVisualization.title',
      descKey: 'landing.features.routeVisualization.description',
      tagKey: 'landing.features.routeVisualization.tag',
      color: 'blue' as const,
    },
    {
      icon: <TrendingUp />,
      titleKey: 'landing.features.dataDashboard.title',
      descKey: 'landing.features.dataDashboard.description',
      tagKey: 'landing.features.dataDashboard.tag',
      color: 'green' as const,
    },
    {
      icon: <Zap />,
      titleKey: 'landing.features.stravaSync.title',
      descKey: 'landing.features.stravaSync.description',
      tagKey: 'landing.features.stravaSync.tag',
      color: 'orange' as const,
    },
    {
      icon: <Sparkles />,
      titleKey: 'landing.features.aiAnalysis.title',
      descKey: 'landing.features.aiAnalysis.description',
      tagKey: 'landing.features.aiAnalysis.tag',
      color: 'purple' as const,
    },
    {
      icon: <Bookmark />,
      titleKey: 'landing.features.routeCollection.title',
      descKey: 'landing.features.routeCollection.description',
      tagKey: 'landing.features.routeCollection.tag',
      color: 'rose' as const,
    },
    {
      icon: <WifiOff />,
      titleKey: 'landing.features.offlineReady.title',
      descKey: 'landing.features.offlineReady.description',
      tagKey: 'landing.features.offlineReady.tag',
      color: 'cyan' as const,
    },
  ];

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 relative overflow-hidden">
      {/* Animated Background Grid */}
      <div className="absolute inset-0 opacity-[0.04] dark:opacity-[0.08]"
        style={{
          backgroundImage: `linear-gradient(to right, currentColor 1px, transparent 1px),
                           linear-gradient(to bottom, currentColor 1px, transparent 1px)`,
          backgroundSize: '32px 32px'
        }}
      />
      
      {/* Floating Pixel Elements */}
      <PixelElement className="top-16 left-[10%] w-3 h-3 bg-blue-500" delay={0} />
      <PixelElement className="top-24 left-[20%] w-2 h-2 bg-blue-400" delay={200} />
      <PixelElement className="top-12 left-[35%] w-4 h-4 bg-orange-500" delay={400} />
      <PixelElement className="top-28 right-[30%] w-3 h-3 bg-green-500" delay={600} />
      <PixelElement className="top-20 right-[15%] w-2 h-2 bg-orange-400" delay={800} />
      <PixelElement className="top-32 left-[5%] w-2 h-2 bg-green-400" delay={1000} />
      <PixelElement className="top-48 right-[10%] w-2 h-2 bg-purple-400" delay={300} />
      <PixelElement className="bottom-32 left-[15%] w-3 h-3 bg-cyan-400" delay={700} />
      
      {/* Moving Pixel Particles */}
      <MovingPixel className="top-40 left-[15%] w-2 h-2 bg-blue-300" duration={8} delay={0} direction="right" />
      <MovingPixel className="top-60 right-[20%] w-3 h-3 bg-orange-300" duration={10} delay={2} direction="left" />
      <MovingPixel className="top-80 left-[25%] w-2 h-2 bg-green-300" duration={12} delay={4} direction="right" />
      <MovingPixel className="bottom-48 right-[15%] w-2 h-2 bg-purple-300" duration={14} delay={1} direction="left" />
      
      {/* Rotating Squares */}
      <RotatingSquare className="top-36 right-[10%] w-6 h-6 border-blue-400" duration={20} />
      <RotatingSquare className="top-72 left-[8%] w-4 h-4 border-orange-400" duration={15} />
      <RotatingSquare className="bottom-40 right-[25%] w-5 h-5 border-green-400" duration={25} />
      <RotatingSquare className="bottom-20 left-[30%] w-4 h-4 border-purple-400" duration={18} />

      {/* Language Toggle — top right */}
      <div className="fixed top-4 right-4 z-50">
        <button
          onClick={toggleLanguage}
          className="flex items-center gap-1.5 px-3 py-2 border-2 border-zinc-800 dark:border-zinc-200 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors font-mono text-sm font-bold shadow-[3px_3px_0px_0px_rgba(0,0,0,0.15)]"
          aria-label={t('language.title')}
        >
          <Globe size={16} />
          <span>{language === 'zh' ? 'EN' : '中'}</span>
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed inset-x-0 top-16 z-50 flex justify-center px-4 pointer-events-none">
          <div className={`flex items-center gap-3 p-4 border-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.2)] max-w-md w-full pointer-events-auto ${
            toast.type === 'error' 
              ? 'bg-red-50 border-red-600 text-red-700 dark:bg-red-950 dark:border-red-400' 
              : toast.type === 'warning'
              ? 'bg-amber-50 border-amber-600 text-amber-700 dark:bg-amber-950 dark:border-amber-400'
              : 'bg-blue-50 border-blue-600 text-blue-700 dark:bg-blue-950 dark:border-blue-400'
          }`}>
            <AlertCircle size={20} className="flex-shrink-0" />
            <p className="font-mono text-sm flex-1">{toast.message}</p>
            <button onClick={() => setToast(null)} className="hover:opacity-70 flex-shrink-0">
              <X size={18} />
            </button>
          </div>
        </div>
      )}

      <div className="container mx-auto px-4 py-8 md:py-12 relative z-10">
        {/* Hero Section */}
        <div className="text-center mb-10 md:mb-12">
          {/* Animated Logo Mark */}
          <div className="inline-flex items-center justify-center mb-6 relative">
            <div className="absolute -top-4 -left-4 w-2 h-2 bg-blue-400 animate-bounce" style={{ animationDelay: '0.1s' }} />
            <div className="absolute -top-2 -right-6 w-2 h-2 bg-orange-400 animate-bounce" style={{ animationDelay: '0.3s' }} />
            <div className="absolute -bottom-4 -left-6 w-2 h-2 bg-green-400 animate-bounce" style={{ animationDelay: '0.5s' }} />
            <div className="absolute -bottom-2 -right-4 w-3 h-3 bg-blue-500 animate-pulse" />
            
            <div className="relative group">
              <div className="w-20 h-20 md:w-24 md:h-24 bg-blue-600 border-4 border-blue-800 dark:border-blue-400 flex items-center justify-center shadow-[6px_6px_0px_0px_rgba(0,0,0,0.2)] transition-transform group-hover:scale-105">
                <Route size={40} className="text-white" />
              </div>
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-orange-500 border-2 border-orange-700" />
              <div className="absolute -bottom-1 -left-1 w-2 h-2 bg-green-500" />
            </div>
          </div>
          
          {/* Main Title */}
          <div className="relative inline-block mb-4">
            <h1 className="font-pixel text-6xl md:text-8xl font-bold relative z-10 bg-gradient-to-b from-blue-500 to-blue-700 bg-clip-text text-transparent">
              {t('common.appName')}
            </h1>
            <div className="absolute top-1 left-1 text-blue-800/20 dark:text-blue-400/20 font-pixel text-6xl md:text-8xl font-bold -z-10">{t('common.appName')}</div>
            <div className="absolute top-2 left-2 text-blue-800/10 dark:text-blue-400/10 font-pixel text-6xl md:text-8xl font-bold -z-20">{t('common.appName')}</div>
          </div>
          
          {/* Tagline */}
          <p className="font-mono text-lg md:text-xl text-zinc-600 dark:text-zinc-400 mb-2">
            {t('landing.tagline')}
          </p>
          <p className="font-mono text-sm text-zinc-500 dark:text-zinc-500 mb-3">
            {t('landing.subTagline')}
          </p>
          <div className="flex items-center justify-center gap-2">
            <span className="w-2 h-2 bg-green-500 animate-pulse" />
            <span className="font-mono text-sm text-zinc-500">{t('landing.syncStatus')}</span>
            <span className="w-2 h-2 bg-orange-500 animate-pulse" style={{ animationDelay: '0.5s' }} />
          </div>
        </div>

        {/* Strava Connect */}
        <div className="mb-12 md:mb-16">
          <StravaConnect />
        </div>

        {/* Features Grid */}
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {features.map((f, i) => (
              <FeatureCard
                key={i}
                icon={f.icon}
                title={t(f.titleKey)}
                description={t(f.descKey)}
                color={f.color}
                stats={t(f.tagKey)}
              />
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-16 text-center">
          <div className="flex items-center justify-center gap-1 mb-2">
            {[...Array(5)].map((_, i) => (
              <div 
                key={i} 
                className="w-1.5 h-1.5 bg-zinc-400 animate-pulse" 
                style={{ animationDelay: `${i * 0.2}s` }}
              />
            ))}
          </div>
          <p className="font-mono text-xs text-zinc-400">
            Made by{' '}
            <Link href="/me" className="underline underline-offset-2 hover:text-zinc-200 transition-colors">
              Jim
            </Link>{' '}
            for runners
          </p>
        </div>
      </div>
    </div>
  );
}

// Animated pixel element
function PixelElement({ className, delay }: { className: string; delay: number }) {
  return (
    <div 
      className={`absolute ${className} animate-float`}
      style={{ 
        animationDelay: `${delay}ms`,
        animation: `float 3s ease-in-out infinite`,
      }}
    />
  );
}

// Moving pixel
function MovingPixel({ 
  className, 
  duration, 
  delay, 
  direction 
}: { 
  className: string; 
  duration: number; 
  delay: number;
  direction: 'left' | 'right';
}) {
  return (
    <div 
      className={`absolute ${className} opacity-60`}
      style={{
        animation: `move${direction} ${duration}s linear infinite`,
        animationDelay: `${delay}s`,
      }}
    />
  );
}

// Rotating square
function RotatingSquare({ className, duration }: { className: string; duration: number }) {
  return (
    <div 
      className={`absolute border-2 ${className} opacity-40`}
      style={{
        animation: `spin ${duration}s linear infinite`,
      }}
    />
  );
}

function FeatureCard({
  icon,
  title,
  description,
  color,
  stats,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  color: 'blue' | 'green' | 'orange' | 'purple' | 'rose' | 'cyan';
  stats: string;
}) {
  const colorClasses: Record<string, string> = {
    blue: 'bg-blue-100 dark:bg-blue-900/30 border-blue-600 text-blue-600 dark:text-blue-400',
    green: 'bg-green-100 dark:bg-green-900/30 border-green-600 text-green-600 dark:text-green-400',
    orange: 'bg-orange-100 dark:bg-orange-900/30 border-orange-600 text-orange-600 dark:text-orange-400',
    purple: 'bg-purple-100 dark:bg-purple-900/30 border-purple-600 text-purple-600 dark:text-purple-400',
    rose: 'bg-rose-100 dark:bg-rose-900/30 border-rose-600 text-rose-600 dark:text-rose-400',
    cyan: 'bg-cyan-100 dark:bg-cyan-900/30 border-cyan-600 text-cyan-600 dark:text-cyan-400',
  };

  const bgClasses: Record<string, string> = {
    blue: 'bg-blue-50/50 dark:bg-blue-900/10',
    green: 'bg-green-50/50 dark:bg-green-900/10',
    orange: 'bg-orange-50/50 dark:bg-orange-900/10',
    purple: 'bg-purple-50/50 dark:bg-purple-900/10',
    rose: 'bg-rose-50/50 dark:bg-rose-900/10',
    cyan: 'bg-cyan-50/50 dark:bg-cyan-900/10',
  };

  const dotColor: Record<string, string> = {
    blue: 'bg-blue-300',
    green: 'bg-green-300',
    orange: 'bg-orange-300',
    purple: 'bg-purple-300',
    rose: 'bg-rose-300',
    cyan: 'bg-cyan-300',
  };

  return (
    <div className="group relative">
      <div className={`border-4 border-zinc-800 dark:border-zinc-200 p-5 ${bgClasses[color]} h-full transition-all duration-200 hover:-translate-y-1 hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,0.2)] dark:hover:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.1)]`}>
        <div className="flex items-start justify-between mb-3">
          <div className={`w-12 h-12 border-4 flex items-center justify-center transition-transform group-hover:scale-110 ${colorClasses[color]}`}>
            {icon}
          </div>
          <span className={`font-mono text-[10px] px-2 py-1 border-2 ${colorClasses[color]}`}>
            {stats}
          </span>
        </div>
        
        <h3 className="font-mono font-bold text-lg mb-2">{title}</h3>
        
        <p className="font-mono text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
          {description}
        </p>
        
        <div className="mt-4 flex gap-1">
          {[...Array(4)].map((_, i) => (
            <div 
              key={i} 
              className={`w-1.5 h-1.5 ${dotColor[color]}`}
              style={{ opacity: 0.3 + i * 0.2 }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
