import { Shield } from "lucide-react";
import { APP_NAME } from "@/constants/auth.constants";
import { cn } from "@/lib/utils";

interface LogoProps {
  variant?: "dark" | "light";
  className?: string;
}

export function Logo({ variant = "dark", className }: LogoProps) {
  const isLight = variant === "light";
  return (
    <div
      className={cn(
        "inline-flex items-center gap-3 font-semibold tracking-tight",
        isLight ? "text-white" : "text-secondary",
        className,
      )}
    >
      <span
        className={cn(
          "flex h-11 w-11 items-center justify-center rounded-xl",
          isLight ? "bg-white/15 text-white" : "bg-primary text-white",
        )}
      >
        <Shield className="h-6 w-6" aria-hidden="true" />
      </span>
      <span className="text-xl">{APP_NAME}</span>
    </div>
  );
}
