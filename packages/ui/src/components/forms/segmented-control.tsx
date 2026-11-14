import { Radio as AriaRadio, RadioGroup as AriaRadioGroup } from "react-aria-components";
import { Tag } from "../data-display/tag";
import { iconSlotClassName } from "../shared/icon";
import { ReservedWidthLabel } from "../shared/reserved-width-label";
import { isOptionValue, type NarrowedOption, type OptionChoiceProps } from "./option";

export type SegmentedControlSize = "large" | "medium";
type SegmentedControlVariant = "outlined" | "field";

export type SegmentedControlProps<V extends string> = OptionChoiceProps<
  V,
  NarrowedOption<V, never, "icon" | "status">
> & {
  label: string;
  size?: SegmentedControlSize;
  variant?: SegmentedControlVariant;
  fullWidth?: boolean;
  disabled?: boolean;
};

const containerClassName =
  "flex flex-row items-stretch gap-1 rounded-lg border border-border p-1 data-disabled:opacity-disabled";

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

const optionPaddingClassName = {
  content: "px-4",
  fullWidth: "min-w-0 flex-1 basis-0 px-2",
};

const optionClassName =
  "group flex cursor-pointer items-center justify-center rounded-md outline-none " +
  "data-disabled:cursor-default " +
  "data-hovered:bg-surface-subtle " +
  "data-selected:bg-action-subtle " +
  "data-hovered:data-selected:bg-action-subtle " +
  "data-focus-visible:focus-ring";

const fieldOptionClassName =
  "group flex cursor-pointer items-center justify-center rounded-md outline-none " +
  "data-disabled:cursor-default " +
  "data-selected:bg-surface " +
  "data-focus-visible:focus-ring";

function SegmentedOption<V extends string>({
  value,
  label,
  icon,
  status,
  size,
  variant,
  fullWidth,
}: NarrowedOption<V, never, "icon" | "status"> & {
  size: SegmentedControlSize;
  variant: SegmentedControlVariant;
  fullWidth: boolean;
}) {
  return (
    <AriaRadio
      value={value}
      aria-label={status === undefined ? label : `${label}, ${status}`}
      className={`${variant === "field" ? fieldOptionClassName : optionClassName} ${sizeClassName[size]} ${optionPaddingClassName[fullWidth || variant === "field" ? "fullWidth" : "content"]}`}
    >
      {icon ? (
        <span aria-hidden="true" className={iconWrapperClassName[size]}>
          {icon}
        </span>
      ) : null}
      {status === undefined ? (
        <ReservedWidthLabel label={label} />
      ) : (
        <span className="flex flex-col items-center">
          <ReservedWidthLabel label={label} />
          <Tag tone="neutral" variant="status">
            {status}
          </Tag>
        </span>
      )}
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
  fullWidth = false,
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
          : `${containerClassName} ${fullWidth ? "w-full" : "w-fit"} ${containerSizeClassName[size]}`
      }
    >
      {options.map((option) => (
        <SegmentedOption
          key={option.value}
          {...option}
          size={size}
          variant={variant}
          fullWidth={fullWidth}
        />
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
