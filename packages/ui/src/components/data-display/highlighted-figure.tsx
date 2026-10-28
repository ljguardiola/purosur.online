import { PlaceholderLine } from "../feedback/placeholder-shapes";
import { Eyebrow } from "../layout/eyebrow";

export type HighlightedFigureProps = {
  label: string;
} & (
  | { value: string; detail?: string | undefined; loading?: false | undefined }
  | { loading: true; value?: undefined; detail?: undefined }
);

export function HighlightedFigure({ label, ...figure }: HighlightedFigureProps) {
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-lg bg-success-subtle p-4"
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
        <p className="ml-auto min-w-0 text-end text-display break-words text-success-strong">
          {figure.value}
        </p>
      )}
    </div>
  );
}
