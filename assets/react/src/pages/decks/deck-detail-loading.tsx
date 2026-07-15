export function DeckDetailLoadingState() {
  return (
    <div className="space-y-7">
      <div className="h-8 w-32 animate-pulse rounded-btn bg-base-300" />
      <section className="min-h-52 rounded-box border border-base-300 bg-base-100 p-5 shadow-sm">
        <div className="flex h-full flex-col justify-between gap-8">
          <div className="flex gap-2">
            <div className="h-6 w-24 animate-pulse rounded-full bg-base-300" />
            <div className="h-6 w-20 animate-pulse rounded-full bg-base-300" />
          </div>
          <div className="space-y-3">
            <div className="h-8 max-w-lg animate-pulse rounded-btn bg-base-300" />
            <div className="h-4 max-w-sm animate-pulse rounded-btn bg-base-300" />
          </div>
        </div>
      </section>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, index) => <div key={index} className="aspect-[5/7] animate-pulse rounded-xl bg-base-300" />)}
      </div>
    </div>
  )
}
