import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { FormError } from "@/components/common/FormError";
import { Input, type InputProps } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface PasswordInputProps extends Omit<InputProps, "type"> {
  label: string;
  error?: string;
  helperText?: string;
  inputClassName?: string;
}

export const PasswordInput = React.forwardRef<
  HTMLInputElement,
  PasswordInputProps
>(
  (
    {
      id,
      label,
      error,
      helperText,
      className,
      inputClassName,
      disabled,
      ...props
    },
    ref,
  ) => {
    const [isVisible, setIsVisible] = React.useState(false);
    const errorId = error ? `${id}-error` : undefined;
    const helperId = helperText && !error ? `${id}-helper` : undefined;

    return (
      <div className={cn("space-y-1.5", className)}>
        <label className="text-sm font-medium text-secondary" htmlFor={id}>
          {label}
        </label>
        <div className="relative">
          <Input
            ref={ref}
            id={id}
            type={isVisible ? "text" : "password"}
            disabled={disabled}
            hasError={Boolean(error)}
            className={cn("pr-12", inputClassName)}
            aria-invalid={Boolean(error)}
            aria-describedby={errorId ?? helperId}
            {...props}
          />
          <button
            className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted transition hover:bg-slate-100 hover:text-secondary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:pointer-events-none disabled:opacity-50"
            type="button"
            aria-label={isVisible ? "Hide password" : "Show password"}
            onClick={() => setIsVisible((value) => !value)}
            disabled={disabled}
          >
            {isVisible ? (
              <EyeOff className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Eye className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </div>
        {helperText && !error ? (
          <p id={helperId} className="text-sm text-muted">
            {helperText}
          </p>
        ) : null}
        <FormError id={errorId} message={error} />
      </div>
    );
  },
);

PasswordInput.displayName = "PasswordInput";
