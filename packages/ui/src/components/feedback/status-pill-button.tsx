import { Button as AriaButton } from "react-aria-components";
import { type StatusPillContent, statusPillClassName } from "./status-pill-look";

export type StatusPillButtonProps = StatusPillContent;

const hoverRingClassName = {
  neutral: "data-hovered:ring-1 data-hovered:ring-neutral",
  warning: "data-hovered:ring-1 data-hovered:ring-warning-soft",
  error: "data-hovered:ring-1 data-hovered:ring-error-soft",
} as const;

export function StatusPillButton({ tone, children }: StatusPillButtonProps) {
  return (
    <AriaButton
      className={`${statusPillClassName(tone)} ${hoverRingClassName[tone]} outline-none data-focus-visible:focus-ring-tight`}
    >
      {children}
    </AriaButton>
  );
}
