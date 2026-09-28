import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { useId, useState } from "react";
import {
  Button as AriaButton,
  Input as AriaInput,
  Label as AriaLabel,
  ListBox as AriaListBox,
  ListBoxItem as AriaListBoxItem,
  Popover as AriaPopover,
  Select as AriaSelect,
  SelectValue as AriaSelectValue,
  TextField as AriaTextField,
  type Key,
} from "react-aria-components";
import {
  backofficeFieldBoxClassName,
  backofficeFieldValueClassName,
  fieldLabelClassName,
  fieldWrapperGapClassName,
} from "./FieldSize";

export type QuantityUnitFieldOption<U extends string = string> = {
  id: U;
  label: string;
};

type QuantityUnitFieldCommonProps<U extends string> = {
  label: string;
  quantity: string;
  onQuantityChange: (value: string) => void;
  unit: NoInfer<U>;
  onUnitChange: (value: NoInfer<U>) => void;
  options: readonly [QuantityUnitFieldOption<U>, ...QuantityUnitFieldOption<U>[]];
  // The unit picker's own accessible name: a separate control from the quantity input, so it
  // needs its own name rather than sharing the field's visible label.
  unitLabel: string;
  helperText?: string;
  disabled?: boolean;
};

type QuantityUnitFieldValidityProps =
  | { invalid: true; errorMessage: string; errorMessageId?: undefined }
  | { invalid: true; errorMessageId: string; errorMessage?: undefined }
  | { invalid?: false; errorMessage?: undefined; errorMessageId?: undefined };

export type QuantityUnitFieldProps<U extends string> = QuantityUnitFieldCommonProps<U> &
  QuantityUnitFieldValidityProps;

const wrapperClassName = `flex flex-col ${fieldWrapperGapClassName.backoffice} data-disabled:opacity-disabled`;

const labelClassName = fieldLabelClassName.backoffice;

const boxBaseClassName = `flex min-w-0 max-w-full items-center rounded-lg outline-none ${backofficeFieldBoxClassName}`;

// Opening the unit picker's menu moves DOM focus into its own portaled listbox, off this box
// entirely, so `focus-within` alone would drop the border the instant it opens; this forces it
// back on while open.
function boxStateClassName(disabled: boolean, invalid: boolean, unitOpen: boolean): string {
  if (disabled) {
    return "bg-surface inset-ring-2 inset-ring-border";
  }
  if (unitOpen) {
    return "bg-surface inset-ring-2 inset-ring-action";
  }
  if (invalid) {
    return (
      "bg-surface inset-ring-2 inset-ring-error " +
      "hover:not-focus-within:bg-surface-subtle " +
      "focus-within:inset-ring-action"
    );
  }
  return (
    "bg-surface inset-ring-2 inset-ring-border " +
    "hover:not-focus-within:bg-surface-subtle " +
    "focus-within:inset-ring-action"
  );
}

const valueClassName =
  `min-w-0 flex-1 bg-transparent text-left ${backofficeFieldValueClassName} ` +
  "caret-focus outline-none";

const unitTriggerClassName = "flex shrink-0 items-center gap-1 outline-none";
const unitValueClassName = "text-body text-text-subtle";
const chevronClassName = "size-icon-md shrink-0 text-text-subtle";

const popoverClassName =
  "min-w-24 rounded-lg border border-border bg-surface p-1.5 " + "shadow-lg overflow-y-auto";

// This popover portals to the document body as its own stacking layer, which would otherwise
// paint below a positive-z-index ancestor (e.g. a modal's overlay) regardless of mount order,
// since a positive z-index always wins that comparison over an auto one.
const popoverStyle = { zIndex: "var(--z-index-popover)" };

const optionClassName =
  "flex h-control-lg cursor-pointer items-center justify-between rounded-md px-3 text-detail font-semibold " +
  "text-text outline-none data-hovered:bg-surface-subtle data-focus-visible:bg-surface-subtle " +
  "data-selected:bg-action-subtle data-selected:text-text-accent " +
  "data-hovered:data-selected:bg-action-subtle " +
  "data-focus-visible:data-selected:bg-action-subtle";

