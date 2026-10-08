import { Check } from "lucide-react";
import { type ReactNode, useId } from "react";
import { Checkbox as AriaCheckbox } from "react-aria-components";
import { fieldHelperClassName } from "./field-styles";

export type CheckboxProps = {
  name: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  children: Exclude<ReactNode, null | undefined | boolean>;
  disabled?: boolean;
  description?: string;
};

// `flex` (block-level), not `inline-flex`, so the label fills its container's width and the
// content wrapper's `flex-1` below has room to grow into, instead of hugging its intrinsic width.
const labelClassName =
  "group flex cursor-pointer items-center gap-3 outline-none data-disabled:cursor-default";

// Only the box and the content dim when disabled: the description often says why, so it stays
// legible.
const disabledClassName = "group-data-disabled:opacity-disabled";

// Drawn with an inset box-shadow rather than a real border, so the box never resizes going from
// unchecked to checked.
const boxClassName =
  "inline-flex size-control-2xs shrink-0 items-center justify-center rounded-sm outline-none " +
  "bg-surface inset-ring-2 inset-ring-border-strong " +
  "group-data-hovered:bg-surface-subtle " +
  "group-data-selected:bg-action group-data-selected:inset-ring-0 " +
  // Two attribute selectors outrank the single-attribute hover rule above regardless of
  // stylesheet order, guaranteeing the checked box's hover color wins over the unchecked one.
  "group-data-hovered:group-data-selected:bg-action-strong " +
  "group-data-focus-visible:focus-ring " +
  disabledClassName;

const checkIconClassName = "size-icon-sm text-text-inverse";

export function Checkbox({
  name,
  checked,
  onCheckedChange,
  children,
  disabled = false,
  description,
}: CheckboxProps) {
  const contentId = useId();
  const descriptionId = useId();

  // Named by its content alone, so the description, which sits inside the same label, is
  // announced as a description instead of as part of the name.
  return (
    <AriaCheckbox
      name={name}
      isSelected={checked}
      onChange={onCheckedChange}
      isDisabled={disabled}
      className={labelClassName}
      {...(description !== undefined
        ? { "aria-labelledby": contentId, "aria-describedby": descriptionId }
        : {})}
    >
      <span aria-hidden="true" className={boxClassName}>
        {checked ? <Check className={checkIconClassName} /> : null}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span id={contentId} className={disabledClassName}>
          {children}
        </span>
        {description !== undefined ? (
          <span id={descriptionId} className={fieldHelperClassName}>
            {description}
          </span>
        ) : null}
      </span>
    </AriaCheckbox>
  );
}
