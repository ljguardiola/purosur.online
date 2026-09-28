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
  "data-disabled:cursor-default data-disabled:opacity-disabled";

// The border and the ring are drawn with an inset box-shadow instead of a real border: it never
// participates in layout, so growing from a 2px border to a 6px ring never resizes the circle.
const circleClassName =
  "size-5 shrink-0 rounded-full outline-none " +
  "bg-surface inset-ring-2 inset-ring-border-strong " +
  "group-data-hovered:bg-surface-subtle " +
  "group-data-selected:inset-ring-6 group-data-selected:inset-ring-action " +
  "group-data-hovered:group-data-selected:bg-surface " +
  "group-data-hovered:group-data-selected:inset-ring-action-strong " +
  "group-data-focus-visible:focus-ring";

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
