export function isPointTerminalId(value: string): boolean {
  return value.length > 0 && !/\s/u.test(value);
}

export function normalizePointTerminalId(raw: string): string | null {
  const trimmed = raw.trim();
  return isPointTerminalId(trimmed) ? trimmed : null;
}
