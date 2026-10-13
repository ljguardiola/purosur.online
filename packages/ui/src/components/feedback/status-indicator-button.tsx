import { Button as AriaButton } from "react-aria-components";
import { toneClassName } from "../shared/tone";
import {
  StatusIndicatorContent,
  type StatusIndicatorProps,
  statusIndicatorClassName,
} from "./status-indicator";

export type StatusIndicatorButtonProps = Omit<StatusIndicatorProps, "busy"> & {
  onPress?: () => void;
};

export function StatusIndicatorButton({ tone, children, onPress }: StatusIndicatorButtonProps) {
  const className = [
    statusIndicatorClassName,
    toneClassName[tone].surface,
    "cursor-pointer outline-none data-focus-visible:focus-ring-tight",
  ].join(" ");

  return (
    <AriaButton className={className} {...(onPress ? { onPress } : {})}>
      <StatusIndicatorContent tone={tone}>{children}</StatusIndicatorContent>
    </AriaButton>
  );
}
