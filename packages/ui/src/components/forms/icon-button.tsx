import {
  Button as AriaButton,
  type ButtonProps as AriaButtonProps,
  Focusable as AriaFocusable,
} from "react-aria-components";
import { Tooltip } from "../overlays/tooltip";
import { type Icon, iconSlotClassName } from "../shared/icon";

type AccessibleName =
  | { "aria-label": string; "aria-labelledby"?: string }
  | { "aria-label"?: string; "aria-labelledby": string };

type IconButtonVariant = "bordered" | "subtle";

type Availability =
  | { disabled?: boolean; disabledReason?: undefined }
  | { disabled?: undefined; disabledReason: string };

export type IconButtonProps = Pick<AriaButtonProps, "onPress"> &
  AccessibleName &
  Availability & {
    icon: Icon;
    variant?: IconButtonVariant;
  };

const frameClassName = "inline-flex shrink-0 items-center justify-center outline-none";

const baseClassName = `${frameClassName} data-focus-visible:focus-ring data-disabled:opacity-disabled`;

// A disabled button takes neither focus nor hover, so one that says why it is disabled stays
// focusable and is only announced disabled, which is what lets its tooltip open.
const withReasonClassName = `${frameClassName} focus-visible:focus-ring opacity-disabled`;

const variantClassName: Record<IconButtonVariant, string> = {
  bordered:
    "size-control-md rounded-lg border border-border bg-surface text-text-accent " +
    "transition-background-border " +
    "data-hovered:bg-surface-subtle data-hovered:border-action-soft",
  subtle:
    "size-8 rounded-md text-text-subtle " +
    "transition-background-text-border " +
    "data-hovered:bg-surface-soft data-hovered:text-text-accent",
};

export function IconButton({
  icon,
  variant = "bordered",
  disabled = false,
  disabledReason,
  onPress,
  ...name
}: IconButtonProps) {
  if (disabledReason !== undefined) {
    return (
      <Tooltip description={disabledReason}>
        <AriaFocusable>
          <button
            type="button"
            aria-disabled="true"
            {...name}
            className={`${withReasonClassName} ${variantClassName[variant]}`}
          >
            <span className={iconSlotClassName.md}>{icon}</span>
          </button>
        </AriaFocusable>
      </Tooltip>
    );
  }
  return (
    <AriaButton
      {...name}
      {...(onPress === undefined ? {} : { onPress })}
      isDisabled={disabled}
      className={`${baseClassName} ${variantClassName[variant]}`}
    >
      <span className={iconSlotClassName.md}>{icon}</span>
    </AriaButton>
  );
}
