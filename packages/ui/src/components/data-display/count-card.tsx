import type { AnchorHTMLAttributes } from "react";
import { formatNumber } from "../../messages/formatters";
import { type Tone, toneClassName } from "../shared/tone";

export type CountCardProps = Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  "className" | "children"
> & {
  label: string;
  count: number;
  tone: Extract<Tone, "error" | "warning" | "info">;
  detail?: string;
};

const cardClassName =
  "flex flex-col gap-1 rounded-lg border border-border bg-surface p-4 outline-none " +
  "transition-colors hover:bg-surface-subtle focus-visible:focus-ring";

export function CountCard({ label, count, tone, detail, ...props }: CountCardProps) {
  return (
    <a {...props} className={cardClassName}>
      <span className="font-bold text-detail text-text-subtle">{label}</span>
      <span className={`text-display ${toneClassName[tone].strongText}`}>
        {formatNumber(count)}
      </span>
      {detail ? <span className="text-detail text-text-subtle">{detail}</span> : null}
    </a>
  );
}
