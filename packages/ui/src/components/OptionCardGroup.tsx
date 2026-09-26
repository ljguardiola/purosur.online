import { useId } from "react";
import {
  Radio as AriaRadio,
  RadioGroup as AriaRadioGroup,
  Text as AriaText,
} from "react-aria-components";
import type { ButtonIcon } from "./Button";

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

// `value`/`onChange` wrap V in NoInfer so a call site's own `value` can never contribute a
// candidate to V's inference (only `options` can); without it, an out-of-domain `value` at a real
// call site would silently widen V to include it instead of failing to compile.
export type OptionCardGroupProps<V extends string> = OptionCardGroupValidityProps & {
  label: string;
  options: readonly [OptionCardOption<V>, ...OptionCardOption<V>[]];
  value: NoInfer<V> | null;
  onChange: (value: NoInfer<V>) => void;
  required?: boolean;
};

// The icon's size is fixed by this span's CSS, not by cloning a `size` prop — only lucide icons
// interpret one. Its color reacts to the card's own data-selected state via the `group` class the
// card sets on itself.
const iconWrapperClassName =
  "inline-flex size-5 shrink-0 text-ink-secondary [&>svg]:h-full [&>svg]:w-full " +
  "group-data-[selected]:text-brand-blue-strong";

const titleClassName = "text-base font-bold text-ink group-data-[selected]:text-brand-blue-strong";

const helpTextClassName = "text-xs font-normal text-ink-secondary";

const errorClassName = "text-sm font-normal text-status-error-ui";

// The not-chosen/chosen ring is drawn with an inset box-shadow instead of a real border: a real
// border going from 1px to 2px on choosing a card would add 1px to its rendered size, but a
// box-shadow never participates in layout, so the ring can grow without shifting the card.
const cardClassName =
  "group flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-lg px-4 py-3 outline-none " +
  "bg-surface-white shadow-[inset_0_0_0_1px_var(--color-line)] " +
  "data-[hovered]:bg-surface-bone " +
  "data-[selected]:bg-brand-blue-message-bg data-[selected]:shadow-[inset_0_0_0_2px_var(--color-brand-blue-ui)] " +
  // Two attribute selectors outrank the single-attribute hover rule above regardless of
  // stylesheet order, guaranteeing the chosen card's background never changes on hover.
  "data-[hovered]:data-[selected]:bg-brand-blue-message-bg " +
  "data-[focus-visible]:outline-[3px] data-[focus-visible]:outline-solid " +
  "data-[focus-visible]:outline-offset-3 data-[focus-visible]:outline-brand-blue-strong";

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
      // React Aria's own RadioGroupProps types onChange over plain string, but it only ever
      // calls this with a value it read off one of our own Radio elements, whose `value` is
      // always one of `options`' own V values, so this cast can't observe a value outside V.
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
      {invalid && (
        <AriaText slot="errorMessage" className={errorClassName}>
          {errorMessage}
        </AriaText>
      )}
    </AriaRadioGroup>
  );
}
