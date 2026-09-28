import { Loader } from "lucide-react";
import type { ReactNode } from "react";

export type StatusIndicatorTone = "success" | "warning" | "error" | "info" | "neutral";

export type StatusIndicatorProps = {
  tone: StatusIndicatorTone;
  busy?: boolean;
  children: Exclude<ReactNode, null | undefined | boolean>;
};

const pillClassName =
  "inline-flex h-7 items-center gap-2 rounded-full px-3 font-sans text-detail font-semibold";

const toneClassName: Record<StatusIndicatorTone, string> = {
  success: "bg-success-subtle text-success-strong",
  warning: "bg-warning-subtle text-warning-strong",
  error: "bg-error-subtle text-error-strong",
  info: "bg-info-subtle text-info-strong",
  neutral: "bg-neutral-subtle text-text-subtle",
};

const dotClassName: Record<StatusIndicatorTone, string> = {
  success: "bg-success-soft",
  warning: "bg-warning-soft",
  error: "bg-error-soft",
  info: "bg-info-soft",
  neutral: "bg-neutral",
};

const spinnerColorClassName: Record<StatusIndicatorTone, string> = {
  success: "text-success-soft",
  warning: "text-warning-soft",
  error: "text-error-soft",
  info: "text-info-soft",
  neutral: "text-text-subtle",
};

const spinnerBaseClassName = "size-icon-xs shrink-0 animate-spin motion-reduce:animate-none";
const dotBaseClassName = "size-2 shrink-0 rounded-full";

export function StatusIndicator({ tone, busy = false, children }: StatusIndicatorProps) {
  const className = [pillClassName, toneClassName[tone]].join(" ");

  return (
    <span className={className}>
      {busy ? (
        <Loader
          aria-hidden="true"
          className={[spinnerBaseClassName, spinnerColorClassName[tone]].join(" ")}
        />
      ) : (
        <span aria-hidden="true" className={[dotBaseClassName, dotClassName[tone]].join(" ")} />
      )}
      {children}
    </span>
  );
}
