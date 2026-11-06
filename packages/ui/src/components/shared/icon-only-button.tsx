import { type ReactNode, useRef } from "react";
import { useFocusable } from "react-aria";
import { Button as AriaButton, type ButtonProps as AriaButtonProps } from "react-aria-components";
import { Tooltip } from "../overlays/tooltip";

export type IconOnlyButtonProps = Pick<AriaButtonProps, "onPress" | "slot"> & {
  name: string;
  disabled?: boolean;
  className: string;
  children: ReactNode;
};

// A disabled button takes neither focus nor hover, so the tooltip listens on a wrapper outside the
// tab order: the name shows on hover and the button stays disabled.
function HoverTarget({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null);
  const { focusableProps } = useFocusable({ excludeFromTabOrder: true }, ref);
  return (
    <span ref={ref} {...focusableProps} className="inline-flex shrink-0">
      {children}
    </span>
  );
}

// The tooltip repeats the button's name, so it is not offered as the button's description too: a
// screen reader would read the same words twice. The name is the button's own, never one a
// surrounding field builds from its label, so what is shown and what is read stay the same text.
export function IconOnlyButton({
  name,
  disabled = false,
  className,
  children,
  ...buttonProps
}: IconOnlyButtonProps) {
  const button = (
    <AriaButton
      {...buttonProps}
      aria-label={name}
      aria-labelledby=""
      aria-describedby=""
      isDisabled={disabled}
      className={className}
    >
      {children}
    </AriaButton>
  );
  return (
    <Tooltip description={name}>
      {disabled ? (
        <HoverTarget>{button}</HoverTarget>
      ) : (
        button
      )}
    </Tooltip>
  );
}
