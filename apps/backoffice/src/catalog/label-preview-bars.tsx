import { ean13Modules } from "@purosur/domain";

// The standard EAN-13 human-readable layout: first digit alone, then two halves of six digits.
export function groupedEan13Digits(code: string): string {
  return `${code.slice(0, 1)} ${code.slice(1, 7)} ${code.slice(7, 13)}`;
}

function barRuns(modules: string): { start: number; width: number }[] {
  const runs: { start: number; width: number }[] = [];
  let position = 0;
  while (position < modules.length) {
    if (modules[position] !== "1") {
      position += 1;
      continue;
    }
    const start = position;
    while (position < modules.length && modules[position] === "1") {
      position += 1;
    }
    runs.push({ start, width: position - start });
  }
  return runs;
}

export function LabelPreviewBars({ code }: { code: string }) {
  const modules = ean13Modules(code);
  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${modules.length} 40`}
      preserveAspectRatio="none"
      className="h-10 w-full text-text"
    >
      {barRuns(modules).map((run) => (
        <rect
          key={run.start}
          x={run.start}
          y={0}
          width={run.width}
          height={40}
          fill="currentColor"
        />
      ))}
    </svg>
  );
}
