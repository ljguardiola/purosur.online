import { useId } from "react";
import {
  Radio as AriaRadio,
  RadioGroup as AriaRadioGroup,
  Text as AriaText,
} from "react-aria-components";
import type { ButtonIcon } from "./button";

export type OptionCardIcon = ButtonIcon;

export type OptionCardOption<V extends string = string> = {
  value: V;
  icon: OptionCardIcon;
  title: string;
  helpText: string;
};

type OptionCardGroupValidityProps =
  | { invalid: true; errorMessage: string }
  | { invalid?: false; errorMessage?: undefined };

export type OptionCardGroupProps<V extends string> = OptionCardGroupValidityProps & {
  label: string;
  options: readonly [OptionCardOption<V>, ...OptionCardOption<V>[]];
  value: NoInfer<V> | null;
  onChange: (value: NoInfer<V>) => void;
  required?: boolean;
};

// Icon color reacts to the card's own data-selected state via the `group` class the card sets on itself.
const iconWrapperClassName =
  "inline-flex size-icon-lg shrink-0 text-text-subtle *:size-full " +
  "group-data-selected:text-text-accent";

const titleClassName = "text-body font-bold text-text group-data-selected:text-text-accent";

const helpTextClassName = "text-caption text-text-subtle";

const errorClassName = "text-detail text-error";

// The not-chosen/chosen ring is drawn with an inset box-shadow instead of a real border: a real
// border going from 1px to 2px on choosing a card would add 1px to its rendered size, but a
// box-shadow never participates in layout, so the ring can grow without shifting the card.
const cardClassName =
  "group flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-lg px-4 py-3 outline-none " +
  "bg-surface inset-ring-1 inset-ring-border " +
  "data-hovered:bg-surface-subtle " +
  "data-selected:bg-action-subtle data-selected:inset-ring-2 data-selected:inset-ring-action " +
  "data-hovered:data-selected:bg-action-subtle " +
  "data-focus-visible:focus-ring";

function OptionCard<V extends string>({ value, icon, title, helpText }: OptionCardOption<V>) {
  const helpTextId = useId();

  return (
    <AriaRadio
      value={value}
      aria-label={title}
      aria-describedby={helpTextId}
      className={cardClassName}
    >
      <span aria-hidden="true" className={iconWrapperClassName}>
        {icon}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className={titleClassName}>{title}</span>
        <span id={helpTextId} className={helpTextClassName}>
          {helpText}
        </span>
      </span>
    </AriaRadio>
  );
}

export function OptionCardGroup<V extends string>(props: OptionCardGroupProps<V>) {
  const { label, options, value, onChange, required = false } = props;
  const invalid = props.invalid ?? false;
  const errorMessage = props.invalid ? props.errorMessage : undefined;

  return (
    <AriaRadioGroup
      aria-label={label}
      orientation="horizontal"
      value={value}
      // react-aria's RadioGroupProps types onChange over plain string; it only ever fires with a
      // value read off one of our own Radio elements, always one of V.
      onChange={(nextValue) => onChange(nextValue as V)}
      isRequired={required}
      isInvalid={invalid}
      validationBehavior="aria"
      className="flex flex-col gap-1.5"
    >
      <div className="flex flex-row gap-3">
        {options.map((option) => (
          <OptionCard key={option.value} {...option} />
        ))}
      </div>
      {invalid ? (
        <AriaText slot="errorMessage" className={errorClassName}>
          {errorMessage}
        </AriaText>
      ) : null}
    </AriaRadioGroup>
  );
}
