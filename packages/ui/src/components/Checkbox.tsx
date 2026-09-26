import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { Checkbox as AriaCheckbox } from "react-aria-components";

// `children` stays required, so leaving out the content doesn't compile: without it, clicking the
// checkbox would have nothing to toggle it and assistive technology would have nothing to name it by.
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
  "inline-flex size-[22px] shrink-0 items-center justify-center rounded-sm outline-none " +
  "bg-surface-white shadow-[inset_0_0_0_2px_var(--color-ink-secondary)] " +
  "group-data-[hovered]:bg-surface-bone " +
  "group-data-[selected]:bg-brand-blue-ui group-data-[selected]:shadow-none " +
  // Two attribute selectors outrank the single-attribute hover rule above regardless of
  // stylesheet order, guaranteeing the checked box's hover color wins over the unchecked one.
  "group-data-[hovered]:group-data-[selected]:bg-brand-blue-strong " +
  "group-data-[focus-visible]:outline-[3px] group-data-[focus-visible]:outline-solid " +
  "group-data-[focus-visible]:outline-offset-3 group-data-[focus-visible]:outline-brand-blue-strong";

const checkIconClassName = "size-4 text-surface-white";

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
