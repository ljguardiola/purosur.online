import { Scale } from "lucide-react";
import { Eyebrow } from "../layout/eyebrow";

export type ScaleCardProps = {
  reading?: { value: string; settled: boolean } | undefined;
};

export function ScaleCard({ reading }: ScaleCardProps) {
  return (
    <div
      className={
        "flex min-w-56 items-center gap-3 rounded-lg border px-4 py-3 " +
        (reading === undefined
          ? "border-border bg-surface"
          : "border-warning-soft bg-warning-subtle")
      }
    >
      <span
        aria-hidden="true"
        className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-soft text-text-eyebrow *:size-icon-md"
      >
        <Scale />
      </span>
      <div className="flex min-w-0 flex-col">
        <Eyebrow text="Balanza" />
        {reading === undefined ? null : (
          <p className={`text-heading ${reading.settled ? "text-text" : "text-text-subtle"}`}>
            {reading.value}
          </p>
        )}
      </div>
    </div>
  );
}
