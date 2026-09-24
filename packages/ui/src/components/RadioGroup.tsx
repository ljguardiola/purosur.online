import { Radio as AriaRadio, RadioGroup as AriaRadioGroup } from "react-aria-components";

export type RadioOption<V extends string = string> = {
  value: V;
  label: string;
};

// See OptionCardGroup.tsx's OptionCardGroupProps for the full rationale: a non-empty tuple for
// `options` plus `value`/`onChange` pinned to V (wrapped in NoInfer so only `options` can widen
// it) makes an empty group or an out-of-domain chosen value fail to compile, so "exactly one
// option is always chosen" never needs a runtime check.
export type RadioGroupProps<V extends string> = {
  label: string;
  options: readonly [RadioOption<V>, ...RadioOption<V>[]];
  value: NoInfer<V>;
  onChange: (value: NoInfer<V>) => void;
  disabled?: boolean;
};

const radioLabelClassName =
  "group flex cursor-pointer items-center gap-3 outline-none " +
  // A disabled option answers no pointer, so it drops the hand cursor that promises it would.
  "data-[disabled]:cursor-default data-[disabled]:opacity-[0.45]";

// Unlike Checkbox's box, the circle's fill stays white in both states, so an unchecked circle's
// own brand element is that white-to-bone fill, and hovering it darkens the fill exactly like
// Checkbox's unchecked box. A checked circle's brand element is instead the ring drawn under it,
// so — mirroring Checkbox's checked box (blue UI to blue strong) and Toggle's track (green UI to
// green strong) — hovering a checked circle darkens that ring from blue UI to blue strong. Both
// the border and the ring are drawn with an inset box-shadow instead of a real border, for the
// same reason as Checkbox.tsx's boxClassName: it never participates in layout, so growing from a
// 2px border to a 6px ring never resizes the circle.
const circleClassName =
  "size-5 shrink-0 rounded-full outline-none " +
  "bg-surface-white shadow-[inset_0_0_0_2px_var(--color-ink-secondary)] " +
  "group-data-[hovered]:bg-surface-bone " +
  "group-data-[selected]:shadow-[inset_0_0_0_6px_var(--color-brand-blue-ui)] " +
  // Two attribute selectors outrank the single-attribute hover and selected rules above
  // regardless of stylesheet order: the checked circle's fill stays white on hover (only its
  // ring darkens), and its ring wins over the resting blue UI one.
  "group-data-[hovered]:group-data-[selected]:bg-surface-white " +
  "group-data-[hovered]:group-data-[selected]:shadow-[inset_0_0_0_6px_var(--color-brand-blue-strong)] " +
  "group-data-[focus-visible]:outline-[3px] group-data-[focus-visible]:outline-solid " +
  "group-data-[focus-visible]:outline-offset-3 group-data-[focus-visible]:outline-brand-blue-strong";

function RadioGroupOption<V extends string>({ value, label }: RadioOption<V>) {
  return (
    <AriaRadio value={value} className={radioLabelClassName}>
      <span aria-hidden="true" className={circleClassName} />
      <span>{label}</span>
    </AriaRadio>
  );
}

export function RadioGroup<V extends string>({
  label,
  options,
  value,
  onChange,
  disabled = false,
}: RadioGroupProps<V>) {
  return (
    <AriaRadioGroup
      aria-label={label}
      value={value}
      isDisabled={disabled}
      // React Aria's own RadioGroupProps types onChange over plain string, but it only ever
      // calls this with a value it read off one of our own Radio elements, whose `value` is
      // always one of `options`' own V values, so this cast can't observe a value outside V.
      onChange={(nextValue) => onChange(nextValue as V)}
      className="flex flex-col gap-3"
    >
      {options.map((option) => (
        <RadioGroupOption key={option.value} {...option} />
      ))}
    </AriaRadioGroup>
  );
}
