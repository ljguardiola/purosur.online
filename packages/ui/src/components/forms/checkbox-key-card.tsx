import { Check } from "lucide-react";
import { Checkbox as AriaCheckbox } from "react-aria-components";
import { Keycap, type KeyName } from "../data-display/keycap";
import { checkboxBoxClassName, checkboxCheckIconClassName } from "./checkbox";

export type CheckboxKeyCardProps = {
  name: string;
  label: string;
  keyName: KeyName;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
};

const cardClassName =
  "group flex min-h-17 w-full cursor-pointer items-center gap-3 rounded-lg border border-border " +
  "bg-surface px-4 outline-none data-hovered:bg-surface-subtle data-disabled:cursor-default " +
  "data-disabled:opacity-disabled";

export function CheckboxKeyCard({
  name,
  label,
  keyName,
  checked,
  onCheckedChange,
  disabled = false,
}: CheckboxKeyCardProps) {
  return (
    <AriaCheckbox
      name={name}
      isSelected={checked}
      onChange={onCheckedChange}
      isDisabled={disabled}
      className={cardClassName}
    >
      <span aria-hidden="true" className={checkboxBoxClassName}>
        {checked ? <Check className={checkboxCheckIconClassName} /> : null}
      </span>
      <span className="min-w-0 flex-1 truncate text-body font-bold text-text">{label}</span>
      <span aria-hidden="true" className="flex">
        <Keycap keyName={keyName} />
      </span>
    </AriaCheckbox>
  );
}
