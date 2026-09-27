import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { useId } from "react";
import {
  Button as AriaButton,
  ListBox as AriaListBox,
  ListBoxItem as AriaListBoxItem,
  Popover as AriaPopover,
  Select as AriaSelect,
  SelectValue as AriaSelectValue,
  type Key,
} from "react-aria-components";

export type ListFilterOption<V extends string = string> = {
  value: V;
  label: string;
};

export type ListFilterProps<V extends string> = {
  label: string;
  options: readonly [ListFilterOption<V>, ...ListFilterOption<V>[]];
  value: NoInfer<V>;
  onChange: (value: NoInfer<V>) => void;
};

// A <button>, unlike a block element, doesn't fill its container's width on its own; it sizes to
// its content, so max-w-full caps it at the container's width instead.
const triggerClassName =
  "flex h-11 max-w-full items-center gap-2 rounded-lg border-2 bg-surface-white px-3 outline-none " +
  "data-[focus-visible]:outline-[3px] data-[focus-visible]:outline-solid " +
  "data-[focus-visible]:outline-offset-3 data-[focus-visible]:outline-brand-blue-strong";

// react-aria-components caps the popover's max-height to fit the viewport but leaves overflow
// handling to the consumer; without overflow-y-auto a tall options list would paint past that cap.
const popoverClassName =
  "min-w-[12.5rem] w-[var(--trigger-width)] rounded-lg border border-line bg-surface-white p-1 " +
  "shadow-[0_8px_24px_var(--color-ink-menu-shadow)] overflow-y-auto";

const optionClassName =
  "flex h-10 cursor-pointer items-center justify-between rounded-md px-3 text-sm font-semibold " +
  "text-ink outline-none data-[hovered]:bg-surface-bone data-[focus-visible]:bg-surface-bone";

// react-aria-components' onSelectionChange reports a plain Key (string | number).
function isOptionValue<V extends string>(
  key: Key,
  options: readonly ListFilterOption<V>[],
): key is V {
  return typeof key === "string" && options.some((option) => option.value === key);
}

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
        if (key !== null && isOptionValue(key, options)) {
          onChange(key);
        }
      }}
    >
      {({ isOpen }) => (
        <>
          <AriaButton
            aria-labelledby={`${labelId} ${valueId}`}
            className={[triggerClassName, isOpen ? "border-brand-blue-ui" : "border-line"].join(
              " ",
            )}
          >
            <span id={labelId} className="shrink truncate text-sm text-ink-secondary">
              {label}
            </span>
            {/* shrink-[9999] absorbs the shrink pass before the label's plain `shrink` gives way. */}
            <AriaSelectValue
              id={valueId}
              className="min-w-7 shrink-[9999] truncate text-right text-base font-bold text-ink"
            />
            {isOpen ? (
              <ChevronUp aria-hidden="true" className="size-4 shrink-0 text-ink-secondary" />
            ) : (
              <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-ink-secondary" />
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
                      {isSelected && (
                        <Check
                          aria-hidden="true"
                          className="size-4 shrink-0 text-brand-blue-strong"
                        />
                      )}
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
