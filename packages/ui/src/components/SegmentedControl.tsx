import { Radio as AriaRadio, RadioGroup as AriaRadioGroup } from "react-aria-components";
import type { ButtonIcon } from "./Button";

export type SegmentedControlIcon = ButtonIcon;
export type SegmentedControlSize = "large" | "medium";

export type SegmentedControlOption<V extends string = string> = {
  value: V;
  label: string;
  icon?: SegmentedControlIcon;
};

// See OptionCardGroup.tsx's OptionCardGroupProps for the full rationale: a non-empty tuple for
// `options` plus `value`/`onChange` pinned to V (wrapped in NoInfer so only `options` can widen
// it) makes an empty group or an out-of-domain chosen value fail to compile, so "exactly one
// option is always chosen" never needs a runtime check.
export type SegmentedControlProps<V extends string> = {
  label: string;
  options: readonly [SegmentedControlOption<V>, ...SegmentedControlOption<V>[]];
  value: NoInfer<V>;
  onChange: (value: NoInfer<V>) => void;
  size?: SegmentedControlSize;
};

// `items-stretch` (rather than the sibling components' `items-center`) is deliberate: the
// container's own height carries the design's 56/48px sizes, border and padding included, and
// each option is meant to fill that inner height rather than being centered at its own height.
const containerClassName =
  "inline-flex flex-row items-stretch gap-1 rounded-lg border border-line p-1";

const containerSizeClassName: Record<SegmentedControlSize, string> = {
  large: "h-14",
  medium: "h-12",
};

const sizeClassName: Record<SegmentedControlSize, string> = {
  large: "gap-2",
  medium: "gap-1.5",
};

const iconWrapperClassName: Record<SegmentedControlSize, string> = {
  large:
    "inline-flex size-[1.125rem] shrink-0 text-ink-secondary [&>svg]:h-full [&>svg]:w-full " +
    "group-data-[selected]:text-brand-blue-strong",
  medium:
    "inline-flex size-4 shrink-0 text-ink-secondary [&>svg]:h-full [&>svg]:w-full " +
    "group-data-[selected]:text-brand-blue-strong",
};

const optionClassName =
  "group flex items-center justify-center rounded-md px-4 outline-none " +
  "data-[hovered]:bg-surface-bone " +
  "data-[selected]:bg-brand-blue-message-bg " +
  // Two attribute selectors outrank the single-attribute hover rule above regardless of
  // stylesheet order, guaranteeing the chosen option's background never changes on hover.
  "data-[hovered]:data-[selected]:bg-brand-blue-message-bg " +
  "data-[focus-visible]:outline-[3px] data-[focus-visible]:outline-solid " +
  "data-[focus-visible]:outline-offset-3 data-[focus-visible]:outline-brand-blue-strong";

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
        className="invisible col-start-1 row-start-1 whitespace-nowrap text-base font-bold"
      >
        {label}
      </span>
      <span className="col-start-1 row-start-1 whitespace-nowrap text-base font-normal text-ink group-data-[selected]:font-bold group-data-[selected]:text-brand-blue-strong">
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
      {icon && (
        <span aria-hidden="true" className={iconWrapperClassName[size]}>
          {icon}
        </span>
      )}
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
      // React Aria's own RadioGroupProps types onChange over plain string, but it only ever
      // calls this with a value it read off one of our own Radio elements, whose `value` is
      // always one of `options`' own V values, so this cast can't observe a value outside V.
      onChange={(nextValue) => onChange(nextValue as V)}
      className={`${containerClassName} ${containerSizeClassName[size]}`}
    >
      {options.map((option) => (
        <SegmentedOption key={option.value} {...option} size={size} />
      ))}
    </AriaRadioGroup>
  );
}
