export default function Loading() {
  return (
    <div className="flex h-dvh flex-col">
      <div className="h-[57px] border-b border-line bg-surface" />
      <div className="grid min-h-0 flex-1 md:grid-cols-2">
        <div className="hidden bg-reader md:block" />
        <div className="flex flex-col gap-4 p-5" aria-busy="true" aria-label="Loading review">
          <div className="h-24 animate-pulse rounded-lg bg-surface" />
          <div className="h-5 w-40 animate-pulse rounded bg-surface" />
          <div className="h-40 animate-pulse rounded-lg bg-surface" />
        </div>
      </div>
    </div>
  );
}
