import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function firstName(fullName: string): string {
  const [name] = fullName.trim().split(/\s+/);
  return name || fullName;
}

export function normalizePhone(value: string): string {
  return value.replace(/[^\d+]/g, "");
}

export function formatSeconds(seconds: number): string {
  const value = Math.max(0, seconds);
  return `${value}s`;
}

export function customerDisplayId(userId: string | null | undefined): string {
  const digits = (userId ?? "")
    .replace(/\D/g, "")
    .slice(0, 10)
    .padEnd(10, "0");
  return `VBK${digits}`;
}
