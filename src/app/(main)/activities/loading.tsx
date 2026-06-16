export default function ActivitiesRouteLoading() {
  return (
    <div className="container mx-auto px-3 py-4">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="h-16 w-48 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-900" />
        <div className="flex gap-2">
          <div className="h-8 w-8 animate-pulse rounded-full bg-zinc-100 dark:bg-zinc-900" />
          <div className="h-8 w-8 animate-pulse rounded-full bg-zinc-100 dark:bg-zinc-900" />
        </div>
      </div>
      <div className="mb-4 flex gap-2 px-1">
        <div className="h-7 w-16 animate-pulse rounded-full bg-zinc-100 dark:bg-zinc-900" />
        <div className="h-7 w-16 animate-pulse rounded-full bg-zinc-100 dark:bg-zinc-900" />
        <div className="h-7 w-16 animate-pulse rounded-full bg-zinc-100 dark:bg-zinc-900" />
      </div>
      <div className="space-y-6">
        {[0, 1].map((group) => (
          <div key={group} className="border-t-2 border-zinc-100 pt-4 dark:border-zinc-800">
            <div className="mb-3 h-5 w-40 animate-pulse rounded bg-zinc-100 dark:bg-zinc-900" />
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
              {Array.from({ length: 6 }).map((_, index) => (
                <div
                  key={index}
                  className="aspect-[3/4] animate-pulse rounded-sm bg-zinc-100 dark:bg-zinc-900"
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
