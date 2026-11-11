import { Check } from "lucide-react";

export type ScaleStatusBadgeProps = {
  status: "stable" | "moving";
};

const badgeClassName =
  "inline-flex h-7 items-center gap-2 rounded-full border px-3 font-sans text-detail font-semibold";

export function ScaleStatusBadge({ status }: ScaleStatusBadgeProps) {
  return status === "stable" ? (
    <span className={`${badgeClassName} border-transparent bg-success-strong text-text-inverse`}>
      <Check aria-hidden="true" className="size-icon-xs shrink-0" />
      Estable
    </span>
  ) : (
    <span className={`${badgeClassName} border-warning-soft bg-surface text-warning-strong`}>
      <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-warning-soft" />
      Moviéndose
    </span>
  );
}
