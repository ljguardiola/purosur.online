import type { ReactNode } from "react";
import { useId } from "react";
import {
  Input as AriaInput,
  Label as AriaLabel,
  Text as AriaText,
  TextField as AriaTextField,
} from "react-aria-components";

// The six value kinds the design defines: each carries its own box height, padding, gap and
// value alignment, and only some of them take a prefix or a suffix (see TextFieldKindProps).
export type TextFieldValueKind =
  | "amount"
  | "counted-cash"
  | "price"
  | "weight"
  | "quantity"
  | "plain-text";

// See Checkbox.tsx's own children and Button.tsx's own icon: never null/undefined/boolean, so a
// kind that calls for a prefix or a suffix can't compile with an empty one.
export type TextFieldAffix = Exclude<ReactNode, null | undefined | boolean>;

type TextFieldCommonProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  helperText?: string;
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
};

// An invalid field always names why: there is no invalid state with nothing for the helper line
// to show in its place.
type TextFieldValidityProps =
  | { invalid: true; errorMessage: string }
  | { invalid?: false; errorMessage?: undefined };

// Only the three money kinds take a prefix and only the two kg kinds take a suffix; plain text
// takes neither. Asking for the wrong affix on a kind, or leaving out the one it requires, does
// not compile.
type TextFieldKindProps =
  | { kind: "amount" | "counted-cash" | "price"; prefix: TextFieldAffix; suffix?: undefined }
  | { kind: "weight" | "quantity"; suffix: TextFieldAffix; prefix?: undefined }
  | { kind: "plain-text"; prefix?: undefined; suffix?: undefined };

export type TextFieldProps = TextFieldCommonProps & TextFieldValidityProps & TextFieldKindProps;

const wrapperClassName = "flex flex-col gap-1.5 data-[disabled]:opacity-[0.45]";

const baseLabelClassName = "text-base font-bold text-ink";
// The asterisk is a CSS pseudo-element, not JSX text: a language-agnostic mark rather than
// caller-owned copy, drawn only when `required` is true. The field's required state itself
// already reaches assistive technology through the native `required` attribute on the input.
const requiredLabelClassName = `${baseLabelClassName} after:ml-1 after:content-['*']`;

const boxBaseClassName = "flex items-center rounded-lg outline-none";

// Height, horizontal padding and gap per value kind, in the exact px the design specifies.
const frameClassName: Record<TextFieldValueKind, string> = {
  amount: "h-[4.5rem] gap-2 px-4",
  "counted-cash": "h-[5rem] gap-3 px-6",
  price: "h-[4.5rem] gap-2 px-4",
  weight: "h-[4rem] gap-2 px-4",
  quantity: "h-[4.5rem] gap-2 px-4",
  "plain-text": "h-[3.25rem] px-4",
};

// The value's own typography and alignment per kind: 32 bold ink for every kind but plain text,
// right-aligned against a prefix or immediately before a suffix, left-aligned only for weight.
const valueClassName: Record<TextFieldValueKind, string> = {
  amount: "text-right text-3xl font-bold text-ink",
  "counted-cash": "text-right text-3xl font-bold text-ink",
  price: "text-right text-3xl font-bold text-ink",
  weight: "text-left text-3xl font-bold text-ink",
  quantity: "text-right text-3xl font-bold text-ink",
  "plain-text": "text-left text-base font-normal text-ink",
};

const inputBaseClassName = "min-w-0 flex-1 bg-transparent caret-brand-blue-strong outline-none";

const moneyPrefixClassName = "shrink-0 text-3xl font-normal text-ink-secondary";
const unitSuffixClassName = "shrink-0 text-xl font-normal text-ink-secondary";

const helperClassName = "text-sm font-normal text-ink-secondary";
const errorClassName = "text-sm font-normal text-status-error-ui";

