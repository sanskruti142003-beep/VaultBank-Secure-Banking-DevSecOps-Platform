import { cn } from "@/lib/utils";

interface SkeletonCardProps {
  className?: string;
  variant?: "card" | "row";
  label?: string;
}

export function SkeletonCard({
  className,
  variant = "card",
  label = "Loading accounts",
}: SkeletonCardProps) {
  if (variant === "row") {
    return (
      <div
        aria-busy="true"
        aria-label={label}
        className={cn(
          "animate-pulse rounded-2xl border border-slate-100 bg-white p-4 shadow-sm",
          className,
        )}
      >
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-full bg-slate-200" />
          <div className="min-w-0 flex-1 space-y-3">
            <div className="h-4 w-36 rounded bg-slate-200" />
            <div className="h-3 w-52 rounded bg-slate-100" />
          </div>
          <div className="h-9 w-24 rounded-lg bg-slate-100" />
        </div>
      </div>
    );
  }

  return (
    <div
      aria-busy="true"
      aria-label={label}
      className={cn(
        "animate-pulse rounded-2xl border border-slate-100 bg-white p-5 shadow-sm",
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <div className="h-6 w-28 rounded-full bg-slate-200" />
        <div className="h-6 w-20 rounded-full bg-slate-100" />
      </div>
      <div className="mt-6 h-12 w-12 rounded-2xl bg-slate-200" />
      <div className="mt-5 h-5 w-44 rounded bg-slate-200" />
      <div className="mt-3 h-4 w-36 rounded bg-slate-100" />
      <div className="mt-8 h-8 w-40 rounded bg-slate-200" />
      <div className="mt-5 h-16 rounded-xl bg-slate-100" />
      <div className="mt-5 flex gap-3">
        <div className="h-10 flex-1 rounded-lg bg-slate-100" />
        <div className="h-10 flex-1 rounded-lg bg-slate-100" />
      </div>
    </div>
  );
}
