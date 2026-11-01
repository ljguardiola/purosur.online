export function wholeNumberFrom(text: string): number {
  const trimmed = text.trim();
  return /^\d+$/.test(trimmed) ? Number(trimmed) : Number.NaN;
}
