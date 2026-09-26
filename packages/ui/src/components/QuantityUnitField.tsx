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
  /**
   * The unit picker's own accessible name (e.g. "Unidad"). It never shares the field's own visible
   * label: that label already names the quantity value, and the unit picker's chosen option is a
   * separate control with its own choice to make.
   */
  unitLabel: string;
  helperText?: string;
  disabled?: boolean;
};

// Mirrors TextField.tsx's own TextFieldValidityProps: an invalid field always names why, and it
// never carries both its own message and a shared one at once. The two controls that make up this
// field (the quantity input and the unit picker) always share one combined validity rather than
// each getting its own, since "Contenido neto" is invalid or it isn't.
type QuantityUnitFieldValidityProps =
  | { invalid: true; errorMessage: string; errorMessageId?: undefined }
  | { invalid: true; errorMessageId: string; errorMessage?: undefined }
  | { invalid?: false; errorMessage?: undefined; errorMessageId?: undefined };

export type QuantityUnitFieldProps<U extends string> = QuantityUnitFieldCommonProps<U> &
  QuantityUnitFieldValidityProps;

const wrapperClassName = "flex flex-col gap-1 data-[disabled]:opacity-[0.45]";

// Matches Select.tsx's own baseLabelClassName exactly: the same label scale and tone the design
// draws for this field ("Contenido neto", 14px bold ink).
const labelClassName = "text-sm font-bold text-ink";

const boxBaseClassName =
  "flex h-12 min-w-0 max-w-full items-center gap-2 rounded-lg px-3 outline-none";

// The same border/fill states TextField.tsx's own boxStateClassName draws (resting, hovered,
// focused, invalid, disabled), plus one extra branch: opening the unit picker's menu moves DOM
// focus into its own portaled listbox, off this box entirely, so `focus-within` alone would drop
// the border the instant it opens. This forces it back on while open, the same way Select.tsx's
// own triggerStateClassName forces its border on `isOpen` for exactly the same reason.
function boxStateClassName(disabled: boolean, invalid: boolean, unitOpen: boolean): string {
  if (disabled) {
    return "bg-surface-white shadow-[inset_0_0_0_2px_var(--color-line)]";
  }
  if (unitOpen) {
    return "bg-surface-white shadow-[inset_0_0_0_2px_var(--color-brand-blue-ui)]";
  }
  if (invalid) {
    return (
      "bg-surface-white shadow-[inset_0_0_0_2px_var(--color-status-error-ui)] " +
      "hover:not-focus-within:bg-surface-bone " +
      "focus-within:shadow-[inset_0_0_0_2px_var(--color-brand-blue-ui)]"
    );
  }
  return (
    "bg-surface-white shadow-[inset_0_0_0_2px_var(--color-line)] " +
    "hover:not-focus-within:bg-surface-bone " +
    "focus-within:shadow-[inset_0_0_0_2px_var(--color-brand-blue-ui)]"
  );
}

const valueClassName =
  "min-w-0 flex-1 bg-transparent text-left text-base font-semibold text-ink " +
  "caret-brand-blue-strong outline-none";

const unitTriggerClassName = "flex shrink-0 items-center gap-1 outline-none";
const unitValueClassName = "text-base font-normal text-ink-secondary";
const chevronClassName = "size-[1.125rem] shrink-0 text-ink-secondary";

const popoverClassName =
  "min-w-24 rounded-lg border border-line bg-surface-white p-1.5 " +
  "shadow-[0_8px_24px_var(--color-ink-menu-shadow)] overflow-y-auto";

// Reuses Select.tsx's own reasoning: this popover portals to the document body as its own
// stacking layer, which would otherwise paint below a positive-z-index ancestor (e.g. Modal.tsx's
// own overlay) regardless of mount order, since a positive z-index always wins that comparison
// over an auto one.
const POPOVER_Z_INDEX = 100000;

const optionClassName =
  "flex h-10 cursor-pointer items-center justify-between rounded-md px-3 text-sm font-semibold " +
  "text-ink outline-none data-[hovered]:bg-surface-bone data-[focus-visible]:bg-surface-bone " +
  "data-[selected]:bg-brand-blue-message-bg data-[selected]:text-brand-blue-strong " +
  "data-[hovered]:data-[selected]:bg-brand-blue-message-bg " +
  "data-[focus-visible]:data-[selected]:bg-brand-blue-message-bg";

const helperClassName = "text-sm font-normal text-ink-secondary";
const errorClassName = "text-sm font-normal text-status-error-ui";

// react-aria-components' onSelectionChange reports a plain Key (string | number), since it
// doesn't know this picker only ever holds one of the caller's own option ids; this narrows it
// back without a cast, the same way Select.tsx's own isOptionValue does.
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
  // renders elsewhere (the errorMessageId case, mirroring TextField.tsx's own external-message
  // discipline): a plain paragraph rather than react-aria's own description/errorMessage slot,
  // since that slot only wires into the quantity input's own root and this same message also has
  // to describe the unit picker's separate root below.
  const ownMessageId = useId();
  const showOwnMessage =
    explicitMessageId === undefined &&
    (errorMessage !== undefined || (!invalid && helperText !== undefined));
  const messageId = explicitMessageId ?? (showOwnMessage ? ownMessageId : undefined);
  const describedByProps = messageId !== undefined ? { "aria-describedby": messageId } : {};

  // Same exemption TextField.tsx's own disabledTextProps grants its helper/error text: WCAG's
  // contrast minimum doesn't apply to an inactive component's own text, and axe-core's own
  // color-contrast check only honors that for a node whose OWN aria-disabled says so.
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
              <AriaPopover
                offset={4}
                style={{ zIndex: POPOVER_Z_INDEX }}
                className={popoverClassName}
              >
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
