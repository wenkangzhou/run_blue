import React from 'react';
import { ChevronLeft } from 'lucide-react';

type MaxWidth = '2xl' | '3xl' | '4xl' | '6xl';
type LoadingVariant = 'dashboard' | 'list' | 'plans' | 'detail' | 'gear';

const maxWidthClass: Record<MaxWidth, string> = {
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
  '4xl': 'max-w-4xl',
  '6xl': 'max-w-6xl',
};

export function PageLoadingShell({
  title = '加载中',
  backLabel = '返回',
  maxWidth = '3xl',
  variant = 'list',
}: {
  title?: string;
  backLabel?: string;
  maxWidth?: MaxWidth;
  variant?: LoadingVariant;
}) {
  const width = maxWidthClass[maxWidth];

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50" aria-busy="true">
      <div className="sticky top-0 z-10 border-b border-zinc-200 bg-white/95 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95">
        <div className={`container mx-auto flex ${width} items-center justify-between px-4 py-4`}>
          <div className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-mono text-sm text-zinc-400">
            <ChevronLeft size={16} />
            {backLabel}
          </div>
          <h1 className="font-mono text-base font-bold">{title}</h1>
          <div className="w-16" />
        </div>
      </div>

      <main className={`container mx-auto ${width} px-3 py-5 md:py-7`}>
        {variant === 'dashboard' && <DashboardLoading />}
        {variant === 'list' && <ListLoading />}
        {variant === 'plans' && <PlansLoading />}
        {variant === 'detail' && <DetailLoading />}
        {variant === 'gear' && <GearLoading />}
      </main>
    </div>
  );
}

export function ProfilePageLoadingShell() {
  return (
    <main className="dark min-h-screen overflow-hidden bg-[#08090b] font-mono text-zinc-100" aria-busy="true">
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.14) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.14) 1px, transparent 1px)',
          backgroundSize: '44px 44px',
        }}
      />
      <div className="relative z-10 mx-auto max-w-6xl px-4 py-8">
        <div className="mb-8 h-6 w-44 animate-pulse rounded bg-cyan-400/15" />
        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="min-h-[320px] rounded-lg border border-zinc-800 bg-zinc-950/70 p-5">
            <div className="mb-5 h-12 w-2/3 animate-pulse rounded bg-zinc-800" />
            <div className="space-y-3">
              <div className="h-4 w-4/5 animate-pulse rounded bg-zinc-800" />
              <div className="h-4 w-3/5 animate-pulse rounded bg-zinc-800" />
            </div>
            <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-24 animate-pulse rounded-md border border-zinc-800 bg-zinc-900/80" />
              ))}
            </div>
          </section>
          <section className="min-h-[320px] animate-pulse rounded-lg border border-zinc-800 bg-zinc-900/70" />
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-40 animate-pulse rounded-lg border border-zinc-800 bg-zinc-950/70" />
          ))}
        </div>
      </div>
    </main>
  );
}

