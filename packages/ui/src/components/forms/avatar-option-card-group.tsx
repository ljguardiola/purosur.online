import { Check } from "lucide-react";
import { Radio as AriaRadio, RadioGroup as AriaRadioGroup } from "react-aria-components";
import { isOptionValue, type NarrowedOption, type Options } from "./option";

export type AvatarOptionCardGroupProps<V extends string> = {
  labelledBy: string;
  options: Options<NarrowedOption<V>>;
  value: V | null;
  onChange: (value: V) => void;
  disabled?: boolean | undefined;
};

const cardClassName =
  "flex h-15 cursor-pointer items-center gap-3 rounded-lg bg-surface p-3 outline-none inset-ring-1 inset-ring-border " +
  "data-hovered:bg-surface-subtle " +
  "data-selected:bg-action-subtle data-selected:inset-ring-2 data-selected:inset-ring-action " +
  "data-focus-visible:focus-ring " +
  "data-disabled:cursor-default data-disabled:opacity-disabled";

function initialOf(label: string): string {
  return (Array.from(label)[0] ?? "").toLocaleUpperCase("es-AR");
}

export function AvatarOptionCardGroup<V extends string>({
  labelledBy,
  options,
  value,
  onChange,
  disabled = false,
}: AvatarOptionCardGroupProps<V>) {
  return (
    <AriaRadioGroup
      aria-labelledby={labelledBy}
      orientation="vertical"
      value={value}
      isDisabled={disabled}
      onChange={(nextValue) => {
        if (isOptionValue(nextValue, options)) {
          onChange(nextValue);
        }
      }}
      className="flex flex-col gap-2"
    >
      {options.map((option) => (
        <AriaRadio
          key={option.value}
          value={option.value}
          aria-label={option.label}
          className={cardClassName}
        >
          {({ isSelected }) => (
            <>
              <span
                aria-hidden="true"
                className="flex size-9 shrink-0 items-center justify-center rounded-full bg-action-soft text-body font-bold text-text-accent"
              >
                {initialOf(option.label)}
              </span>
              <span className="min-w-0 flex-1 truncate text-body text-text">{option.label}</span>
              {isSelected ? (
                <span
                  aria-hidden="true"
                  className="inline-flex size-icon-lg shrink-0 text-text-accent"
                >
                  <Check className="size-full" />
                </span>
              ) : null}
            </>
          )}
        </AriaRadio>
      ))}
    </AriaRadioGroup>
  );
}
