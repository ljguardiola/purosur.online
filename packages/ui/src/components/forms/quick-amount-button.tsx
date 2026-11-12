import { ToggleButton } from "react-aria-components";
import { Keycap, type KeyName } from "../data-display/keycap";

export type QuickAmountButtonProps = {
  amount: string;
  label?: string | undefined;
  keyName?: KeyName | undefined;
  selected?: boolean;
  onPress: () => void;
  disabled?: boolean;
};

export function QuickAmountButton({
  amount,
  label,
  keyName,
  selected = false,
  onPress,
  disabled = false,
}: QuickAmountButtonProps) {
  return (
    <ToggleButton
      isSelected={selected}
      onChange={onPress}
      isDisabled={disabled}
      className={
        `flex h-15 w-full min-w-0 items-center gap-2 rounded-lg border border-border bg-surface px-3 ` +
        `${keyName === undefined ? "justify-end" : "justify-between"} font-sans outline-none ` +
        "transition-background-text-border data-hovered:bg-surface-subtle " +
        "data-selected:border-action data-selected:bg-action-subtle " +
        "data-focus-visible:focus-ring data-disabled:opacity-disabled"
      }
    >
      <span className="flex min-w-0 flex-col items-end">
        {label === undefined ? null : (
          <span className="text-caption font-bold uppercase text-text-eyebrow">{label}</span>
        )}
        <span className="truncate text-subheading font-bold text-text">{amount}</span>
      </span>
      {keyName === undefined ? null : (
        <span aria-hidden="true" className="flex">
          <Keycap keyName={keyName} />
        </span>
      )}
    </ToggleButton>
  );
}
