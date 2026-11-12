import { Button as AriaButton } from "react-aria-components";
import { Keycap, type KeyName } from "../data-display/keycap";
import { type Icon, iconSlotClassName } from "../shared/icon";

export type KeyOptionCardProps = {
  label: string;
  icon: Icon;
  keyName: KeyName;
  onPress: () => void;
  disabled?: boolean;
};

export function KeyOptionCard({
  label,
  icon,
  keyName,
  onPress,
  disabled = false,
}: KeyOptionCardProps) {
  return (
    <AriaButton
      onPress={onPress}
      isDisabled={disabled}
      className={
        "flex h-17 w-full min-w-0 items-center gap-4 rounded-lg border border-border " +
        "bg-surface px-4 text-left font-sans outline-none transition-background-text-border " +
        "data-hovered:bg-surface-subtle data-focus-visible:focus-ring " +
        "data-disabled:bg-surface-subtle data-disabled:opacity-disabled"
      }
    >
      <span
        aria-hidden="true"
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-soft text-text"
      >
        <span className={iconSlotClassName.lg}>{icon}</span>
      </span>
      <span className="min-w-0 flex-1 truncate text-subheading font-bold text-text">{label}</span>
      <span aria-hidden="true" className="flex">
        <Keycap keyName={keyName} />
      </span>
    </AriaButton>
  );
}
