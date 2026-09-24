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
// options give: no representable "nothing chosen" or "chosen outside the list" state.
export type SelectProps<V extends string> = SelectCommonProps &
  SelectValidityProps & {
    options: readonly [SelectOption<V>, ...SelectOption<V>[]];
    value: NoInfer<V>;
    onChange: (value: NoInfer<V>) => void;
  };

const wrapperClassName = "flex flex-col gap-1 data-[disabled]:opacity-[0.45]";

const baseLabelClassName = "text-sm font-bold text-ink";
// The asterisk is a CSS pseudo-element, not JSX text (see TextField.tsx's own
// requiredLabelClassName): a language-agnostic mark rather than caller-owned copy.
const requiredLabelClassName = `${baseLabelClassName} after:ml-1 after:content-['*']`;

// Height, gap and padding match DateField.tsx's own "backoffice" variant frame exactly (the
// design draws this field inside a backoffice modal at the same 48px/8px/12px metrics), not
// TextField.tsx's own register-sized plain-text kind.
const triggerBaseClassName =
  "flex h-12 min-w-0 max-w-full items-center gap-2 rounded-lg border-2 bg-surface-white px-3 " +
  "outline-none data-[focus-visible]:outline-[3px] data-[focus-visible]:outline-solid " +
  "data-[focus-visible]:outline-offset-3 data-[focus-visible]:outline-brand-blue-strong";

// Unlike TextField.tsx's own boxStateClassName, this trigger is a real <button> (the same shape
// ListFilter.tsx's own trigger already is), so its boundary is a real border rather than an inset
// box-shadow, and it carries no hover treatment of its own - ListFilter.tsx's trigger doesn't
// either. The design draws this field's own resting border in brand-blue-ui rather than
// TextField's ink-secondary, the same blue ListFilter.tsx only reaches once open; disabled and
// invalid still follow TextField.tsx's own token choices for those two states.
function triggerBorderClassName(disabled: boolean, invalid: boolean): string {
  if (disabled) {
    return "border-ink-secondary";
  }
  if (invalid) {
    return "border-status-error-ui";
  }
  return "border-brand-blue-ui";
}

const valueClassName =
  "min-w-0 flex-1 truncate text-left text-base font-semibold text-ink " +
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
  "flex h-10 cursor-default items-center justify-between rounded-md px-3 text-sm font-semibold " +
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
  const { label, options, value, onChange, helperText, disabled = false, required = false } = props;
  const invalid = props.invalid ?? false;
  const errorMessage = props.invalid ? props.errorMessage : undefined;

  // Same exemption TextField.tsx's own disabledTextProps grants its helper/error text: WCAG's
  // contrast minimum doesn't apply to an inactive component's own text, and axe-core's own
  // color-contrast check only honors that for a node whose OWN aria-disabled says so.
  const disabledTextProps = disabled ? { "aria-disabled": true as const } : {};

  return (
    <AriaSelect
      selectedKey={value}
      onSelectionChange={(key) => {
        if (key !== null && isOptionValue(key, options)) {
          onChange(key);
        }
      }}
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
            className={`${triggerBaseClassName} ${triggerBorderClassName(disabled, invalid)}`}
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
