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

// `options` is a non-empty tuple and `value`/`onChange` are pinned to V (inferred from `options`,
// wrapped in NoInfer so `value` can't itself widen it), the same guarantee OptionCardGroup's own
// options give: no representable "nothing chosen" or "chosen outside the list" state.
export type ListFilterProps<V extends string> = {
  label: string;
  options: readonly [ListFilterOption<V>, ...ListFilterOption<V>[]];
  value: NoInfer<V>;
  onChange: (value: NoInfer<V>) => void;
};

const triggerClassName =
  "flex h-11 items-center gap-2 rounded-lg border-2 bg-surface-white px-3 outline-none " +
  "data-[focus-visible]:outline-[3px] data-[focus-visible]:outline-solid " +
  "data-[focus-visible]:outline-offset-3 data-[focus-visible]:outline-brand-blue-strong";

const popoverClassName =
  "min-w-[12.5rem] w-[var(--trigger-width)] rounded-lg border border-line bg-surface-white p-1 " +
  "shadow-[0_8px_24px_var(--color-ink-menu-shadow)]";

const optionClassName =
  "flex h-10 cursor-default items-center justify-between rounded-md px-3 text-sm font-semibold " +
  "text-ink outline-none data-[hovered]:bg-surface-bone data-[focus-visible]:bg-surface-bone";

// react-aria-components' onSelectionChange reports a plain Key (string | number), since it
// doesn't know this select only ever holds V's own option values; this narrows it back without
// a cast, by checking it against the group's own options.
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
  // AriaSelect's own aria-label below still names the popover and its listbox, but on the
  // trigger itself aria-labelledby takes precedence over it: pointing that at both the label and
  // value spans announces the same sentence the visible text already reads ("Estado Todos"),
  // instead of just the fixed label with no indication of what's currently chosen. It stays in
  // sync with whatever SelectValue renders on its own, including react-aria's own placeholder for
  // a stale value.
  const labelId = useId();
  const valueId = useId();

  return (
    <AriaSelect
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
            <span id={labelId} className="text-sm text-ink-secondary">
              {label}
            </span>
            <AriaSelectValue id={valueId} className="text-base font-bold text-ink" />
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
                      <span>{option.label}</span>
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
