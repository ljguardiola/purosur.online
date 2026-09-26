import type { ReactNode } from "react";
import { Switch as AriaSwitch } from "react-aria-components";

export type ToggleProps = {
  isSelected: boolean;
  onChange: (isSelected: boolean) => void;
  children: Exclude<ReactNode, null | undefined | boolean>;
  disabled?: boolean;
};

const toggleLabelClassName =
  "group flex cursor-pointer items-center gap-3 outline-none " +
  "data-[disabled]:cursor-default data-[disabled]:opacity-[0.45]";

// justify-start/-end (not a translated knob) moves the knob without the track's own size
// depending on its position. rounded-[14px] pins the exact design px; Tailwind's rounded-full
// would compute an arbitrarily large radius instead of that fixed value.
const trackClassName =
  "inline-flex h-7 w-12 shrink-0 items-center justify-start rounded-[14px] p-1 outline-none " +
  "bg-surface-white shadow-[inset_0_0_0_2px_var(--color-ink-secondary)] " +
  "group-data-[hovered]:bg-surface-bone " +
  "group-data-[selected]:justify-end group-data-[selected]:bg-brand-green-ui group-data-[selected]:shadow-none " +
  "group-data-[hovered]:group-data-[selected]:bg-brand-green-strong " +
  "group-data-[focus-visible]:outline-[3px] group-data-[focus-visible]:outline-solid " +
  "group-data-[focus-visible]:outline-offset-3 group-data-[focus-visible]:outline-brand-blue-strong";

// A white knob is invisible on the white off-track without its own border; the green on-track
// already sets it apart, so the border drops there too. An inset box-shadow, not a real border,
// keeps the knob's size identical across both states.
const knobClassName =
  "size-[22px] shrink-0 rounded-full bg-surface-white " +
  "shadow-[inset_0_0_0_2px_var(--color-ink-secondary)] group-data-[selected]:shadow-none";

export function Toggle({ isSelected, onChange, children, disabled = false }: ToggleProps) {
  return (
    <AriaSwitch
      isSelected={isSelected}
      onChange={onChange}
      isDisabled={disabled}
      className={toggleLabelClassName}
    >
      <span aria-hidden="true" className={trackClassName}>
        <span className={knobClassName} />
      </span>
      <span className="min-w-0 flex-1">{children}</span>
    </AriaSwitch>
  );
}
