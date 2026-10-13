import type { ReactNode } from "react";
import type { Icon } from "../shared/icon";
import { type Tone, toneClassName } from "../shared/tone";

export type PillTone = Extract<Tone, "warning" | "error">;

export type PillContentProps = {
  tone: PillTone;
  icon: Icon;
  children: Exclude<ReactNode, null | undefined | boolean>;
};

export function pillClassName(tone: PillTone): string {
  return (
    "inline-flex h-7 items-center gap-2 whitespace-nowrap rounded-full px-3 font-sans text-detail " +
    `font-semibold ${toneClassName[tone].surface}`
  );
}

export const pillHoverRingClassName: Record<PillTone, string> = {
  warning: "hover:ring-1 hover:ring-warning-soft",
  error: "hover:ring-1 hover:ring-error-soft",
};

export const pillPressableHoverRingClassName: Record<PillTone, string> = {
  warning: "data-hovered:ring-1 data-hovered:ring-warning-soft",
  error: "data-hovered:ring-1 data-hovered:ring-error-soft",
};

export function PillContent({ icon, children }: Omit<PillContentProps, "tone">) {
  return (
    <>
      <span aria-hidden="true" className="inline-flex size-icon-xs shrink-0 *:size-full">
        {icon}
      </span>
      {children}
    </>
  );
}