const helperClassName = "text-detail text-text-subtle";
const errorClassName = "text-detail text-error";

// react-aria-components' onSelectionChange reports a plain Key (string | number).
function isOptionValue<U extends string>(
  key: Key,
  options: readonly QuantityUnitFieldOption<U>[],
): key is U {
  return typeof key === "string" && options.some((option) => option.id === key);
}

export function QuantityUnitField<U extends string>(props: QuantityUnitFieldProps<U>) {
  const {
    label,
    quantity,
    onQuantityChange,
    unit,
    onUnitChange,
    options,
    unitLabel,
    helperText,
    disabled = false,
  } = props;
  const invalid = props.invalid ?? false;
  const errorMessage = props.invalid ? props.errorMessage : undefined;
  const explicitMessageId = props.invalid ? props.errorMessageId : undefined;

  const [unitOpen, setUnitOpen] = useState(false);

  // Rendered only when this field owns its own message rather than pointing at one the caller
  // renders elsewhere: a plain paragraph rather than react-aria's own description/errorMessage
  // slot, since that slot only wires into the quantity input's own root and this same message
  // also has to describe the unit picker's separate root below.
  const ownMessageId = useId();
  const showOwnMessage =
    explicitMessageId === undefined &&
    (errorMessage !== undefined || (!invalid && helperText !== undefined));
  const messageId = explicitMessageId ?? (showOwnMessage ? ownMessageId : undefined);
  const describedByProps = messageId !== undefined ? { "aria-describedby": messageId } : {};

  // WCAG's contrast minimum doesn't apply to an inactive component's own text, and axe-core's
  // color-contrast check only honors that for a node whose own aria-disabled says so.
  const disabledTextProps = disabled ? { "aria-disabled": true as const } : {};

  return (
    <AriaTextField
      value={quantity}
      onChange={onQuantityChange}
      isDisabled={disabled}
      isInvalid={invalid}
      {...describedByProps}
      className={wrapperClassName}
    >
      <AriaLabel className={labelClassName}>{label}</AriaLabel>
      <div className={`${boxBaseClassName} ${boxStateClassName(disabled, invalid, unitOpen)}`}>
        <AriaInput className={valueClassName} />
        <AriaSelect
          selectedKey={unit}
          onSelectionChange={(key) => {
            if (key !== null && isOptionValue(key, options)) {
              onUnitChange(key);
            }
          }}
          onOpenChange={setUnitOpen}
          isDisabled={disabled}
          isInvalid={invalid}
          validationBehavior="aria"
          className="contents"
        >
          {({ isOpen }) => (
            <>
              <AriaLabel className="sr-only">{unitLabel}</AriaLabel>
              <AriaButton className={unitTriggerClassName} {...describedByProps}>
                <AriaSelectValue className={unitValueClassName} />
                {isOpen ? (
                  <ChevronUp aria-hidden="true" className={chevronClassName} />
                ) : (
                  <ChevronDown aria-hidden="true" className={chevronClassName} />
                )}
              </AriaButton>
              <AriaPopover offset={4} style={popoverStyle} className={popoverClassName}>
                <AriaListBox className="flex flex-col gap-1">
                  {options.map((option) => (
                    <AriaListBoxItem
                      key={option.id}
                      id={option.id}
                      textValue={option.label}
                      className={optionClassName}
                    >
                      {({ isSelected }) => (
                        <>
                          <span className="truncate">{option.label}</span>
                          {isSelected && (
                            <Check
                              aria-hidden="true"
                              className="size-icon-md shrink-0 text-text-accent"
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
      </div>
      {showOwnMessage &&
        (errorMessage !== undefined ? (
          <p id={ownMessageId} className={errorClassName} {...disabledTextProps}>
            {errorMessage}
          </p>
        ) : (
          helperText !== undefined && (
            <p id={ownMessageId} className={helperClassName} {...disabledTextProps}>
              {helperText}
            </p>
          )
        ))}
    </AriaTextField>
  );
}
