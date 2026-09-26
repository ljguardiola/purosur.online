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

// Mirrors TextField.tsx's own TextFieldValidityProps: an invalid select always names why there
// is no invalid state with nothing for the helper line to show in its place.
type SelectValidityProps =
  | { invalid: true; errorMessage: string }
  | { invalid?: false; errorMessage?: undefined };

// `options` is a non-empty tuple and `value`/`onChange` are pinned to V (inferred from `options`,
// wrapped in NoInfer so `value` can't itself widen it), the same guarantee ListFilter.tsx's own
// options give: no representable "chosen outside the list" state. `value` may also be `null` for
// "nothing chosen yet" (e.g. a required field the caller won't default, so a real choice is
// forced); `onChange` itself never reports null back, since a chosen option is always one of V.
export type SelectProps<V extends string> = SelectCommonProps &
  SelectValidityProps & {
    options: readonly [SelectOption<V>, ...SelectOption<V>[]];
    value: NoInfer<V> | null;
    onChange: (value: NoInfer<V>) => void;
    /** Shown in place of a value while `value` is null. Defaults to AriaSelect's own localized text. */
    placeholder?: string;
  };

// This field only ever draws the backoffice size: the design has no register-scale select, so
// every class below reads FieldSize.tsx's own shared backoffice definition directly instead of
// consulting FieldSizeProvider.
const wrapperClassName = `flex flex-col ${fieldWrapperGapClassName.backoffice} data-[disabled]:opacity-[0.45]`;

const baseLabelClassName = fieldLabelClassName.backoffice;
const requiredLabelClassName = `${baseLabelClassName} ${requiredFieldLabelSuffixClassName}`;

const triggerBaseClassName = `flex min-w-0 max-w-full items-center rounded-lg border-2 outline-none ${backofficeFieldBoxClassName}`;

// The same field standard TextField.tsx's own boxStateClassName draws (resting, hovered and
// disabled share the 2px line border, invalid swaps in the error tone, focus draws a 2px
// brand-blue-ui border with no outer ring), but as a real border rather than an inset box-shadow,
// since this trigger is a real <button> (the same shape ListFilter.tsx's own trigger already is).
// The trigger counts as focused while its menu is open too: focus then sits in the listbox, yet
// the field is still the one being edited. The attribute selector behind `data-[focused]:` outranks
// the plain invalid border, and `not-data-[focused]` keeps the hovered fill off a focused trigger,
// both regardless of stylesheet order.
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

// Same overflow technique as ListFilter.tsx's own popoverClassName: React Aria caps the
// popover's own max-height to the viewport but leaves overflow to the consumer.
const popoverClassName =
  "min-w-[var(--trigger-width)] w-[var(--trigger-width)] rounded-lg border border-line " +
  "bg-surface-white p-1.5 shadow-[0_8px_24px_var(--color-ink-menu-shadow)] overflow-y-auto";

// This field's own first use (the backoffice "Nuevo usuario" modal) opens inside Modal.tsx's own
// z-50 overlay. React Aria portals this popover to the document body as its own, separately
// stacked layer: with no z-index of its own it would paint BELOW any sibling that carries a real
// positive z-index (including that modal's backdrop) regardless of DOM/mount order, since a
// positive z-index always wins that comparison over an auto one. This wins it back outright.
const POPOVER_Z_INDEX = 100000;

// Selected reuses OptionCardGroup.tsx's own "chosen" pair (bg-brand-blue-message-bg plus
// text-brand-blue-strong) rather than ListFilter.tsx's check-mark-only treatment, since the
// design draws that exact color pair on the chosen role; the check mark itself still follows
// ListFilter.tsx. Typography stays the one size/weight every row already shares - the design's
// own larger, bolder selected row reads as a quick prototype highlight rather than a second type
// scale, since neither existing precedent varies size or weight for a chosen option.
const optionClassName =
  "flex h-10 cursor-pointer items-center justify-between rounded-md px-3 text-sm font-semibold " +
  "text-ink outline-none data-[hovered]:bg-surface-bone data-[focus-visible]:bg-surface-bone " +
  "data-[selected]:bg-brand-blue-message-bg data-[selected]:text-brand-blue-strong " +
  // Two attribute selectors outrank the single-attribute hover/focus rules above regardless of
  // stylesheet order, guaranteeing the chosen row's own background never changes on hover/focus.
  "data-[hovered]:data-[selected]:bg-brand-blue-message-bg " +
  "data-[focus-visible]:data-[selected]:bg-brand-blue-message-bg";

const helperClassName = "text-sm font-normal text-ink-secondary";
const errorClassName = "text-sm font-normal text-status-error-ui";

// react-aria-components' onSelectionChange reports a plain Key (string | number), since it
// doesn't know this select only ever holds V's own option values; this narrows it back without a
// cast, by checking it against the group's own options (see ListFilter.tsx's own isOptionValue).
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

  // Same exemption TextField.tsx's own disabledTextProps grants its helper/error text: WCAG's
  // contrast minimum doesn't apply to an inactive component's own text, and axe-core's own
  // color-contrast check only honors that for a node whose OWN aria-disabled says so.
  const disabledTextProps = disabled ? { "aria-disabled": true as const } : {};
  // Left out entirely rather than set to `undefined` for a caller who never opts into a null
  // value: AriaSelect's own `placeholder` prop type doesn't accept `undefined` under this
  // project's `exactOptionalPropertyTypes` (see disabledTextProps above for the same technique).
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
      // Unlike TextField.tsx's own <input>, this field's real form control is the hidden native
      // <select> react-aria-components renders off-screen for native form submission; under the
      // default 'native' validationBehavior it alone would carry `required`, leaving the visible
      // trigger button (what a screen reader user actually focuses) silent about it. This field's
      // required/invalid state is already fully caller-controlled, the same "aria style" TextField
      // and DateField already use for their own invalid/errorMessage, so this reflects both
      // directly onto the trigger regardless of native form submission.
      validationBehavior="aria"
      className={wrapperClassName}
    >
      {({ isOpen }) => (
        <>
          <AriaLabel className={required ? requiredLabelClassName : baseLabelClassName}>
            {label}
          </AriaLabel>
          {/* WAI-ARIA only defines aria-required for combobox/listbox/textbox-shaped roles, never
              for role="button" (this trigger's own role), so react-aria-components correctly
              never places it here - the required asterisk instead folds into this trigger's own
              accessible name through the referenced label, exactly like TextField.tsx's own
              asterisk already does. aria-invalid IS a valid global ARIA state on any role, but
              react-aria-components' own Button filters every prop through a fixed DOM allowlist
              (see TextField.tsx's own comment on the same filtering for aria-disabled) that
              excludes it with no supported override; the invalid state still reaches assistive
              technology through the error text wired below via aria-describedby, the same
              channel TextField.tsx's own invalid field relies on. */}
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
