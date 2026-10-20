export function isQrExternalPosId(value: string): boolean {
  return value.length > 0 && !/\s/u.test(value);
}

export function normalizeQrExternalPosId(raw: string): string | null {
  const trimmed = raw.trim();
  return isQrExternalPosId(trimmed) ? trimmed : null;
}
