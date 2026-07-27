import * as React from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { OTP_LENGTH } from "@/constants/auth.constants";
import { cn } from "@/lib/utils";

interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  error?: string;
  disabled?: boolean;
  isLoading?: boolean;
  success?: boolean;
  autoFocus?: boolean;
}

function emptyDigits(value: string): string[] {
  return Array.from({ length: OTP_LENGTH }, (_, index) => value[index] ?? "");
}

export function OtpInput({
  value,
  onChange,
  onComplete,
  error,
  disabled = false,
  isLoading = false,
  success = false,
  autoFocus = false,
}: OtpInputProps) {
  const inputsRef = React.useRef<Array<HTMLInputElement | null>>([]);
  const timeoutRef = React.useRef<number | null>(null);
  const digits = emptyDigits(value);

  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  React.useEffect(() => {
    if (autoFocus && !disabled && !isLoading && !success) {
      inputsRef.current[0]?.focus();
    }
  }, [autoFocus, disabled, isLoading, success]);

  const completeIfReady = (nextValue: string) => {
    if (nextValue.length === OTP_LENGTH && onComplete) {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = window.setTimeout(() => {
        onComplete(nextValue);
      }, 300);
    }
  };

  const updateDigit = (index: number, digit: string) => {
    const nextDigits = emptyDigits(value);
    nextDigits[index] = digit;
    const nextValue = nextDigits.join("").slice(0, OTP_LENGTH);
    onChange(nextValue);
    completeIfReady(nextValue);
  };

  const focusInput = (index: number) => {
    inputsRef.current[index]?.focus();
    inputsRef.current[index]?.select();
  };

  return (
    <div className="relative" aria-busy={isLoading}>
      <motion.div
        className="grid grid-cols-6 gap-2 sm:gap-3"
        animate={error ? { x: [0, -8, 8, -8, 8, 0] } : { x: 0 }}
        transition={{ duration: 0.36, ease: "easeInOut" }}
      >
        {digits.map((digit, index) => (
          <input
            key={`otp-${index.toString()}`}
            ref={(node) => {
              inputsRef.current[index] = node;
            }}
            className={cn(
              "h-12 min-w-0 rounded-lg border bg-white text-center text-xl font-bold text-secondary shadow-sm transition duration-200 ease-in-out focus:scale-105 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 sm:h-14 lg:h-[60px]",
              digit && "border-primary bg-primary/5",
              error && "border-danger bg-red-50",
              success && "border-accent bg-emerald-50 text-accent",
            )}
            aria-label={`Digit ${index + 1} of 6`}
            aria-invalid={Boolean(error)}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete={index === 0 ? "one-time-code" : "off"}
            maxLength={1}
            value={digit}
            disabled={disabled || isLoading || success}
            onChange={(event) => {
              const nextDigit = event.target.value.replace(/\D/g, "").slice(-1);
              if (!nextDigit) {
                updateDigit(index, "");
                return;
              }
              updateDigit(index, nextDigit);
              if (index < OTP_LENGTH - 1) {
                focusInput(index + 1);
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Backspace") {
                event.preventDefault();
                if (digit) {
                  updateDigit(index, "");
                } else if (index > 0) {
                  updateDigit(index - 1, "");
                  focusInput(index - 1);
                }
              }
              if (event.key === "ArrowLeft" && index > 0) {
                event.preventDefault();
                focusInput(index - 1);
              }
              if (event.key === "ArrowRight" && index < OTP_LENGTH - 1) {
                event.preventDefault();
                focusInput(index + 1);
              }
            }}
            onPaste={(event) => {
              event.preventDefault();
              const pasted = event.clipboardData
                .getData("text")
                .replace(/\D/g, "")
                .slice(0, OTP_LENGTH);
              if (!pasted) {
                return;
              }
              onChange(pasted);
              completeIfReady(pasted);
              focusInput(Math.min(pasted.length, OTP_LENGTH) - 1);
            }}
          />
        ))}
      </motion.div>
      {isLoading ? (
        <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-white/70">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
        </div>
      ) : null}
      {success ? (
        <div className="mt-3 flex justify-center text-accent">
          <CheckCircle2 className="h-6 w-6" aria-label="Verified" />
        </div>
      ) : null}
    </div>
  );
}
