import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface DashboardCardProps {
  children: ReactNode;
  className?: string;
  id?: string;
}

interface IconTileProps {
  icon: ComponentType<{ className?: string }>;
  tone?: "blue" | "green" | "amber" | "red" | "violet" | "slate";
  className?: string;
}

interface StatusPillProps {
  children: ReactNode;
  tone?: "blue" | "green" | "amber" | "red" | "violet" | "slate";
  className?: string;
}

interface MetricCardProps {
  title: string;
  value: string | number;
  helper: string;
  icon: ComponentType<{ className?: string }>;
  onClick?: () => void;
  tone?: IconTileProps["tone"];
  trend?: string;
  trendTone?: "green" | "red" | "slate";
}

const tileTones = {
  blue: "bg-primary/10 text-primary",
  green: "bg-emerald-50 text-emerald-600",
  amber: "bg-amber-50 text-amber-600",
  red: "bg-red-50 text-red-600",
  violet: "bg-violet-50 text-violet-600",
  slate: "bg-slate-100 text-slate-600",
};

const pillTones = {
  blue: "bg-primary/10 text-primary ring-primary/20",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  amber: "bg-amber-50 text-amber-700 ring-amber-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  violet: "bg-violet-50 text-violet-700 ring-violet-200",
  slate: "bg-slate-100 text-slate-600 ring-slate-200",
};

const trendTones = {
  green: "text-emerald-600",
  red: "text-red-600",
  slate: "text-muted",
};

export function DashboardCard({ children, className, id }: DashboardCardProps) {
  return (
    <section
      id={id}
      className={cn(
        "rounded-xl border border-slate-200 bg-white shadow-sm shadow-slate-200/40",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function IconTile({
  icon: Icon,
  tone = "blue",
  className,
}: IconTileProps) {
  return (
    <span
      className={cn(
        "inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl",
        tileTones[tone],
        className,
      )}
    >
      <Icon className="h-6 w-6" />
    </span>
  );
}

export function StatusPill({
  children,
  tone = "slate",
  className,
}: StatusPillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold ring-1",
        pillTones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function MetricCard({
  title,
  value,
  helper,
  icon,
  onClick,
  tone = "blue",
  trend,
  trendTone = "slate",
}: MetricCardProps) {
  const content = (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-600">{title}</p>
        <p className="mt-2 truncate text-2xl font-bold text-secondary">
          {value}
        </p>
        <p className="mt-2 text-xs text-muted">
          {trend ? (
            <span className={cn("font-semibold", trendTones[trendTone])}>
              {trend}{" "}
            </span>
          ) : null}
          {helper}
        </p>
      </div>
      <IconTile icon={icon} tone={tone} />
    </div>
  );

  return (
    <DashboardCard
      className={cn(
        "p-5",
        onClick &&
          "cursor-pointer transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-focus",
      )}
    >
      {onClick ? (
        <button
          className="block w-full text-left"
          onClick={onClick}
          type="button"
        >
          {content}
        </button>
      ) : (
        content
      )}
    </DashboardCard>
  );
}
