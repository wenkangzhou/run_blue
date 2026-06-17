export default function HeatmapRouteLoading() {
  return (
    <div className="h-screen w-full overflow-hidden bg-zinc-100 dark:bg-zinc-950" aria-busy="true">
      <div className="absolute left-3 top-3 z-10 flex gap-2">
        <div className="h-9 w-16 animate-pulse border border-zinc-200 bg-white/90 dark:border-zinc-800 dark:bg-zinc-900/90" />
        <div className="h-9 w-16 animate-pulse border border-zinc-200 bg-white/90 dark:border-zinc-800 dark:bg-zinc-900/90" />
        <div className="h-9 w-16 animate-pulse border border-zinc-200 bg-white/90 dark:border-zinc-800 dark:bg-zinc-900/90" />
      </div>
      <div
        className="h-full w-full opacity-70"
        style={{
          backgroundImage:
            'linear-gradient(rgba(24,24,27,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(24,24,27,0.08) 1px, transparent 1px)',
          backgroundSize: '42px 42px',
        }}
      />
      <div className="absolute inset-x-8 top-1/3 h-3 animate-pulse rounded-full bg-blue-400/30" />
      <div className="absolute left-1/4 top-1/2 h-3 w-1/2 animate-pulse rounded-full bg-emerald-400/25" />
      <div className="absolute bottom-5 right-5 h-20 w-10 animate-pulse border border-zinc-200 bg-white/90 dark:border-zinc-800 dark:bg-zinc-900/90" />
    </div>
  );
}
