export function HomeSkeleton() {
  return (
    <div className="mx-auto max-w-lg px-4 pb-32 pt-5" aria-busy="true" aria-label="Завантаження">
      <div className="mb-5 flex items-center justify-between">
        <div className="space-y-2">
          <div className="skeleton h-7 w-44 rounded-xl" />
          <div className="skeleton h-4 w-32 rounded-lg" />
        </div>
        <div className="skeleton size-11 rounded-full" />
      </div>
      <div className="space-y-5">
        <div className="hero-wash soft-shadow space-y-4 rounded-[28px] p-5">
          <div className="skeleton h-4 w-36 rounded-lg" />
          <div className="skeleton h-11 w-48 rounded-2xl" />
          <div className="skeleton h-2 w-full rounded-full" />
        </div>
        <div className="soft-shadow grid grid-cols-4 gap-2 rounded-[28px] bg-card px-2 py-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-2">
              <div className="skeleton size-14 rounded-full" />
              <div className="skeleton h-3 w-12 rounded" />
            </div>
          ))}
        </div>
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="soft-shadow h-[132px] min-w-[158px] rounded-3xl bg-card p-4">
              <div className="skeleton h-8 w-24 rounded-full" />
              <div className="skeleton mt-5 h-6 w-28 rounded-lg" />
            </div>
          ))}
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="soft-shadow flex items-center gap-3 rounded-3xl bg-card px-3.5 py-3">
            <div className="skeleton size-11 rounded-full" />
            <div className="flex-1 space-y-2">
              <div className="skeleton h-4 w-32 rounded" />
              <div className="skeleton h-3 w-20 rounded" />
            </div>
            <div className="skeleton h-4 w-16 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
