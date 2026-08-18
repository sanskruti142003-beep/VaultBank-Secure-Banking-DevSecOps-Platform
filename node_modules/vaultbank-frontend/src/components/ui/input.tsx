import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  hasError?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, hasError = false, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-11 w-full rounded-lg border bg-white px-3 py-2 text-sm text-secondary shadow-sm transition duration-200 ease-in-out placeholder:text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 focus:shadow-focus disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-muted",
        hasError && "border-danger bg-red-50 focus:border-danger focus:ring-danger/20",
        className,
      )}
      {...props}
    />
  ),
);

Input.displayName = "Input";
