export type CountdownBarProps = {
  remainingSeconds: number;
  totalSeconds: number;
  label: string;
};

export function CountdownBar({ remainingSeconds, totalSeconds, label }: CountdownBarProps) {
  const remaining = Math.min(Math.max(remainingSeconds, 0), Math.max(totalSeconds, 0));
  const share = totalSeconds > 0 ? remaining / totalSeconds : 0;

  return (
    <div role="timer" aria-label={label} className="flex items-center gap-3 font-sans">
      <div
        aria-hidden="true"
        className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-border"
      >
        <div
          data-fill=""
          className="h-full rounded-full bg-info transition-[width] duration-1000 ease-linear"
          style={{ width: `${share * 100}%` }}
        />
      </div>
      <span className="shrink-0 text-body font-bold text-text">{Math.ceil(remaining)} s</span>
    </div>
  );
}
