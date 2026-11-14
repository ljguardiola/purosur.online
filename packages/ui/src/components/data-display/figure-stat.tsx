import { PlaceholderLine } from "../feedback/placeholder-shapes";
import { Eyebrow } from "../layout/eyebrow";
import type { Tone } from "../shared/tone";

export type FigureStatProps = {
  label: string;
  size?: "hero" | "display" | "heading" | undefined;
  variant?: "accent" | "plain" | undefined;
  labelTone?: Tone | undefined;
  monospace?: boolean | undefined;
} & (
  | { value: string; detail?: string | undefined; loading?: false | undefined }
  | { loading: true; value?: undefined; detail?: undefined }
);

const sizeClassName = {
  hero: "text-hero",
  display: "text-display",
  heading: "text-heading",
} as const;

const variantClassName = { accent: "text-text-accent", plain: "text-text" } as const;

export function FigureStat({
  label,
  size = "display",
  variant = "accent",
  labelTone,
  monospace = false,
  ...figure
}: FigureStatProps) {
  return (
    <div className="flex flex-col gap-1" aria-busy={figure.loading ? true : undefined}>
      <Eyebrow text={label} tone={labelTone} />
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
        <p
          className={`${sizeClassName[size]} ${variantClassName[variant]}${monospace ? " font-mono" : ""}`}
        >
          {figure.value}
        </p>
      )}
    </div>
  );
}
