import { Button as AriaButton } from "react-aria-components";
import { toneClassName } from "../shared/tone";
import {
  StatusIndicatorContent,
  type StatusIndicatorProps,
  statusIndicatorClassName,
} from "./status-indicator";

export type StatusIndicatorButtonProps = Omit<StatusIndicatorProps, "busy">;

export function StatusIndicatorButton({ tone, children }: StatusIndicatorButtonProps) {
  const className = [
    statusIndicatorClassName,
    toneClassName[tone].surface,
    "cursor-pointer outline-none data-focus-visible:focus-ring-tight",
  ].join(" ");

  return (
    <AriaButton className={className}>
      <StatusIndicatorContent tone={tone}>{children}</StatusIndicatorContent>
    </AriaButton>
  );
}
