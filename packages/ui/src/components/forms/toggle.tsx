import { type ReactNode, useId } from "react";
import { Switch as AriaSwitch } from "react-aria-components";
import { disabledTextProps, fieldHelperClassName } from "./field-styles";

export type ToggleProps = {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  children: Exclude<ReactNode, null | undefined | boolean>;
  description?: string;
  disabled?: boolean;
};

const toggleLabelClassName =
  "group flex cursor-pointer items-center gap-3 outline-none " +
  "data-disabled:cursor-default data-disabled:opacity-disabled";

// justify-start/-end (not a translated knob) moves the knob without the track's own size
// depending on its position.
const trackClassName =
  "inline-flex h-control-xs w-12 shrink-0 items-center justify-start rounded-full p-1 outline-none " +
  "bg-surface inset-ring-2 inset-ring-border-strong " +
  "group-data-hovered:bg-surface-subtle " +
  "group-data-selected:justify-end group-data-selected:bg-success group-data-selected:inset-ring-0 " +
  "group-data-hovered:group-data-selected:bg-success-strong " +
  "group-data-focus-visible:focus-ring";

// A white knob is invisible on the white off-track without its own border; the green on-track
// already sets it apart, so the border drops there too. An inset box-shadow, not a real border,
// keeps the knob's size identical across both states.
const knobClassName =
  "size-control-2xs shrink-0 rounded-full bg-surface " +
  "inset-ring-2 inset-ring-border-strong group-data-selected:inset-ring-0";

// Aligns the description with the content: the track's width plus the gap the label leaves after it.
const descriptionClassName = `ps-15 ${fieldHelperClassName} aria-disabled:opacity-disabled`;

export function Toggle({
  checked,
  onCheckedChange,
  children,
  description,
  disabled = false,
}: ToggleProps) {
  const descriptionId = useId();
  const toggle = (
    <AriaSwitch
      isSelected={checked}
      onChange={onCheckedChange}
      isDisabled={disabled}
      className={toggleLabelClassName}
      {...(description === undefined ? {} : { "aria-describedby": descriptionId })}
    >
      <span aria-hidden="true" className={trackClassName}>
        <span className={knobClassName} />
      </span>
      <span className="min-w-0 flex-1">{children}</span>
    </AriaSwitch>
  );
  if (description === undefined) {
    return toggle;
  }
  return (
    <div className="flex flex-col gap-1">
      {toggle}
      <span id={descriptionId} className={descriptionClassName} {...disabledTextProps(disabled)}>
        {description}
      </span>
    </div>
  );
}
