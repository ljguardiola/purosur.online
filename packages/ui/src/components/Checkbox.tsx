import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { Checkbox as AriaCheckbox } from "react-aria-components";

export type CheckboxProps = {
  isSelected: boolean;
  onChange: (isSelected: boolean) => void;
  children: Exclude<ReactNode, null | undefined | boolean>;
};

// `flex` (block-level), not `inline-flex`, so the label fills its container's width and the
// content wrapper's `flex-1` below has room to grow into, instead of hugging its intrinsic width.
const labelClassName = "group flex cursor-pointer items-center gap-3 outline-none";

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
  "group-data-focus-visible:focus-ring";

const checkIconClassName = "size-icon-sm text-text-inverse";

export function Checkbox({ isSelected, onChange, children }: CheckboxProps) {
  return (
    <AriaCheckbox isSelected={isSelected} onChange={onChange} className={labelClassName}>
      <span aria-hidden="true" className={boxClassName}>
        {isSelected && <Check className={checkIconClassName} />}
      </span>
      <span className="min-w-0 flex-1">{children}</span>
    </AriaCheckbox>
  );
}
