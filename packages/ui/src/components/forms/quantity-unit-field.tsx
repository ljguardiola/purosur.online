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
import { type FieldErrorProps, fieldError } from "./field-error";
import {
  backofficeFieldBoxClassName,
  backofficeFieldValueClassName,
  fieldLabelClassName,
  fieldWrapperGapClassName,
} from "./field-size";
import {
  disabledTextProps,
  fieldBoxClassName,
  fieldBoxStateClassName,
  fieldErrorClassName,
  fieldHelperClassName,
  fieldWrapperClassName,
} from "./field-styles";

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
  description?: string;
  disabled?: boolean;
};

export type QuantityUnitFieldProps<U extends string> = QuantityUnitFieldCommonProps<U> &
  FieldErrorProps;

const wrapperClassName = `${fieldWrapperClassName} ${fieldWrapperGapClassName.backoffice}`;

const labelClassName = fieldLabelClassName.backoffice;

const boxBaseClassName = `${fieldBoxClassName} min-w-0 max-w-full ${backofficeFieldBoxClassName}`;

const valueClassName =
  `min-w-0 flex-1 bg-transparent text-left ${backofficeFieldValueClassName} ` +
  "caret-focus outline-none";

const unitTriggerClassName = "flex shrink-0 items-center gap-1 outline-none";
const unitValueClassName = "text-body text-text-subtle";
const chevronClassName = "size-icon-md shrink-0 text-text-subtle";

const popoverClassName =
  "min-w-24 rounded-lg border border-border bg-surface p-1.5 shadow-lg overflow-y-auto";

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
    description,
    disabled = false,
  } = props;
  const { invalid, errorMessage, errorMessageId: explicitMessageId } = fieldError(props);

  const [unitOpen, setUnitOpen] = useState(false);

  // Rendered only when this field owns its own message rather than pointing at one the caller
  // renders elsewhere: a plain paragraph rather than react-aria's own description/errorMessage
  // slot, since that slot only wires into the quantity input's own root and this same message
  // also has to describe the unit picker's separate root below.
  const ownMessageId = useId();
  const showOwnMessage =
    explicitMessageId === undefined &&
    (errorMessage !== undefined || (!invalid && description !== undefined));
  const messageId = explicitMessageId ?? (showOwnMessage ? ownMessageId : undefined);
  const describedByProps = messageId !== undefined ? { "aria-describedby": messageId } : {};

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
      <div
        className={`${boxBaseClassName} ${fieldBoxStateClassName({ disabled, invalid, forcedFocus: unitOpen })}`}
      >
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
      </div>
      {showOwnMessage ? (
        errorMessage !== undefined ? (
          <p id={ownMessageId} className={fieldErrorClassName} {...disabledTextProps(disabled)}>
            {errorMessage}
          </p>
        ) : description !== undefined ? (
          <p id={ownMessageId} className={fieldHelperClassName} {...disabledTextProps(disabled)}>
            {description}
          </p>
        ) : null
      ) : null}
    </AriaTextField>
  );
}
