'use client';

import React, { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { StravaConnect } from '@/components/StravaConnect';
import { Map, TrendingUp, Zap, AlertCircle, X, Route, Timer, Calendar } from 'lucide-react';

export default function HomePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'warning' | 'info' } | null>(null);
  const [retryCount, setRetryCount] = useState(0);

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
            setToast({ message: '登录已过期，请重新登录', type: 'warning' });
          } else if (session.error === 'rate_limited') {
            setToast({ message: 'Strava API 限流中，请稍后再试（约15分钟）', type: 'warning' });
          } else if (session.error === 'strava_error' && session.status === 429) {
            setToast({ message: 'Strava API 限流中，请稍后再试（约15分钟）', type: 'warning' });
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
  }, [retryCount]);

  useEffect(() => {
    if (isAuthenticated && !isLoading) router.push('/activities');
  }, [isAuthenticated, isLoading, router]);

  if (isLoading && !toast) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="animate-pulse font-pixel text-2xl">◼◼◼ LOADING ◼◼◼</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 relative overflow-hidden">
      {/* Background Grid Pattern */}
      <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05]"
        style={{
          backgroundImage: `linear-gradient(to right, currentColor 1px, transparent 1px),
                           linear-gradient(to bottom, currentColor 1px, transparent 1px)`,
          backgroundSize: '40px 40px'
        }}
      />
      
      {/* Floating Decorative Elements */}
      <div className="absolute top-20 left-10 w-4 h-4 bg-blue-500 animate-pulse" />
      <div className="absolute top-40 right-20 w-3 h-3 bg-orange-500 animate-bounce" style={{ animationDuration: '2s' }} />
      <div className="absolute bottom-40 left-20 w-2 h-2 bg-green-500 animate-pulse" style={{ animationDuration: '3s' }} />
      <div className="absolute top-1/3 right-10 w-6 h-6 border-2 border-blue-400 rotate-45 opacity-50" />
      <div className="absolute bottom-1/4 right-1/4 w-8 h-8 border-2 border-orange-400 rotate-12 opacity-30" />

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

      <div className="container mx-auto px-4 py-8 md:py-16 relative z-10">
        {/* Hero Section */}
        <div className="text-center mb-12 md:mb-16">
          {/* Logo Mark */}
          <div className="inline-flex items-center justify-center mb-6">
            <div className="relative">
              <div className="w-16 h-16 md:w-20 md:h-20 bg-blue-600 border-4 border-blue-800 dark:border-blue-400 flex items-center justify-center shadow-[4px_4px_0px_0px_rgba(0,0,0,0.2)]">
                <Route size={32} className="text-white" />
              </div>
              <div className="absolute -top-2 -right-2 w-4 h-4 bg-orange-500 border-2 border-orange-700" />
            </div>
          </div>
          
          {/* Main Title */}
          <h1 className="font-pixel text-6xl md:text-8xl font-bold mb-4 relative inline-block">
            <span className="bg-gradient-to-b from-blue-500 to-blue-700 bg-clip-text text-transparent drop-shadow-[4px_4px_0px_rgba(0,0,0,0.1)]">
              跑蓝
            </span>
          </h1>
          
          {/* Tagline */}
          <p className="font-mono text-lg md:text-xl text-zinc-600 dark:text-zinc-400 mb-2">
            像素级记录你的每一步
          </p>
          <div className="flex items-center justify-center gap-2 text-xs font-mono text-zinc-400">
            <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
            <span>与 Strava 实时同步</span>
          </div>
        </div>

        {/* Strava Connect Card */}
        <div className="mb-16 md:mb-20">
          <StravaConnect />
        </div>

        {/* Features Grid */}
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
            <FeatureCard
              icon={<Map />}
              title="地图收集"
              description="把跑过的路，变成墙上的画"
              color="blue"
              delay={0}
            />
            <FeatureCard
              icon={<TrendingUp />}
              title="数据看板"
              description="距离、配速、次数，一目了然"
              color="green"
              delay={100}
            />
            <FeatureCard
              icon={<Zap />}
              title="Strava 直连"
              description="一键授权，无需注册，数据自动来"
              color="orange"
              delay={200}
            />
          </div>
        </div>

        {/* Stats Preview */}
        <div className="mt-16 md:mt-20 max-w-3xl mx-auto">
          <div className="border-4 border-zinc-800 dark:border-zinc-200 bg-white dark:bg-zinc-900 p-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.1)]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-mono text-sm font-bold uppercase text-zinc-500">预览</h3>
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-zinc-300 dark:bg-zinc-600" />
                <div className="w-2 h-2 bg-zinc-300 dark:bg-zinc-600" />
                <div className="w-2 h-2 bg-zinc-300 dark:bg-zinc-600" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-4 bg-zinc-50 dark:bg-zinc-800">
                <Route className="w-6 h-6 mx-auto mb-2 text-blue-500" />
                <div className="font-pixel text-xl font-bold">42.2</div>
                <div className="font-mono text-xs text-zinc-500">公里</div>
              </div>
              <div className="text-center p-4 bg-zinc-50 dark:bg-zinc-800">
                <Timer className="w-6 h-6 mx-auto mb-2 text-green-500" />
                <div className="font-pixel text-xl font-bold">4:30</div>
                <div className="font-mono text-xs text-zinc-500">配速</div>
              </div>
              <div className="text-center p-4 bg-zinc-50 dark:bg-zinc-800">
                <Calendar className="w-6 h-6 mx-auto mb-2 text-orange-500" />
                <div className="font-pixel text-xl font-bold">128</div>
                <div className="font-mono text-xs text-zinc-500">次跑步</div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-16 text-center">
          <p className="font-mono text-xs text-zinc-400">
            Made with ◼ for runners
          </p>
        </div>
      </div>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
  color,
  delay,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  color: 'blue' | 'green' | 'orange';
  delay: number;
}) {
  const colorClasses = {
    blue: 'bg-blue-100 dark:bg-blue-900/30 border-blue-600 text-blue-600 dark:text-blue-400',
    green: 'bg-green-100 dark:bg-green-900/30 border-green-600 text-green-600 dark:text-green-400',
    orange: 'bg-orange-100 dark:bg-orange-900/30 border-orange-600 text-orange-600 dark:text-orange-400',
  };

  return (
    <div 
      className="group relative"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className={`border-4 border-zinc-800 dark:border-zinc-200 p-6 bg-white dark:bg-zinc-900 h-full transition-all duration-200 hover:-translate-y-1 hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,0.2)] dark:hover:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.1)] ${
        delay > 0 ? 'animate-fade-in' : ''
      }`}>
        <div className={`w-14 h-14 border-4 flex items-center justify-center mb-4 transition-transform group-hover:scale-110 ${colorClasses[color]}`}>
          {icon}
        </div>
        <h3 className="font-mono font-bold text-lg mb-2">{title}</h3>
        <p className="font-mono text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
          {description}
        </p>
      </div>
    </div>
  );
}