// The box's own border and shadow per interaction state. A real border going from 2px to 3px on
// focus would resize the box, so every state is drawn with an inset box-shadow instead (see
// Checkbox.tsx's own boxClassName for the same technique) — it never participates in layout.
//
// Resting, hovered and read-only all share the same 2px ink-secondary border — the same choice
// Checkbox.tsx already makes for its own unchecked box, and for the same reason: a control's own
// boundary needs the WCAG 3:1 non-text contrast minimum, which the softer, decorative "line" and
// "blue-soft" tokens fall short of (see contrast.test.ts's "text field border contrast"). Those
// two tokens stay reserved for dividers and container edges, never this field's own boundary.
// Only the fill tells resting from hovered apart, following the package's own white-hovers-to-bone
// rule (see Checkbox.tsx and OptionCardGroup.tsx). A read-only field doesn't react to hover — its
// value can't be edited — but it is still in the tab order, and the box and input both suppress
// the browser's own focus ring, so it draws the package's focused border like any other reachable
// field: a keyboard user would otherwise lose track of where they are mid-form. A disabled field
// can't be reached at all, so it needs neither. `hover:not-focus-within:` keeps the hovered fill
// from ever showing once the field is focused, regardless of stylesheet order.
function boxStateClassName(disabled: boolean, readOnly: boolean, invalid: boolean): string {
  if (disabled) {
    return "bg-surface-white shadow-[inset_0_0_0_2px_var(--color-ink-secondary)]";
  }
  if (readOnly) {
    return (
      "bg-surface-bone shadow-[inset_0_0_0_2px_var(--color-ink-secondary)] " +
      "focus-within:shadow-[inset_0_0_0_3px_var(--color-brand-blue-strong),0_0_0_4px_var(--color-brand-blue-ui-shadow)]"
    );
  }
  if (invalid) {
    return (
      "bg-surface-white shadow-[inset_0_0_0_2px_var(--color-status-error-ui)] " +
      "hover:not-focus-within:bg-surface-bone " +
      "focus-within:shadow-[inset_0_0_0_3px_var(--color-brand-blue-strong),0_0_0_4px_var(--color-brand-blue-ui-shadow)]"
    );
  }
  return (
    "bg-surface-white shadow-[inset_0_0_0_2px_var(--color-ink-secondary)] " +
    "hover:not-focus-within:bg-surface-bone " +
    "focus-within:shadow-[inset_0_0_0_3px_var(--color-brand-blue-strong),0_0_0_4px_var(--color-brand-blue-ui-shadow)]"
  );
}

export function TextField(props: TextFieldProps) {
  const {
    label,
    value,
    onChange,
    helperText,
    disabled = false,
    readOnly = false,
    required = false,
    kind,
  } = props;
  const invalid = props.invalid ?? false;
  const errorMessage = props.invalid ? props.errorMessage : undefined;
  const prefix =
    kind === "amount" || kind === "counted-cash" || kind === "price" ? props.prefix : undefined;
  const suffix = kind === "weight" || kind === "quantity" ? props.suffix : undefined;

  // The prefix and suffix are visual-only (`aria-hidden`) so a screen reader doesn't hit them a
  // second time as stray text while moving through the field, but a sighted user reads the unit
  // right there in the box, so a screen reader user needs it too — as part of the field's own
  // description, the same place its helper text and error message already land. react-aria's own
  // useField composes `aria-describedby` from the description slot, the error-message slot and
  // whatever `aria-describedby` the caller passes to TextField itself, in that order, so handing
  // it this id here reaches the input without the caller ever repeating the unit in the label.
  const affixId = useId();
  // Left out entirely rather than set to `undefined` for a plain-text field: AriaTextField's own
  // `aria-describedby` prop type doesn't accept `undefined` under this project's
  // `exactOptionalPropertyTypes` (see `disabledTextProps` below for the same technique).
  const affixDescribedByProps =
    prefix !== undefined || suffix !== undefined ? { "aria-describedby": affixId } : {};

  // The native `disabled` attribute already lands on the input itself, but the error or helper
  // text beside it doesn't inherit that from a sibling, so assistive tooling has no way to tell
  // it's part of a disabled field. WCAG's contrast minimum explicitly doesn't apply to an
  // inactive component's own text (1.4.3/1.4.11), and axe-core's own color-contrast check only
  // honors that exemption for a node whose OWN `aria-disabled` (or an ancestor's) says so — a
  // bare opacity dip on the wrapper doesn't qualify, which is what an invalid+disabled field's
  // status-error-ui text would otherwise fail against. react-aria-components' TextField root
  // only forwards a fixed allowlist of DOM props (see its own filterDOMProps), which excludes
  // `aria-disabled`, so it's set directly on the text elements that actually need the exemption
  // instead.
  const disabledTextProps = disabled ? { "aria-disabled": true as const } : {};

  return (
    <AriaTextField
      value={value}
      onChange={onChange}
      isDisabled={disabled}
      isReadOnly={readOnly}
      isRequired={required}
      isInvalid={invalid}
      {...affixDescribedByProps}
      className={wrapperClassName}
    >
      <AriaLabel className={required ? requiredLabelClassName : baseLabelClassName}>
        {label}
      </AriaLabel>
      <div
        className={`${boxBaseClassName} ${frameClassName[kind]} ${boxStateClassName(disabled, readOnly, invalid)}`}
      >
        {prefix !== undefined && (
          <span aria-hidden="true" id={affixId} className={moneyPrefixClassName}>
            {prefix}
          </span>
        )}
        <AriaInput className={`${inputBaseClassName} ${valueClassName[kind]}`} />
        {suffix !== undefined && (
          <span aria-hidden="true" id={affixId} className={unitSuffixClassName}>
            {suffix}
          </span>
        )}
      </div>
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
    </AriaTextField>
  );
}
