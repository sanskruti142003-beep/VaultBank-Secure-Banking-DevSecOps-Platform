export function normalizePhone(
  value: string | null | undefined,
): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().replace(/[^\d+]/g, '');
  return normalized || null;
}
