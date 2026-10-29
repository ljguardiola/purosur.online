import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { useId, useRef } from "react";
import {
  Button as AriaButton,
  ComboBox as AriaComboBox,
  Input as AriaInput,
  Label as AriaLabel,
  ListBox as AriaListBox,
  ListBoxItem as AriaListBoxItem,
  Popover as AriaPopover,
  Select as AriaSelect,
  SelectValue as AriaSelectValue,
} from "react-aria-components";
import { fieldTriggerHoverClassName } from "./field-styles";
import { isOptionValue, type NarrowedOption, type OptionChoiceProps } from "./option";
import { NoResults, SelectCaret, useTypeToNarrow } from "./type-to-narrow";

export type ListFilterProps<V extends string> = OptionChoiceProps<V, NarrowedOption<V>> & {
  name: string;
  label: string;
  searchable?: boolean;
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

function lastOptionPerValue<O extends { value: string }>(options: readonly O[]): O[] {
  return [...new Map(options.map((option) => [option.value, option])).values()];
}

const searchableBoxClassName =
  "flex h-control-xl w-fit max-w-full items-center gap-2 rounded-lg border-2 bg-surface px-3 " +
  "hover:not-focus-within:bg-surface-subtle has-focus-visible:focus-ring";

function SearchableListFilter<V extends string>({
  name,
  label,
  options,
  value,
  onChange,
}: Omit<ListFilterProps<V>, "searchable">) {
  const boxRef = useRef<HTMLDivElement>(null);
  const uniqueOptions = lastOptionPerValue(options);
  const { comboBoxProps } = useTypeToNarrow({ options: uniqueOptions, value, onChange });

  return (
    <AriaComboBox name={name} className="min-w-0" {...comboBoxProps}>
      {({ isOpen }) => (
        <>
          <div
            ref={boxRef}
            className={[searchableBoxClassName, isOpen ? "border-action" : "border-border"].join(
              " ",
            )}
          >
            <AriaLabel className="shrink truncate text-detail text-text-subtle">{label}</AriaLabel>{" "}
            <AriaInput className="min-w-7 shrink-9999 field-sizing-content truncate bg-transparent text-right text-body font-bold text-text outline-none" />
            <AriaButton excludeFromTabOrder className="flex shrink-0 cursor-pointer outline-none">
              <SelectCaret className="size-icon-sm text-text-subtle" />
            </AriaButton>
          </div>
          <AriaPopover triggerRef={boxRef} offset={4} className={popoverClassName}>
            <AriaListBox className="flex flex-col gap-1" renderEmptyState={() => <NoResults />}>
              {(option: NarrowedOption<V>) => (
                <AriaListBoxItem
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
              )}
            </AriaListBox>
          </AriaPopover>
        </>
      )}
    </AriaComboBox>
  );
}

export function ListFilter<V extends string>({
  name,
  label,
  options,
  value,
  onChange,
  searchable = false,
}: ListFilterProps<V>) {
  // aria-labelledby on the trigger takes precedence over AriaSelect's own aria-label, so pointing
  // it at both spans announces the visible label and chosen value together.
  const labelId = useId();
  const valueId = useId();
  const uniqueOptions = lastOptionPerValue(options);

  if (searchable) {
    return (
      <SearchableListFilter
        name={name}
        label={label}
        options={options}
        value={value}
        onChange={onChange}
      />
    );
  }

  return (
    <AriaSelect
      name={name}
      // A flex item's default min-width is its unwrapped content width, which would keep this
      // from ever shrinking below that regardless of the trigger's own max-w-full.
      className="min-w-0"
      aria-label={label}
      selectedKey={value}
      onSelectionChange={(key) => {
        if (isOptionValue(key, uniqueOptions)) {
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
            </span>{" "}
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
              {uniqueOptions.map((option) => (
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
