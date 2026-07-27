import {
  CURRENCY_NAMES,
  formatCurrency,
  parseMoney,
} from "@/constants/accounts.constants";
import { cn } from "@/lib/utils";
import type { Currency } from "@/types/accounts.types";

interface BalanceDisplayProps {
  amount: string;
  currency: Currency;
  size?: "sm" | "md" | "lg";
  className?: string;
  tone?: "auto" | "neutral";
}

const sizeClasses = {
  sm: "text-lg font-semibold",
  md: "text-2xl font-bold",
  lg: "text-4xl font-bold tracking-normal",
};

const ones = [
  "",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
];

const tens = [
  "",
  "",
  "twenty",
  "thirty",
  "forty",
  "fifty",
  "sixty",
  "seventy",
  "eighty",
  "ninety",
];

function wordsUnderThousand(value: number): string {
  const parts: string[] = [];
  const hundred = Math.floor(value / 100);
  const rest = value % 100;
  if (hundred) {
    parts.push(`${ones[hundred]} hundred`);
  }
  if (rest < 20) {
    if (ones[rest]) {
      parts.push(ones[rest]);
    }
  } else {
    const ten = Math.floor(rest / 10);
    const one = rest % 10;
    parts.push(one ? `${tens[ten]} ${ones[one]}` : tens[ten]);
  }
  return parts.join(" ");
}

function numberToWords(value: number): string {
  if (value === 0) {
    return "zero";
  }
  const scales = [
    { value: 1_000_000, label: "million" },
    { value: 1_000, label: "thousand" },
    { value: 1, label: "" },
  ];
  const parts: string[] = [];
  let remaining = Math.floor(Math.abs(value));
  scales.forEach((scale) => {
    const count = Math.floor(remaining / scale.value);
    if (count) {
      parts.push(
        `${wordsUnderThousand(count)}${scale.label ? ` ${scale.label}` : ""}`,
      );
      remaining %= scale.value;
    }
  });
  return parts.join(" ");
}

function moneyAriaLabel(amount: string, currency: Currency): string {
  const numeric = parseMoney(amount);
  const whole = Math.floor(Math.abs(numeric));
  const cents = Math.round((Math.abs(numeric) - whole) * 100);
  const sign = numeric < 0 ? "negative " : "";
  return `Balance: ${sign}${numberToWords(whole)} ${CURRENCY_NAMES[currency]}${cents ? ` and ${cents} cents` : ""}`;
}

export function BalanceDisplay({
  amount,
  currency,
  size = "md",
  className,
  tone = "auto",
}: BalanceDisplayProps) {
  const numeric = parseMoney(amount);
  const colorClass =
    tone === "neutral"
      ? "text-secondary"
      : numeric < 0
        ? "text-red-500"
        : "text-emerald-600";

  return (
    <span
      aria-label={moneyAriaLabel(amount, currency)}
      className={cn(sizeClasses[size], colorClass, className)}
    >
      {formatCurrency(amount, currency)}
    </span>
  );
}
