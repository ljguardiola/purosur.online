import { PlaceholderLine } from "../feedback/placeholder-shapes";
import { Eyebrow } from "../layout/eyebrow";

export type HighlightedFigureProps = {
  label: string;
  tone?: "success" | "neutral" | undefined;
} & (
  | { value: string; detail?: string | undefined; loading?: false | undefined }
  | { loading: true; value?: undefined; detail?: undefined }
);

const TONE_CLASS_NAME = {
  success: { card: "bg-success-subtle", value: "text-success-strong" },
  neutral: { card: "bg-surface-subtle", value: "text-text" },
} as const;

export function HighlightedFigure({ label, tone = "success", ...figure }: HighlightedFigureProps) {
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-lg ${TONE_CLASS_NAME[tone].card} p-4`}
      aria-busy={figure.loading ? true : undefined}
    >
      <div className="flex flex-col gap-1">
        <Eyebrow text={label} />
        {figure.detail === undefined ? null : (
          <p className="text-detail text-text-subtle">{figure.detail}</p>
        )}
      </div>
      {figure.loading ? (
        <div
          aria-hidden="true"
          className="ml-auto flex h-lh w-32 animate-placeholder-reveal items-center text-display"
        >
          <PlaceholderLine widthPercent={100} />
        </div>
      ) : (
        <p
          className={`ml-auto min-w-0 text-end text-display break-words ${TONE_CLASS_NAME[tone].value}`}
        >
          {figure.value}
        </p>
      )}
    </div>
  );
}
