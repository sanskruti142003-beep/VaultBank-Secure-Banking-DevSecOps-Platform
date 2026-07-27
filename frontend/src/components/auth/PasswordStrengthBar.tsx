import { CheckCircle2, Circle } from "lucide-react";
import { passwordRules } from "@/lib/validations/auth.schemas";
import { cn } from "@/lib/utils";

interface PasswordStrengthBarProps {
  password: string;
}

const strengthLabels = ["Weak", "Fair", "Good", "Strong"] as const;
const segmentStyles = [
  "bg-danger",
  "bg-warning",
  "bg-yellow-400",
  "bg-accent",
] as const;
const textStyles = [
  "text-danger",
  "text-warning",
  "text-yellow-700",
  "text-accent",
] as const;

export function passwordStrength(password: string): number {
  const passed = passwordRules.filter((rule) => rule.test(password)).length;
  if (passed <= 1) {
    return 0;
  }
  if (passed <= 3) {
    return 1;
  }
  if (passed === 4) {
    return 2;
  }
  return 3;
}

export function PasswordStrengthBar({ password }: PasswordStrengthBarProps) {
  const strength = password ? passwordStrength(password) : -1;

  return (
    <div className="space-y-3" aria-live="polite">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted">
            Password strength
          </span>
          <span
            className={cn(
              "text-xs font-semibold",
              strength >= 0 ? textStyles[strength] : "text-muted",
            )}
          >
            {strength >= 0 ? strengthLabels[strength] : "Not started"}
          </span>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {strengthLabels.map((label, index) => (
            <span
              key={label}
              className={cn(
                "h-1.5 rounded-full bg-slate-200 transition-colors",
                strength >= index && segmentStyles[strength],
              )}
            />
          ))}
        </div>
      </div>
      <ul className="grid gap-2 text-sm text-muted">
        {passwordRules.map((rule) => {
          const isMet = rule.test(password);
          return (
            <li
              key={rule.id}
              className={cn(
                "flex items-center gap-2",
                isMet && "font-medium text-accent",
              )}
            >
              {isMet ? (
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Circle className="h-4 w-4" aria-hidden="true" />
              )}
              <span>{rule.label}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
