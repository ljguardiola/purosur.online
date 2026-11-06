import { type ComponentProps, type ReactNode, useRef } from "react";
import { useTooltipTrigger } from "react-aria";
import {
  Button as AriaButton,
  ButtonContext as AriaButtonContext,
  type ButtonProps as AriaButtonProps,
  Focusable as AriaFocusable,
  TooltipContext as AriaTooltipContext,
  TooltipTriggerStateContext as AriaTooltipTriggerStateContext,
  useSlottedContext,
} from "react-aria-components";
import { useTooltipTriggerState } from "react-stately";
import { CLOSE_DELAY_MS, HOVER_DELAY_MS, TooltipBubble } from "../overlays/tooltip";

export type IconOnlyButtonProps = Pick<
  AriaButtonProps,
  "onPress" | "slot" | "excludeFromTabOrder"
> & {
  name: string;
  disabled?: boolean;
  className: string;
  wrapperClassName?: string;
  children: ReactNode;
};

// The tooltip repeats the button's name, so it does not describe its trigger as well: a screen
// reader would read the same words twice. Hover is heard on the wrapper, which a disabled button
// cannot take itself; focus is heard on the button, which Focusable hands the hook's handlers.
function NameTooltip({
  name,
  className,
  disabled,
  excludeFromTabOrder,
  children,
}: {
  name: string;
  className: string;
  disabled: boolean;
  excludeFromTabOrder: boolean | undefined;
  children: ComponentProps<typeof AriaFocusable>["children"];
}) {
  const state = useTooltipTriggerState({ delay: HOVER_DELAY_MS, closeDelay: CLOSE_DELAY_MS });
  const ref = useRef<HTMLSpanElement>(null);
  const { triggerProps, tooltipProps } = useTooltipTrigger({}, state, ref);
  const { "aria-describedby": _describesTrigger, onFocus, onBlur, ...hoverAndPress } = triggerProps;
  return (
    <AriaTooltipTriggerStateContext value={state}>
      <AriaTooltipContext
        value={{
          ...(tooltipProps.id === undefined ? {} : { id: tooltipProps.id }),
          triggerRef: ref,
        }}
      >
        <span ref={ref} {...hoverAndPress} className={className}>
          <AriaFocusable
            isDisabled={disabled}
            {...(excludeFromTabOrder === undefined ? {} : { excludeFromTabOrder })}
            {...(onFocus === undefined ? {} : { onFocus })}
            {...(onBlur === undefined ? {} : { onBlur })}
          >
            {children}
          </AriaFocusable>
        </span>
        <TooltipBubble description={name} />
      </AriaTooltipContext>
    </AriaTooltipTriggerStateContext>
  );
}

// A field that holds the button passes it a name built from the field's label; the button is named
// by its own text, which is also the tooltip's.
function OwnNameOnly({ slot, children }: { slot: string | null | undefined; children: ReactNode }) {
  const fieldContext = useSlottedContext(AriaButtonContext, slot);
  const { "aria-labelledby": _fieldLabel, ...ownContext } = fieldContext ?? {};
  return <AriaButtonContext value={ownContext}>{children}</AriaButtonContext>;
}

export function IconOnlyButton({
  name,
  disabled = false,
  className,
  wrapperClassName = "flex shrink-0",
  children,
  ...buttonProps
}: IconOnlyButtonProps) {
  return (
    <OwnNameOnly slot={buttonProps.slot}>
      <NameTooltip
        name={name}
        className={wrapperClassName}
        disabled={disabled}
        excludeFromTabOrder={buttonProps.excludeFromTabOrder}
      >
        <AriaButton {...buttonProps} aria-label={name} isDisabled={disabled} className={className}>
          {children}
        </AriaButton>
      </NameTooltip>
    </OwnNameOnly>
  );
}
