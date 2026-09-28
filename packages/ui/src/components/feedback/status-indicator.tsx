import { Loader } from "lucide-react";
import type { ReactNode } from "react";
import { type Tone, toneClassName } from "../shared/tone";

export type StatusIndicatorProps = {
  tone: Tone;
  busy?: boolean;
  children: Exclude<ReactNode, null | undefined | boolean>;
};

const pillClassName =
  "inline-flex h-7 items-center gap-2 rounded-full px-3 font-sans text-detail font-semibold";

const spinnerBaseClassName = "size-icon-xs shrink-0 animate-spin motion-reduce:animate-none";
const dotBaseClassName = "size-2 shrink-0 rounded-full";

export function StatusIndicator({ tone, busy = false, children }: StatusIndicatorProps) {
  const className = [pillClassName, toneClassName[tone].surface].join(" ");

  return (
    <span className={className}>
      {busy ? (
        <Loader
          aria-hidden="true"
          className={[spinnerBaseClassName, toneClassName[tone].spinner].join(" ")}
        />
      ) : (
        <span
          aria-hidden="true"
          className={[dotBaseClassName, toneClassName[tone].dot].join(" ")}
        />
      )}
      {children}
    </span>
  );
}
