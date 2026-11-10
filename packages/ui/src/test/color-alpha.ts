export function colorAlpha(color: string): number {
  const alpha = color.match(/\/ ([\d.]+)\)$/)?.[1] ?? color.match(/, ([\d.]+)\)$/)?.[1];
  return alpha === undefined ? 1 : Number(alpha);
}
