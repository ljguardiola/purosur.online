import { Button as AriaButton, Focusable as AriaFocusable } from "react-aria-components";
import { Keycap, type KeyName } from "../data-display/keycap";
import { Tooltip } from "../overlays/tooltip";
import { type Icon, iconSlotClassName } from "../shared/icon";

export type KeyTileProps = {
  label: string;
  icon: Icon;
  keyName: KeyName;
  onPress: () => void;
  disabled?: boolean;
  disabledReason?: string;
};

const shapeClassName =
  "flex h-19 w-full min-w-0 flex-col justify-between rounded-lg border border-border " +
  "p-3 text-left font-sans outline-none transition-background-text-border";

const className =
  `${shapeClassName} bg-surface data-hovered:bg-surface-subtle data-focus-visible:focus-ring ` +
  "data-disabled:bg-surface-subtle data-disabled:opacity-disabled";

// A disabled tile takes neither focus nor hover, so one that says why it is disabled stays
// focusable and is only announced disabled, which is what lets its tooltip open.
const withReasonClassName = `${shapeClassName} bg-surface-subtle opacity-disabled focus-visible:focus-ring`;

export function KeyTile({
  label,
  icon,
  keyName,
  onPress,
  disabled = false,
  disabledReason,
}: KeyTileProps) {
  const content = (
    <>
      <span className="flex w-full items-center justify-between">
        <span aria-hidden="true" className={`${iconSlotClassName.lg} text-text-accent`}>
          {icon}
        </span>
        <span aria-hidden="true" className="flex">
          <Keycap keyName={keyName} />
        </span>
      </span>
      <span className="truncate text-detail font-bold text-text">{label}</span>
    </>
  );

  if (disabledReason !== undefined) {
    return (
      <Tooltip description={disabledReason}>
        <AriaFocusable>
          <button type="button" aria-disabled="true" className={withReasonClassName}>
            {content}
          </button>
        </AriaFocusable>
      </Tooltip>
    );
  }

  return (
    <AriaButton onPress={onPress} isDisabled={disabled} className={className}>
      {content}
    </AriaButton>
  );
}
