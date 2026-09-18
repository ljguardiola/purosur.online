import { Loader } from "lucide-react";
import type { ReactNode } from "react";

export type StatusIndicatorTone = "success" | "warning" | "error" | "info" | "neutral";

export type StatusIndicatorProps = {
  tone: StatusIndicatorTone;
  // Replaces the dot with a spinner while the state it names is still settling (e.g. a scale).
  busy?: boolean;
  // Required, so leaving out the text doesn't compile: the dot/spinner only reinforce the state,
  // they never carry it alone.
  children: Exclude<ReactNode, null | undefined | boolean>;
};

const pillClassName =
  "inline-flex h-[1.75rem] items-center gap-2 rounded-[0.875rem] px-3 font-sans text-sm font-semibold";

const toneClassName: Record<StatusIndicatorTone, string> = {
  success: "bg-brand-green-message-bg text-brand-green-strong",
  warning: "bg-status-warning-message-bg text-status-warning-strong",
  error: "bg-status-error-message-bg text-status-error-strong",
  info: "bg-brand-blue-message-bg text-brand-blue-strong",
  neutral: "bg-surface-sand text-ink-secondary",
};

const dotClassName: Record<StatusIndicatorTone, string> = {
  success: "bg-brand-green",
  warning: "bg-status-warning-accent",
  error: "bg-status-error-accent",
  info: "bg-brand-blue",
  neutral: "bg-ink-secondary",
};

const spinnerColorClassName: Record<StatusIndicatorTone, string> = {
  success: "text-brand-green",
  warning: "text-status-warning-accent",
  error: "text-status-error-accent",
  info: "text-brand-blue",
  neutral: "text-ink-secondary",
};

// motion-reduce:animate-none overrides Tailwind's own animate-spin, so the spinner stays still
// for anyone who asked their system for less motion.
const spinnerBaseClassName = "size-[0.875rem] shrink-0 animate-spin motion-reduce:animate-none";
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
