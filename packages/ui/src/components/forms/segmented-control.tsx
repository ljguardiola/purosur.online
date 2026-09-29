import { Radio as AriaRadio, RadioGroup as AriaRadioGroup } from "react-aria-components";
import { iconSlotClassName } from "../shared/icon";
import { isOptionValue, type NarrowedOption, type OptionChoiceProps } from "./option";

export type SegmentedControlSize = "large" | "medium";

export type SegmentedControlProps<V extends string> = OptionChoiceProps<
  V,
  NarrowedOption<V, never, "icon">
> & {
  label: string;
  size?: SegmentedControlSize;
};

const containerClassName =
  "inline-flex flex-row items-stretch gap-1 rounded-lg border border-border p-1";

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
  "data-hovered:bg-surface-subtle " +
  "data-selected:bg-action-subtle " +
  "data-hovered:data-selected:bg-action-subtle " +
  "data-focus-visible:focus-ring";

// The label going regular -> bold on choosing an option would otherwise widen that option (and so
// the whole control), since bold text measures wider than regular text at the same size. A hidden
// bold copy stacked in the same grid cell (via `col-start-1 row-start-1`) always reserves the
// bolder, wider width, so the grid cell's own width never changes when the visible copy's weight
// does. `invisible` keeps it out of the paint but not out of layout, and `aria-hidden` keeps it
// out of the accessibility tree so it isn't announced alongside the real, visible label.
function ReservedWidthLabel({ label }: { label: string }) {
  return (
    <span className="relative grid">
      <span
        aria-hidden="true"
        className="invisible col-start-1 row-start-1 whitespace-nowrap text-body font-bold"
      >
        {label}
      </span>
      <span className="col-start-1 row-start-1 whitespace-nowrap text-body text-text group-data-selected:font-bold group-data-selected:text-text-accent">
        {label}
      </span>
    </span>
  );
}

function SegmentedOption<V extends string>({
  value,
  label,
  icon,
  size,
}: NarrowedOption<V, never, "icon"> & { size: SegmentedControlSize }) {
  return (
    <AriaRadio
      value={value}
      aria-label={label}
      className={`${optionClassName} ${sizeClassName[size]}`}
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
}: SegmentedControlProps<V>) {
  return (
    <AriaRadioGroup
      aria-label={label}
      orientation="horizontal"
      value={value}
      onChange={(nextValue) => {
        if (isOptionValue(nextValue, options)) {
          onChange(nextValue);
        }
      }}
      className={`${containerClassName} ${containerSizeClassName[size]}`}
    >
      {options.map((option) => (
        <SegmentedOption key={option.value} {...option} size={size} />
      ))}
    </AriaRadioGroup>
  );
}
