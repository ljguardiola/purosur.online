import { Radio as AriaRadio, RadioGroup as AriaRadioGroup } from "react-aria-components";
import { iconSlotClassName } from "../shared/icon";
import { ReservedWidthLabel } from "../shared/reserved-width-label";
import { isOptionValue, type NarrowedOption, type OptionChoiceProps } from "./option";

export type SegmentedControlSize = "large" | "medium";
export type SegmentedControlVariant = "outlined" | "field";

export type SegmentedControlProps<V extends string> = OptionChoiceProps<
  V,
  NarrowedOption<V, never, "icon">
> & {
  label: string;
  size?: SegmentedControlSize;
  variant?: SegmentedControlVariant;
  disabled?: boolean;
};

const containerClassName =
  "inline-flex flex-row items-stretch gap-1 rounded-lg border border-border p-1 data-disabled:opacity-disabled";

const fieldContainerClassName =
  "flex w-full flex-row items-stretch gap-1 rounded-lg bg-surface-soft p-1 data-disabled:opacity-disabled";

const containerSizeClassName: Record<SegmentedControlSize, string> = {
  large: "h-control-4xl",
  medium: "h-control-2xl",
};

const sizeClassName: Record<SegmentedControlSize, string> = {
  large: "gap-2",
  medium: "gap-1.5",
};

const iconWrapperClassName: Record<SegmentedControlSize, string> = {
  large: `${iconSlotClassName.md} text-text-subtle group-data-selected:text-text-accent`,
  medium: `${iconSlotClassName.sm} text-text-subtle group-data-selected:text-text-accent`,
};

const optionClassName =
  "group flex cursor-pointer items-center justify-center rounded-md px-4 outline-none " +
  "data-disabled:cursor-default " +
  "data-hovered:bg-surface-subtle " +
  "data-selected:bg-action-subtle " +
  "data-hovered:data-selected:bg-action-subtle " +
  "data-focus-visible:focus-ring";

const fieldOptionClassName =
  "group flex min-w-0 flex-1 cursor-pointer items-center justify-center rounded-md px-4 outline-none " +
  "data-disabled:cursor-default " +
  "data-selected:bg-surface " +
  "data-focus-visible:focus-ring";

function SegmentedOption<V extends string>({
  value,
  label,
  icon,
  size,
  variant,
}: NarrowedOption<V, never, "icon"> & {
  size: SegmentedControlSize;
  variant: SegmentedControlVariant;
}) {
  return (
    <AriaRadio
      value={value}
      aria-label={label}
      className={`${variant === "field" ? fieldOptionClassName : optionClassName} ${sizeClassName[size]}`}
    >
      {icon ? (
        <span aria-hidden="true" className={iconWrapperClassName[size]}>
          {icon}
        </span>
      ) : null}
      <ReservedWidthLabel label={label} />
    </AriaRadio>
  );
}

export function SegmentedControl<V extends string>({
  label,
  options,
  value,
  onChange,
  size = "medium",
  variant = "outlined",
  disabled = false,
}: SegmentedControlProps<V>) {
  const group = (
    <AriaRadioGroup
      aria-label={label}
      orientation="horizontal"
      value={value}
      isDisabled={disabled}
      onChange={(nextValue) => {
        if (isOptionValue(nextValue, options)) {
          onChange(nextValue);
        }
      }}
      className={
        variant === "field"
          ? `${fieldContainerClassName} ${containerSizeClassName[size]}`
          : `${containerClassName} ${containerSizeClassName[size]}`
      }
    >
      {options.map((option) => (
        <SegmentedOption key={option.value} {...option} size={size} variant={variant} />
      ))}
    </AriaRadioGroup>
  );
  if (variant === "outlined") {
    return group;
  }
  return (
    <div className="flex flex-col gap-2">
      <span aria-hidden="true" className="text-caption font-bold uppercase text-text-eyebrow">
        {label}
      </span>
      {group}
    </div>
  );
}
