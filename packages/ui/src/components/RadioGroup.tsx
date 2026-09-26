import { Radio as AriaRadio, RadioGroup as AriaRadioGroup } from "react-aria-components";

export type RadioOption<V extends string = string> = {
  value: V;
  label: string;
};

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

// The border and the ring are drawn with an inset box-shadow instead of a real border: it never
// participates in layout, so growing from a 2px border to a 6px ring never resizes the circle.
const circleClassName =
  "size-5 shrink-0 rounded-full outline-none " +
  "bg-surface-white shadow-[inset_0_0_0_2px_var(--color-ink-secondary)] " +
  "group-data-[hovered]:bg-surface-bone " +
  "group-data-[selected]:shadow-[inset_0_0_0_6px_var(--color-brand-blue-ui)] " +
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
      // react-aria's RadioGroupProps types onChange over plain string; it only ever fires with a
      // value read off one of our own Radio elements, always one of V.
      onChange={(nextValue) => onChange(nextValue as V)}
      className="flex flex-col gap-3"
    >
      {options.map((option) => (
        <RadioGroupOption key={option.value} {...option} />
      ))}
    </AriaRadioGroup>
  );
}
