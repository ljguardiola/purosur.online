import { Button as AriaButton } from "react-aria-components";
import { Keycap, type KeyName } from "../data-display/keycap";
import { type Icon, iconSlotClassName } from "../shared/icon";

export type KeyTileProps = {
  label: string;
  icon: Icon;
  keyName: KeyName;
  onPress: () => void;
  disabled?: boolean;
};

export function KeyTile({ label, icon, keyName, onPress, disabled = false }: KeyTileProps) {
  return (
    <AriaButton
      onPress={onPress}
      isDisabled={disabled}
      className={
        "flex h-19 w-full min-w-0 flex-col justify-between rounded-lg border border-border " +
        "bg-surface p-3 text-left font-sans outline-none transition-background-text-border " +
        "data-hovered:bg-surface-subtle data-focus-visible:focus-ring " +
        "data-disabled:bg-surface-subtle data-disabled:opacity-disabled"
      }
    >
      <span className="flex w-full items-center justify-between">
        <span aria-hidden="true" className={`${iconSlotClassName.lg} text-text-accent`}>
          {icon}
        </span>
        <span aria-hidden="true" className="flex">
          <Keycap keyName={keyName} />
        </span>
      </span>
      <span className="truncate text-detail font-bold text-text">{label}</span>
    </AriaButton>
  );
}
