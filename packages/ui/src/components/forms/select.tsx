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
} from "react-aria-components";
import { type FieldErrorProps, fieldError } from "./field-error";
import {
  backofficeFieldBoxClassName,
  backofficeFieldValueClassName,
  fieldLabelClassName,
  fieldWrapperGapClassName,
  requiredFieldLabelSuffixClassName,
} from "./field-size";
import {
  disabledTextProps,
  fieldErrorClassName,
  fieldHelperClassName,
  fieldTriggerHoverClassName,
  fieldWrapperClassName,
  menuOptionClassName,
  menuPopoverStyle,
  menuSurfaceClassName,
} from "./field-styles";
import { isOptionValue, type NarrowedOption, type OptionalOptionChoiceProps } from "./option";

type SelectCommonProps = {
  label: string;
  description?: string;
  disabled?: boolean;
  required?: boolean;
};

export type SelectProps<V extends string> = SelectCommonProps &
  FieldErrorProps &
  OptionalOptionChoiceProps<V, NarrowedOption<V>> & {
    placeholder?: string;
  };

const wrapperClassName = `${fieldWrapperClassName} ${fieldWrapperGapClassName.backoffice}`;

const baseLabelClassName = fieldLabelClassName.backoffice;
const requiredLabelClassName = `${baseLabelClassName} ${requiredFieldLabelSuffixClassName}`;

const triggerBaseClassName = `flex min-w-0 max-w-full items-center rounded-lg border-2 outline-none ${backofficeFieldBoxClassName}`;

// react-aria keeps `data-focused` on the trigger while its menu is open, since focus then sits
// in the listbox but the trigger is still the field being edited.
function triggerStateClassName(disabled: boolean, invalid: boolean, open: boolean): string {
  if (disabled) {
    return "bg-surface border-border";
  }
  if (open) {
    return "bg-surface border-action";
  }
  const resting = invalid ? "border-error" : "border-border";
  return `bg-surface ${resting} ${fieldTriggerHoverClassName} data-focused:border-action`;
}

const valueClassName =
  `min-w-0 flex-1 truncate text-left ${backofficeFieldValueClassName} ` +
  "data-placeholder:font-normal data-placeholder:text-text-subtle";

const chevronClassName = "size-icon-md shrink-0 text-text-subtle";

// react-aria-components caps the popover's max-height to the viewport but leaves overflow
// handling to the consumer.
const popoverClassName = `min-w-trigger w-trigger p-1.5 overflow-y-auto ${menuSurfaceClassName}`;

export function Select<V extends string>(props: SelectProps<V>) {
  const {
    label,
    options,
    value,
    onChange,
    description,
    placeholder,
    disabled = false,
    required = false,
  } = props;
  const { invalid, errorMessage, errorMessageId } = fieldError(props);

  // Left out entirely rather than set to `undefined`: AriaSelect's `placeholder` prop type doesn't
  // accept `undefined` under `exactOptionalPropertyTypes`.
  const placeholderProps = placeholder !== undefined ? { placeholder } : {};

  return (
    <AriaSelect
      selectedKey={value}
      onSelectionChange={(key) => {
        if (isOptionValue(key, options)) {
          onChange(key);
        }
      }}
      {...placeholderProps}
      {...(errorMessageId !== undefined ? { "aria-describedby": errorMessageId } : {})}
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
          {errorMessage !== undefined ? (
            <AriaText
              slot="errorMessage"
              className={fieldErrorClassName}
              {...disabledTextProps(disabled)}
            >
              {errorMessage}
            </AriaText>
          ) : (
            !invalid &&
            description !== undefined && (
              <AriaText
                slot="description"
                className={fieldHelperClassName}
                {...disabledTextProps(disabled)}
              >
                {description}
              </AriaText>
            )
          )}
          <AriaPopover offset={4} style={menuPopoverStyle} className={popoverClassName}>
            <AriaListBox className="flex flex-col gap-1">
              {options.map((option) => (
                <AriaListBoxItem
                  key={option.value}
                  id={option.value}
                  textValue={option.label}
                  className={menuOptionClassName}
                >
                  {({ isSelected }) => (
                    <>
                      <span className="truncate">{option.label}</span>
                      {isSelected ? (
                        <Check
                          aria-hidden="true"
                          className="size-icon-md shrink-0 text-text-accent"
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
