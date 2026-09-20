import type { ReactNode } from "react";
import { Switch as AriaSwitch } from "react-aria-components";

// Controlled and minimal, mirroring Checkbox.tsx's own CheckboxProps: `children` stays required,
// so leaving out the content doesn't compile, and both `isSelected` and `onChange` are always
// required rather than left to an uncontrolled default. Unlike Checkbox, this control's DoD asks
// for a disabled treatment, so `disabled` is part of the type here; the design doesn't draw that
// state, so the 45% opacity below comes from the package's own convention, not from the design.
export type ToggleProps = {
  isSelected: boolean;
  onChange: (isSelected: boolean) => void;
  children: Exclude<ReactNode, null | undefined | boolean>;
  disabled?: boolean;
};

const toggleLabelClassName =
  "group flex cursor-pointer items-center gap-3 outline-none " +
  // A disabled toggle answers no pointer, so it drops the hand cursor that promises it would.
  "data-[disabled]:cursor-default data-[disabled]:opacity-[0.45]";

// The track is a flex row, not a positioned box with a translated knob: which end the knob sits
// at is set by pushing the row's own content to its start or its end (justify-start/-end), so
// the track's own size never depends on the knob's position. `rounded-[14px]` is used instead of
// `rounded-full` so the radius stays the exact px the design specifies (half of the 28px track)
// rather than an arbitrarily large value that happens to render the same pill shape.
//
// Off and on swap both the fill and the border the same way Checkbox's own box does between its
// unchecked and checked states (see Checkbox.tsx's boxClassName), so — unlike RadioGroup.tsx's
// circle, whose fill stays constant across states — hovering follows Checkbox's rule instead:
// off darkens to bone, on darkens to the next-stronger green.
const trackClassName =
  "inline-flex h-7 w-12 shrink-0 items-center justify-start rounded-[14px] p-1 outline-none " +
  "bg-surface-white shadow-[inset_0_0_0_2px_var(--color-ink-secondary)] " +
  "group-data-[hovered]:bg-surface-bone " +
  "group-data-[selected]:justify-end group-data-[selected]:bg-brand-green-ui group-data-[selected]:shadow-none " +
  // Two attribute selectors outrank the single-attribute hover rule above regardless of
  // stylesheet order, guaranteeing the on track's hover color wins over the off one.
  "group-data-[hovered]:group-data-[selected]:bg-brand-green-strong " +
  "group-data-[focus-visible]:outline-[3px] group-data-[focus-visible]:outline-solid " +
  "group-data-[focus-visible]:outline-offset-3 group-data-[focus-visible]:outline-brand-blue-strong";

// Off, the knob is white on a white track, so the only thing that makes it visible at all is a
// boundary of its own: it carries the same 2px border the off track does. On, the green track
// already sets the white knob apart, so the knob drops that border just as the track drops its
// own. It's an inset box-shadow for the same reason as the track's and Checkbox.tsx's box's: it
// never participates in layout, so the knob's size stays identical across both states.
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
