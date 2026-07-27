export function isDatabaseSslEnabled(value: string | undefined): boolean {
  return value?.toLowerCase() === 'true';
}
