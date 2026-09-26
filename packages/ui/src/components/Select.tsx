import { Check, ChevronDown, ChevronUp } from "lucide-react";
import {
  Button as AriaButton,
  Label as AriaLabel,
  ListBox as AriaListBox,
  ListBoxItem as AriaListBoxItem,
  Popover as AriaPopover,
  Select as AriaSelect,
  SelectValue as AriaSelectValue,
  Text as AriaText,
  type Key,
} from "react-aria-components";
import {
  backofficeFieldBoxClassName,
  backofficeFieldValueClassName,
  fieldLabelClassName,
  fieldWrapperGapClassName,
  requiredFieldLabelSuffixClassName,
} from "./FieldSize";

export type SelectOption<V extends string = string> = {
  value: V;
  label: string;
};

type SelectCommonProps = {
  label: string;
  helperText?: string;
  disabled?: boolean;
  required?: boolean;
};

type SelectValidityProps =
  | { invalid: true; errorMessage: string }
  | { invalid?: false; errorMessage?: undefined };

// `value` may be `null` for "nothing chosen yet"; `onChange` never reports null back, since a
// chosen option is always one of V.
export type SelectProps<V extends string> = SelectCommonProps &
  SelectValidityProps & {
    options: readonly [SelectOption<V>, ...SelectOption<V>[]];
    value: NoInfer<V> | null;
    onChange: (value: NoInfer<V>) => void;
    /** Shown in place of a value while `value` is null. Defaults to AriaSelect's own localized text. */
    placeholder?: string;
  };

const wrapperClassName = `flex flex-col ${fieldWrapperGapClassName.backoffice} data-[disabled]:opacity-[0.45]`;

const baseLabelClassName = fieldLabelClassName.backoffice;
const requiredLabelClassName = `${baseLabelClassName} ${requiredFieldLabelSuffixClassName}`;

const triggerBaseClassName = `flex min-w-0 max-w-full items-center rounded-lg border-2 outline-none ${backofficeFieldBoxClassName}`;

// react-aria keeps `data-[focused]` on the trigger while its menu is open, since focus then sits
// in the listbox but the trigger is still the field being edited.
function triggerStateClassName(disabled: boolean, invalid: boolean, isOpen: boolean): string {
  if (disabled) {
    return "bg-surface-white border-line";
  }
  if (isOpen) {
    return "bg-surface-white border-brand-blue-ui";
  }
  const resting = invalid ? "border-status-error-ui" : "border-line";
  return (
    `bg-surface-white ${resting} data-[hovered]:not-data-[focused]:bg-surface-bone ` +
    "data-[focused]:border-brand-blue-ui"
  );
}

const valueClassName =
  `min-w-0 flex-1 truncate text-left ${backofficeFieldValueClassName} ` +
  "data-[placeholder]:font-normal data-[placeholder]:text-ink-secondary";

const chevronClassName = "size-[1.125rem] shrink-0 text-ink-secondary";

// react-aria-components caps the popover's max-height to the viewport but leaves overflow
// handling to the consumer.
const popoverClassName =
  "min-w-[var(--trigger-width)] w-[var(--trigger-width)] rounded-lg border border-line " +
  "bg-surface-white p-1.5 shadow-[0_8px_24px_var(--color-ink-menu-shadow)] overflow-y-auto";

// react-aria-components portals this popover to the document body as its own, separately stacked
// layer: with no z-index of its own it would paint below any sibling with a real positive
// z-index, since a positive z-index always wins that comparison over an auto one.
const POPOVER_Z_INDEX = 100000;

const optionClassName =
  "flex h-10 cursor-pointer items-center justify-between rounded-md px-3 text-sm font-semibold " +
  "text-ink outline-none data-[hovered]:bg-surface-bone data-[focus-visible]:bg-surface-bone " +
  "data-[selected]:bg-brand-blue-message-bg data-[selected]:text-brand-blue-strong " +
  "data-[hovered]:data-[selected]:bg-brand-blue-message-bg " +
  "data-[focus-visible]:data-[selected]:bg-brand-blue-message-bg";

const helperClassName = "text-sm font-normal text-ink-secondary";
const errorClassName = "text-sm font-normal text-status-error-ui";

// react-aria-components' onSelectionChange reports a plain Key (string | number).
function isOptionValue<V extends string>(key: Key, options: readonly SelectOption<V>[]): key is V {
  return typeof key === "string" && options.some((option) => option.value === key);
}

export function Select<V extends string>(props: SelectProps<V>) {
  const {
    label,
    options,
    value,
    onChange,
    helperText,
    placeholder,
    disabled = false,
    required = false,
  } = props;
  const invalid = props.invalid ?? false;
  const errorMessage = props.invalid ? props.errorMessage : undefined;

  // WCAG's contrast minimum doesn't apply to an inactive component's own text, and axe-core's
  // color-contrast check only honors that for a node whose own aria-disabled says so.
  const disabledTextProps = disabled ? { "aria-disabled": true as const } : {};
  // Left out entirely rather than set to `undefined`: AriaSelect's `placeholder` prop type doesn't
  // accept `undefined` under `exactOptionalPropertyTypes`.
  const placeholderProps = placeholder !== undefined ? { placeholder } : {};

  return (
    <AriaSelect
      selectedKey={value}
      onSelectionChange={(key) => {
        if (key !== null && isOptionValue(key, options)) {
          onChange(key);
        }
      }}
      {...placeholderProps}
      isDisabled={disabled}
      isRequired={required}
      isInvalid={invalid}
      // The default 'native' validationBehavior puts `required`/`invalid` only on the hidden
      // native <select> react-aria-components renders for form submission, leaving the visible
      // trigger button silent about it; 'aria' reflects both directly onto the trigger instead.
      validationBehavior="aria"
      className={wrapperClassName}
    >
      {({ isOpen }) => (
        <>
          <AriaLabel className={required ? requiredLabelClassName : baseLabelClassName}>
            {label}
          </AriaLabel>
          {/* WAI-ARIA only defines aria-required for combobox/listbox/textbox-shaped roles, never
              for role="button", so react-aria-components never places it here; the required
              asterisk instead folds into the trigger's accessible name through the label.
              aria-invalid is a valid global ARIA state on any role, but react-aria-components'
              Button filters props through a fixed DOM allowlist that excludes it; the invalid
              state still reaches assistive technology through the error text via
              aria-describedby. */}
          <AriaButton
            className={`${triggerBaseClassName} ${triggerStateClassName(disabled, invalid, isOpen)}`}
          >
            <AriaSelectValue className={valueClassName} />
            {isOpen ? (
              <ChevronUp aria-hidden="true" className={chevronClassName} />
            ) : (
              <ChevronDown aria-hidden="true" className={chevronClassName} />
            )}
          </AriaButton>
          {invalid ? (
            <AriaText slot="errorMessage" className={errorClassName} {...disabledTextProps}>
              {errorMessage}
            </AriaText>
          ) : (
            helperText !== undefined && (
              <AriaText slot="description" className={helperClassName} {...disabledTextProps}>
                {helperText}
              </AriaText>
            )
          )}
          <AriaPopover offset={4} style={{ zIndex: POPOVER_Z_INDEX }} className={popoverClassName}>
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
                          className="size-[1.125rem] shrink-0 text-brand-blue-strong"
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
