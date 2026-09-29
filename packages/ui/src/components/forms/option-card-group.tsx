import { useId } from "react";
import {
  Radio as AriaRadio,
  RadioGroup as AriaRadioGroup,
  Text as AriaText,
} from "react-aria-components";
import { iconSlotClassName } from "../shared/icon";
import { type FieldErrorProps, fieldError } from "./field-error";
import { fieldErrorClassName } from "./field-styles";
import { isOptionValue, type NarrowedOption, type OptionalOptionChoiceProps } from "./option";

type OptionCard<V extends string> = NarrowedOption<V, "description" | "icon">;

// A row gives each card an icon and help text; a grid holds more, shorter choices, three to a row,
// each named by its title alone.
type OptionCardLayoutProps<V extends string> =
  | ({ layout?: "row" } & OptionalOptionChoiceProps<V, OptionCard<V>>)
  | ({ layout: "grid" } & OptionalOptionChoiceProps<V, NarrowedOption<V>>);

export type OptionCardGroupProps<V extends string> = FieldErrorProps &
  OptionCardLayoutProps<V> & {
    label: string;
    required?: boolean;
  };

// Icon color reacts to the card's own data-selected state via the `group` class the card sets on itself.
const iconWrapperClassName = `${iconSlotClassName.lg} text-text-subtle group-data-selected:text-text-accent`;

const labelClassName = "text-body font-bold text-text group-data-selected:text-text-accent";

const descriptionClassName = "text-caption text-text-subtle";

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

function TitleOnlyCardItem<V extends string>({ value, label }: NarrowedOption<V>) {
  return (
    <AriaRadio value={value} aria-label={label} className={cardClassName}>
      <span className={labelClassName}>{label}</span>
    </AriaRadio>
  );
}

function OptionCardItem<V extends string>({ value, icon, label, description }: OptionCard<V>) {
  const descriptionId = useId();

  return (
    <AriaRadio
      value={value}
      aria-label={label}
      aria-describedby={descriptionId}
      className={cardClassName}
    >
      <span aria-hidden="true" className={iconWrapperClassName}>
        {icon}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className={labelClassName}>{label}</span>
        <span id={descriptionId} className={descriptionClassName}>
          {description}
        </span>
      </span>
    </AriaRadio>
  );
}

export function OptionCardGroup<V extends string>(props: OptionCardGroupProps<V>) {
  const { label, value, onChange, required = false } = props;
  const { invalid, errorMessage, errorMessageId } = fieldError(props);

  return (
    <AriaRadioGroup
      aria-label={label}
      orientation="horizontal"
      value={value}
      onChange={(nextValue) => {
        if (isOptionValue(nextValue, props.options)) {
          onChange(nextValue);
        }
      }}
      isRequired={required}
      isInvalid={invalid}
      {...(errorMessageId !== undefined ? { "aria-describedby": errorMessageId } : {})}
      validationBehavior="aria"
      className="flex flex-col gap-1.5"
    >
      {props.layout === "grid" ? (
        <div className="grid grid-cols-3 gap-3">
          {props.options.map((option) => (
            <TitleOnlyCardItem key={option.value} {...option} />
          ))}
        </div>
      ) : (
        <div className="flex flex-row gap-3">
          {props.options.map((option) => (
            <OptionCardItem key={option.value} {...option} />
          ))}
        </div>
      )}
      {errorMessage !== undefined ? (
        <AriaText slot="errorMessage" className={fieldErrorClassName}>
          {errorMessage}
        </AriaText>
      ) : null}
    </AriaRadioGroup>
  );
}
