import { Radio as AriaRadio, RadioGroup as AriaRadioGroup } from "react-aria-components";
import type { ButtonIcon } from "./button";

export type SegmentedControlIcon = ButtonIcon;
export type SegmentedControlSize = "large" | "medium";

export type SegmentedControlOption<V extends string = string> = {
  value: V;
  label: string;
  icon?: SegmentedControlIcon;
};

export type SegmentedControlProps<V extends string> = {
  label: string;
  options: readonly [SegmentedControlOption<V>, ...SegmentedControlOption<V>[]];
  value: NoInfer<V>;
  onChange: (value: NoInfer<V>) => void;
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
  large:
    "inline-flex size-icon-md shrink-0 text-text-subtle *:size-full " +
    "group-data-selected:text-text-accent",
  medium:
    "inline-flex size-icon-sm shrink-0 text-text-subtle *:size-full " +
    "group-data-selected:text-text-accent",
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
}: SegmentedControlOption<V> & { size: SegmentedControlSize }) {
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
      // react-aria's RadioGroupProps types onChange over plain string; it only ever fires with a
      // value read off one of our own Radio elements, always one of V.
      onChange={(nextValue) => onChange(nextValue as V)}
      className={`${containerClassName} ${containerSizeClassName[size]}`}
    >
      {options.map((option) => (
        <SegmentedOption key={option.value} {...option} size={size} />
      ))}
    </AriaRadioGroup>
  );
}
