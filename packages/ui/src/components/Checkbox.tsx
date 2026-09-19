import { Check } from "lucide-react";
import type { ReactNode } from "react";
import {
  Checkbox as AriaCheckbox,
  type CheckboxProps as AriaCheckboxProps,
} from "react-aria-components";

// Required, so leaving out the content doesn't compile: without it, clicking the checkbox would
// have nothing to toggle it and assistive technology would have nothing to name it by.
export type CheckboxProps = Omit<AriaCheckboxProps, "className" | "children"> & {
  children: Exclude<ReactNode, null | undefined | boolean>;
};

const labelClassName = "group inline-flex cursor-pointer items-center gap-3 outline-none";

// A real border going from unchecked to checked would either add width (a wider border) or leave
// a visible gap (a border that just changes color while the design also drops it entirely), so
// the unchecked border is drawn with an inset box-shadow instead: it never participates in layout,
// and the checked state can drop it for a flat fill without the box ever resizing.
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

export function Checkbox({ children, ...props }: CheckboxProps) {
  return (
    <AriaCheckbox {...props} className={labelClassName}>
      {({ isSelected }) => (
        <>
          <span aria-hidden="true" className={boxClassName}>
            {isSelected && <Check className={checkIconClassName} />}
          </span>
          {children}
        </>
      )}
    </AriaCheckbox>
  );
}
