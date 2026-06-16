import { ChevronLeft } from 'lucide-react';

export default function ActivityDetailRouteLoading() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="sticky top-0 z-10 border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="container mx-auto flex max-w-6xl items-center justify-between px-4 py-2">
          <div className="inline-flex h-9 items-center gap-1 rounded-md px-2 font-mono text-sm text-zinc-400">
            <ChevronLeft size={16} />
            返回
          </div>
          <div className="h-4 w-16 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
        </div>
      </div>

      <div className="container mx-auto max-w-6xl px-4 py-5 sm:py-6">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.92fr)]">
          <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-5">
            <div className="mb-4 h-6 w-48 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800" />
            <div className="mb-3 h-9 w-3/4 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800" />
            <div className="mb-6 h-4 w-2/3 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800" />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="rounded-lg border border-zinc-100 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950/40">
                  <div className="mb-3 h-8 w-8 animate-pulse rounded-md bg-zinc-200 dark:bg-zinc-800" />
                  <div className="mb-2 h-3 w-14 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
                  <div className="h-6 w-20 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
                </div>
              ))}
            </div>
          </section>

          <section className="min-h-[320px] animate-pulse rounded-lg border border-zinc-200 bg-zinc-100 shadow-sm dark:border-zinc-800 dark:bg-zinc-900" />
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <main className="space-y-5">
            <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <div className="mb-4 h-6 w-36 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
              <div className="space-y-3">
                <div className="h-20 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800" />
                <div className="h-24 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800" />
                <div className="grid grid-cols-2 gap-2">
                  <div className="h-24 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800" />
                  <div className="h-24 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800" />
                </div>
              </div>
            </section>
          </main>
          <aside className="space-y-5">
            <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <div className="mb-3 h-4 w-24 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
              <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md">
                {Array.from({ length: 8 }).map((_, index) => (
                  <div key={index} className="h-16 animate-pulse bg-zinc-100 dark:bg-zinc-800" />
                ))}
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