export function AppLoadingShell() {
  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50" aria-busy="true">
      <div className="border-b-4 border-zinc-800 bg-white dark:border-zinc-200 dark:bg-zinc-900">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <SkeletonBlock className="h-8 w-8" />
            <SkeletonBlock className="h-7 w-28" />
          </div>
          <div className="hidden items-center gap-4 md:flex">
            {Array.from({ length: 5 }).map((_, index) => (
              <SkeletonBlock key={index} className="h-4 w-20" />
            ))}
          </div>
          <SkeletonBlock className="h-9 w-24" />
        </div>
      </div>

      <main className="container mx-auto px-3 py-5 md:py-7">
        <div className="mx-auto max-w-6xl space-y-5">
          <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div className="space-y-3">
                <SkeletonBlock className="h-3 w-24" />
                <SkeletonBlock className="h-8 w-52" />
                <SkeletonBlock className="h-4 w-72 max-w-full" />
              </div>
              <SkeletonBlock className="h-10 w-10" />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <SkeletonBlock className="h-20" />
              <SkeletonBlock className="h-20" />
              <SkeletonBlock className="h-20" />
            </div>
          </section>

          <div className="grid gap-4 md:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <section key={index} className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                <SkeletonBlock className="h-40 rounded-none" />
                <div className="space-y-3 p-4">
                  <SkeletonBlock className="h-5 w-36" />
                  <SkeletonBlock className="h-3 w-24" />
                  <div className="grid grid-cols-2 gap-3">
                    <SkeletonBlock className="h-10" />
                    <SkeletonBlock className="h-10" />
                  </div>
                </div>
              </section>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

function SkeletonBlock({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800 ${className}`} />;
}

function DashboardLoading() {
  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-4">
        <div className="space-y-3">
          <SkeletonBlock className="h-4 w-24" />
          <SkeletonBlock className="h-8 w-56" />
          <SkeletonBlock className="h-4 w-72 max-w-full" />
        </div>
        <SkeletonBlock className="hidden h-11 w-11 sm:block" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <SkeletonBlock className="mb-3 h-3 w-20" />
            <SkeletonBlock className="h-8 w-24" />
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <SkeletonBlock className="mb-4 h-5 w-40" />
        <SkeletonBlock className="h-72 w-full" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <SkeletonBlock className="h-64 w-full" />
        <SkeletonBlock className="h-64 w-full" />
      </div>
    </div>
  );
}

function ListLoading() {
  return (
    <div className="space-y-4">
      <SkeletonBlock className="h-4 w-64 max-w-full" />
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <SkeletonBlock className="h-36 w-full rounded-none" />
          <div className="p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="space-y-2">
                <SkeletonBlock className="h-5 w-44" />
                <SkeletonBlock className="h-3 w-28" />
              </div>
              <SkeletonBlock className="h-7 w-14" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <SkeletonBlock className="h-10" />
              <SkeletonBlock className="h-10" />
              <SkeletonBlock className="h-10" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function PlansLoading() {
  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <SkeletonBlock className="mb-4 h-5 w-36" />
        <SkeletonBlock className="mb-3 h-8 w-64 max-w-full" />
        <SkeletonBlock className="h-4 w-80 max-w-full" />
      </section>
      {Array.from({ length: 2 }).map((_, index) => (
        <section key={index} className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="space-y-2">
              <SkeletonBlock className="h-5 w-36" />
              <SkeletonBlock className="h-3 w-48" />
            </div>
            <SkeletonBlock className="h-8 w-20" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <SkeletonBlock className="h-16" />
            <SkeletonBlock className="h-16" />
            <SkeletonBlock className="h-16" />
          </div>
        </section>
      ))}
    </div>
  );
}

function DetailLoading() {
  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <SkeletonBlock className="mb-4 h-52 w-full" />
        <SkeletonBlock className="mb-3 h-7 w-52" />
        <div className="grid grid-cols-3 gap-3">
          <SkeletonBlock className="h-14" />
          <SkeletonBlock className="h-14" />
          <SkeletonBlock className="h-14" />
        </div>
      </section>
      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <SkeletonBlock className="mb-4 h-5 w-40" />
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <SkeletonBlock key={index} className="h-12" />
          ))}
        </div>
      </section>
    </div>
  );
}

function GearLoading() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <SkeletonBlock key={index} className="h-24" />
        ))}
      </div>
      {Array.from({ length: 3 }).map((_, index) => (
        <section key={index} className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <SkeletonBlock className="h-10 w-10" />
              <div className="space-y-2">
                <SkeletonBlock className="h-5 w-44" />
                <SkeletonBlock className="h-3 w-28" />
              </div>
            </div>
            <SkeletonBlock className="h-8 w-24" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <SkeletonBlock className="h-12" />
            <SkeletonBlock className="h-12" />
            <SkeletonBlock className="h-12" />
          </div>
        </section>
      ))}
    </div>
  );
}
