'use client';

import React, { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { StravaConnect } from '@/components/StravaConnect';
import { Map, TrendingUp, Zap, AlertCircle, X, Route } from 'lucide-react';

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
      {/* Animated Background Grid */}
      <div className="absolute inset-0 opacity-[0.04] dark:opacity-[0.08]"
        style={{
          backgroundImage: `linear-gradient(to right, currentColor 1px, transparent 1px),
                           linear-gradient(to bottom, currentColor 1px, transparent 1px)`,
          backgroundSize: '32px 32px'
        }}
      />
      
      {/* Floating Pixel Elements - More animations */}
      <PixelElement className="top-16 left-[10%] w-3 h-3 bg-blue-500" delay={0} />
      <PixelElement className="top-24 left-[20%] w-2 h-2 bg-blue-400" delay={200} />
      <PixelElement className="top-12 left-[35%] w-4 h-4 bg-orange-500" delay={400} />
      <PixelElement className="top-28 right-[30%] w-3 h-3 bg-green-500" delay={600} />
      <PixelElement className="top-20 right-[15%] w-2 h-2 bg-orange-400" delay={800} />
      <PixelElement className="top-32 left-[5%] w-2 h-2 bg-green-400" delay={1000} />
      
      {/* Moving Pixel Particles */}
      <MovingPixel className="top-40 left-[15%] w-2 h-2 bg-blue-300" duration={8} delay={0} direction="right" />
      <MovingPixel className="top-60 right-[20%] w-3 h-3 bg-orange-300" duration={10} delay={2} direction="left" />
      <MovingPixel className="top-80 left-[25%] w-2 h-2 bg-green-300" duration={12} delay={4} direction="right" />
      
      {/* Rotating Squares */}
      <RotatingSquare className="top-36 right-[10%] w-6 h-6 border-blue-400" duration={20} />
      <RotatingSquare className="top-72 left-[8%] w-4 h-4 border-orange-400" duration={15} />
      <RotatingSquare className="bottom-40 right-[25%] w-5 h-5 border-green-400" duration={25} />

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
        {/* Hero Section with Pixel Art Logo */}
        <div className="text-center mb-10 md:mb-12">
          {/* Animated Logo Mark */}
          <div className="inline-flex items-center justify-center mb-6 relative">
            {/* Surrounding pixels */}
            <div className="absolute -top-4 -left-4 w-2 h-2 bg-blue-400 animate-bounce" style={{ animationDelay: '0.1s' }} />
            <div className="absolute -top-2 -right-6 w-2 h-2 bg-orange-400 animate-bounce" style={{ animationDelay: '0.3s' }} />
            <div className="absolute -bottom-4 -left-6 w-2 h-2 bg-green-400 animate-bounce" style={{ animationDelay: '0.5s' }} />
            <div className="absolute -bottom-2 -right-4 w-3 h-3 bg-blue-500 animate-pulse" />
            
            <div className="relative group">
              <div className="w-20 h-20 md:w-24 md:h-24 bg-blue-600 border-4 border-blue-800 dark:border-blue-400 flex items-center justify-center shadow-[6px_6px_0px_0px_rgba(0,0,0,0.2)] transition-transform group-hover:scale-105">
                <Route size={40} className="text-white" />
              </div>
              {/* Corner decorations */}
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-orange-500 border-2 border-orange-700" />
              <div className="absolute -bottom-1 -left-1 w-2 h-2 bg-green-500" />
            </div>
          </div>
          
          {/* Main Title with Pixel Shadow */}
          <div className="relative inline-block mb-4">
            <h1 className="font-pixel text-6xl md:text-8xl font-bold relative z-10 bg-gradient-to-b from-blue-500 to-blue-700 bg-clip-text text-transparent">
              跑蓝
            </h1>
            {/* Pixel shadow layers */}
            <div className="absolute top-1 left-1 text-blue-800/20 dark:text-blue-400/20 font-pixel text-6xl md:text-8xl font-bold -z-10">跑蓝</div>
            <div className="absolute top-2 left-2 text-blue-800/10 dark:text-blue-400/10 font-pixel text-6xl md:text-8xl font-bold -z-20">跑蓝</div>
          </div>
          
          {/* Tagline */}
          <p className="font-mono text-lg md:text-xl text-zinc-600 dark:text-zinc-400 mb-3">
            像素级记录你的每一步
          </p>
          <div className="flex items-center justify-center gap-2">
            <span className="w-2 h-2 bg-green-500 animate-pulse" />
            <span className="font-mono text-sm text-zinc-500">与 Strava 实时同步</span>
            <span className="w-2 h-2 bg-orange-500 animate-pulse" style={{ animationDelay: '0.5s' }} />
          </div>
        </div>

        {/* Strava Connect */}
        <div className="mb-12 md:mb-16">
          <StravaConnect />
        </div>

        {/* Features - Horizontal Layout */}
        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FeatureCard
              icon={<Map />}
              title="地图收集"
              description="把跑过的路，变成墙上的画。每一次跑步，都是城市上空的一笔涂鸦。"
              color="blue"
              stats="路线可视化"
            />
            <FeatureCard
              icon={<TrendingUp />}
              title="数据看板"
              description="距离、配速、次数，一目了然。按周、月、年追踪你的跑步历程。"
              color="green"
              stats="周期统计"
            />
            <FeatureCard
              icon={<Zap />}
              title="Strava 直连"
              description="一键授权，无需注册。数据自动同步，缓存本地，加载飞快。"
              color="orange"
              stats="实时同步"
            />
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
            Made with ◼ for runners
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
  color: 'blue' | 'green' | 'orange';
  stats: string;
}) {
  const colorClasses = {
    blue: 'bg-blue-100 dark:bg-blue-900/30 border-blue-600 text-blue-600 dark:text-blue-400',
    green: 'bg-green-100 dark:bg-green-900/30 border-green-600 text-green-600 dark:text-green-400',
    orange: 'bg-orange-100 dark:bg-orange-900/30 border-orange-600 text-orange-600 dark:text-orange-400',
  };

  const bgClasses = {
    blue: 'bg-blue-50/50 dark:bg-blue-900/10',
    green: 'bg-green-50/50 dark:bg-green-900/10',
    orange: 'bg-orange-50/50 dark:bg-orange-900/10',
  };

  return (
    <div className="group relative">
      <div className={`border-4 border-zinc-800 dark:border-zinc-200 p-5 ${bgClasses[color]} h-full transition-all duration-200 hover:-translate-y-1 hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,0.2)] dark:hover:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.1)]`}>
        {/* Header with icon and tag */}
        <div className="flex items-start justify-between mb-3">
          <div className={`w-12 h-12 border-4 flex items-center justify-center transition-transform group-hover:scale-110 ${colorClasses[color]}`}>
            {icon}
          </div>
          <span className={`font-mono text-[10px] px-2 py-1 border-2 ${colorClasses[color]}`}>
            {stats}
          </span>
        </div>
        
        {/* Title */}
        <h3 className="font-mono font-bold text-lg mb-2">{title}</h3>
        
        {/* Description */}
        <p className="font-mono text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
          {description}
        </p>
        
        {/* Bottom decoration */}
        <div className="mt-4 flex gap-1">
          {[...Array(4)].map((_, i) => (
            <div 
              key={i} 
              className={`w-1.5 h-1.5 ${color === 'blue' ? 'bg-blue-300' : color === 'green' ? 'bg-green-300' : 'bg-orange-300'}`}
              style={{ opacity: 0.3 + i * 0.2 }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
