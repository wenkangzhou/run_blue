'use client';

import React, { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { StravaConnect } from '@/components/StravaConnect';
import { Map, TrendingUp, Zap, AlertCircle, X } from 'lucide-react';

export default function HomePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'warning' | 'info' } | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    // Check URL for error
    const error = searchParams.get('error');
    if (error) {
      setToast({ message: decodeURIComponent(error), type: 'error' });
    }
  }, [searchParams]);

  useEffect(() => {
    // Check if user is logged in with retry logic
    const checkAuth = async () => {
      try {
        const response = await fetch('/api/auth/session');
        if (response.ok) {
          const session = await response.json();
          if (session.user) {
            setIsAuthenticated(true);
            return;
          }
          // Handle specific errors
          if (session.error === 'token_expired') {
            setToast({ message: '登录已过期，请重新登录', type: 'warning' });
          } else if (session.error === 'rate_limited') {
            setToast({ message: 'Strava API 限流中，请稍后再试（约15分钟）', type: 'warning' });
          } else if (session.error === 'strava_error' && session.status === 429) {
            setToast({ message: 'Strava API 限流中，请稍后再试（约15分钟）', type: 'warning' });
          }
        }
        // If no user and we haven't retried too many times, retry
        if (retryCount < 3) {
          setTimeout(() => {
            setRetryCount(c => c + 1);
          }, 500);
        }
      } catch {
        // Retry on error
        if (retryCount < 3) {
          setTimeout(() => {
            setRetryCount(c => c + 1);
          }, 500);
        }
      } finally {
        // Only set loading false after retries are exhausted or timeout
        if (retryCount >= 2) {
          setIsLoading(false);
        }
      }
    };

    checkAuth();
    
    // Timeout after 5 seconds to show page anyway
    const timeout = setTimeout(() => {
      setIsLoading(false);
    }, 5000);
    
    return () => clearTimeout(timeout);
  }, [retryCount]);

  // If authenticated, redirect to activities
  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      router.push('/activities');
    }
  }, [isAuthenticated, isLoading, router]);

  // Don't block the UI for too long - show the login page after a reasonable timeout
  if (isLoading && !toast) {
    return (
      <div className="container mx-auto px-4 py-12">
        <div className="flex items-center justify-center h-64">
          <div className="animate-pulse font-mono text-xl">◼◼◼ LOADING ◼◼◼</div>
        </div>
      </div>
    );
  }

  // Show login page for unauthenticated users
  return (
    <div className="container mx-auto px-4 py-12">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed inset-x-0 top-16 z-50 flex justify-center px-4 pointer-events-none">
          <div className={`flex items-center gap-3 p-4 border-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.2)] max-w-md w-full pointer-events-auto ${
            toast.type === 'error' 
              ? 'bg-red-50 border-red-600 text-red-700 dark:bg-red-950 dark:border-red-400 dark:text-red-400' 
              : toast.type === 'warning'
              ? 'bg-amber-50 border-amber-600 text-amber-700 dark:bg-amber-950 dark:border-amber-400 dark:text-amber-400'
              : 'bg-blue-50 border-blue-600 text-blue-700 dark:bg-blue-950 dark:border-blue-400 dark:text-blue-400'
          }`}>
            <AlertCircle size={20} className="flex-shrink-0" />
            <p className="font-mono text-sm flex-1">{toast.message}</p>
            <button 
              onClick={() => setToast(null)}
              className="hover:opacity-70 flex-shrink-0"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      )}

      <div className="text-center mb-12">
        <h1 className="font-pixel text-5xl md:text-7xl font-bold mb-4 text-blue-600 dark:text-blue-400">
          跑蓝
        </h1>
        <p className="font-mono text-lg text-zinc-600 dark:text-zinc-400">
          像素级记录你的每一步
        </p>
      </div>

      <StravaConnect />

      {/* Features */}
      <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
        <FeatureCard
          icon={<Map size={32} />}
          title="地图收集"
          description="把跑过的路，变成墙上的画"
        />
        <FeatureCard
          icon={<TrendingUp size={32} />}
          title="数据看板"
          description="距离、配速、次数，一目了然"
        />
        <FeatureCard
          icon={<Zap size={32} />}
          title="Strava 直连"
          description="一键授权，无需注册，数据自动来"
        />
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
