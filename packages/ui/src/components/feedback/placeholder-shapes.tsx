const LINE_WIDTHS_PERCENT = [72, 48, 64, 56, 80, 40];

export function placeholderLineWidthPercent(position: number): number {
  return LINE_WIDTHS_PERCENT[position % LINE_WIDTHS_PERCENT.length] as number;
}

export function placeholderIds(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, position) => `${prefix}-${position + 1}`);
}

export function PlaceholderLine({ widthPercent }: { widthPercent: number }) {
  return <div className="h-3 rounded-md bg-surface-soft" style={{ width: `${widthPercent}%` }} />;
}

export function PlaceholderSquare() {
  return <div className="size-control-md shrink-0 rounded-lg bg-surface-soft" />;
}

export function PlaceholderField() {
  return <div className="h-control-2xl w-full rounded-lg bg-surface-soft" />;
}
