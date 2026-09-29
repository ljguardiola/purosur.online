import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { useId } from "react";
import {
  Button as AriaButton,
  ListBox as AriaListBox,
  ListBoxItem as AriaListBoxItem,
  Popover as AriaPopover,
  Select as AriaSelect,
  SelectValue as AriaSelectValue,
} from "react-aria-components";
import { fieldTriggerHoverClassName } from "./field-styles";
import { isOptionValue, type NarrowedOption, type OptionChoiceProps } from "./option";

export type ListFilterProps<V extends string> = OptionChoiceProps<V, NarrowedOption<V>> & {
  label: string;
};

// A <button>, unlike a block element, doesn't fill its container's width on its own; it sizes to
// its content, so max-w-full caps it at the container's width instead.
const triggerClassName =
  "flex h-control-xl max-w-full items-center gap-2 rounded-lg border-2 bg-surface px-3 outline-none " +
  `${fieldTriggerHoverClassName} data-focus-visible:focus-ring`;

// react-aria-components caps the popover's max-height to fit the viewport but leaves overflow
// handling to the consumer; without overflow-y-auto a tall options list would paint past that cap.
const popoverClassName =
  "min-w-50 w-trigger rounded-lg border border-border bg-surface p-1 " +
  "shadow-lg overflow-y-auto";

const optionClassName =
  "flex h-control-lg cursor-pointer items-center justify-between rounded-md px-3 text-detail font-semibold " +
  "text-text outline-none data-hovered:bg-surface-subtle data-focus-visible:bg-surface-subtle";

export function ListFilter<V extends string>({
  label,
  options,
  value,
  onChange,
}: ListFilterProps<V>) {
  // aria-labelledby on the trigger takes precedence over AriaSelect's own aria-label, so pointing
  // it at both spans announces the visible label and chosen value together.
  const labelId = useId();
  const valueId = useId();

  return (
    <AriaSelect
      // A flex item's default min-width is its unwrapped content width, which would keep this
      // from ever shrinking below that regardless of the trigger's own max-w-full.
      className="min-w-0"
      aria-label={label}
      selectedKey={value}
      onSelectionChange={(key) => {
        if (isOptionValue(key, options)) {
          onChange(key);
        }
      }}
    >
      {({ isOpen }) => (
        <>
          <AriaButton
            aria-labelledby={`${labelId} ${valueId}`}
            className={[triggerClassName, isOpen ? "border-action" : "border-border"].join(" ")}
          >
            <span id={labelId} className="shrink truncate text-detail text-text-subtle">
              {label}
            </span>
            {/* shrink-9999 absorbs the shrink pass before the label's plain `shrink` gives way. */}
            <AriaSelectValue
              id={valueId}
              className="min-w-7 shrink-9999 truncate text-right text-body font-bold text-text"
            />
            {isOpen ? (
              <ChevronUp aria-hidden="true" className="size-icon-sm shrink-0 text-text-subtle" />
            ) : (
              <ChevronDown aria-hidden="true" className="size-icon-sm shrink-0 text-text-subtle" />
            )}
          </AriaButton>
          <AriaPopover offset={4} className={popoverClassName}>
            <AriaListBox className="flex flex-col gap-1">
              {options.map((option) => (
                <AriaListBoxItem
                  key={option.value}
                  id={option.value}
                  textValue={option.label}
                  className={optionClassName}
                >
                  {({ isSelected }) => (
                    <>
                      <span className="truncate">{option.label}</span>
                      {isSelected ? (
                        <Check
                          aria-hidden="true"
                          className="size-icon-sm shrink-0 text-text-accent"
                        />
                      ) : null}
                    </>
                  )}
                </AriaListBoxItem>
              ))}
            </AriaListBox>
          </AriaPopover>
        </>
      )}
    </AriaSelect>
  );
}
