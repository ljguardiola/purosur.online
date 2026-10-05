import { PlaceholderLine } from "../feedback/placeholder-shapes";
import { Eyebrow } from "../layout/eyebrow";

export type FigureStatProps = {
  label: string;
  size?: "display" | "heading" | undefined;
} & (
  | { value: string; detail?: string | undefined; loading?: false | undefined }
  | { loading: true; value?: undefined; detail?: undefined }
);

const sizeClassName = {
  display: "text-display",
  heading: "text-heading",
} as const;

export function FigureStat({ label, size = "display", ...figure }: FigureStatProps) {
  return (
    <div className="flex flex-col gap-1" aria-busy={figure.loading ? true : undefined}>
      <Eyebrow text={label} />
      {figure.detail === undefined ? null : (
        <p className="text-detail text-text-subtle">{figure.detail}</p>
      )}
      {figure.loading ? (
        <div
          aria-hidden="true"
          className={`flex h-lh animate-placeholder-reveal items-center ${sizeClassName[size]}`}
        >
          <PlaceholderLine widthPercent={60} />
        </div>
      ) : (
        <p className={`${sizeClassName[size]} text-text-accent`}>{figure.value}</p>
      )}
    </div>
  );
}
