import type { ReactNode } from "react";
import { useId } from "react";
import {
  Input as AriaInput,
  Label as AriaLabel,
  Text as AriaText,
  TextField as AriaTextField,
} from "react-aria-components";
import {
  backofficeFieldBoxClassName,
  backofficeFieldValueClassName,
  fieldLabelClassName,
  fieldWrapperGapClassName,
  requiredFieldLabelSuffixClassName,
  useFieldSize,
} from "./fieldSize";

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
  /**
   * The id of another element whose text names this field alongside its own visible `label` — a
   * row heading shared by several fields (e.g. a day group's name before its own "Abre"/"Cierra"
   * fields), which stays out of every field's own visible label so it isn't repeated once per
   * field. Prepended to the field's own label in its accessible name; the visible label is
   * unaffected.
   */
  labelledBy?: string;
  /**
   * True keeps the label as the input's accessible name but renders it visually hidden (`sr-only`)
   * instead of the ordinary visible caption, for a design that draws no visible label at all (e.g.
   * a branch's hours range fields, whose own sentence — "Lunes, horario 1, abre" — only needs to
   * reach assistive technology). Defaults to false, the ordinary visible label.
   */
  labelVisuallyHidden?: boolean;
};

// An invalid field always names why: there is no invalid state with nothing for the helper line
// to show in its place. `errorMessageId` names a message rendered once outside the field and
// shared by several of them (e.g. one error under a day's row of time fields): the field turns
// invalid and is described by it, without repeating the message under itself.
type TextFieldValidityProps =
  | { invalid: true; errorMessage: string; errorMessageId?: undefined }
  | { invalid: true; errorMessageId: string; errorMessage?: undefined }
  | { invalid?: false; errorMessage?: undefined; errorMessageId?: undefined };

// Only the three money kinds take a prefix; plain text never takes one either. The two kg kinds
// require a suffix, and plain text may optionally take one too (e.g. a day count read as "30
// días"). Asking for the wrong affix on a kind, or leaving out the one a kg kind requires, does
// not compile. The design draws no backoffice money or kg field, but that is no longer a
// compile-time rule now that size comes from context instead of a caller-supplied prop (see
// FieldSizeProvider): those five kinds simply keep their own register frame below, regardless of
// the ambient size, the same way SearchField.tsx's own icon size never varies with them either.
type TextFieldKindProps =
  | { kind: "amount" | "counted-cash" | "price"; prefix: TextFieldAffix; suffix?: undefined }
  | { kind: "weight" | "quantity"; suffix: TextFieldAffix; prefix?: undefined }
  | { kind: "plain-text"; prefix?: undefined; suffix?: TextFieldAffix };

export type TextFieldProps = TextFieldCommonProps & TextFieldValidityProps & TextFieldKindProps;

const wrapperBaseClassName = "flex flex-col data-[disabled]:opacity-[0.45]";

const boxBaseClassName = "flex items-center rounded-lg outline-none";

// Height, horizontal padding and gap for every kind but plain text, in the exact px the design
// specifies; those five only ever draw at this register scale (see TextFieldKindProps above).
// Plain text's own frame varies by size instead (see registerPlainTextFrameClassName and
// fieldSize.ts's own backofficeFieldBoxClassName).
const frameClassName: Record<Exclude<TextFieldValueKind, "plain-text">, string> = {
  amount: "h-[4.5rem] gap-2 px-4",
  "counted-cash": "h-[5rem] gap-3 px-6",
  price: "h-[4.5rem] gap-2 px-4",
  weight: "h-[4rem] gap-2 px-4",
  quantity: "h-[4.5rem] gap-2 px-4",
};
// This field's own long-standing register frame for plain text; the backoffice one is
// fieldSize.ts's own shared backofficeFieldBoxClassName.
const registerPlainTextFrameClassName = "h-[3.25rem] gap-2 px-4";

// The value's own typography and alignment per kind: 32 bold ink for every kind but plain text,
// right-aligned against a prefix or immediately before a suffix, left-aligned only for weight.
// Those five only ever draw at this register scale (see TextFieldKindProps above); plain text's
// own value varies by size instead (see registerPlainTextValueClassName below and fieldSize.ts's
// own backofficeFieldValueClassName).
const valueClassName: Record<Exclude<TextFieldValueKind, "plain-text">, string> = {
  amount: "text-right text-3xl font-bold text-ink",
  "counted-cash": "text-right text-3xl font-bold text-ink",
  price: "text-right text-3xl font-bold text-ink",
  weight: "text-left text-3xl font-bold text-ink",
  quantity: "text-right text-3xl font-bold text-ink",
};
// Plain text is left-aligned unless it carries a suffix (see registerPlainTextSuffixedValueClassName).
const registerPlainTextValueClassName = "text-left text-base font-normal text-ink";
// A plain-text value with a suffix sits immediately before it ("30 días"), like every other kind
// that takes one, instead of leaving the input's empty width between the value and its unit.
const registerPlainTextSuffixedValueClassName = "text-right text-base font-normal text-ink";

const inputBaseClassName = "min-w-0 flex-1 bg-transparent caret-brand-blue-strong outline-none";

const moneyPrefixClassName = "shrink-0 text-3xl font-normal text-ink-secondary";
const unitSuffixClassName = "shrink-0 text-xl font-normal text-ink-secondary";
// Plain text's own value is text-base rather than the 32px register scale every other kind
// shares, so its optional suffix (e.g. "días") follows that same smaller scale instead of
// unitSuffixClassName's kg-kind size, while keeping the same ink-secondary color every affix uses
// to read as a unit rather than part of the value.
const plainTextSuffixClassName = "shrink-0 text-base font-normal text-ink-secondary";

const helperClassName = "text-sm font-normal text-ink-secondary";
const errorClassName = "text-sm font-normal text-status-error-ui";

// The box's own border and shadow per interaction state, drawn as an inset box-shadow rather
// than a real border (see Checkbox.tsx's own boxClassName for the same technique) so it never
// participates in layout.
//
// Resting, hovered and read-only all share the same 2px "line" border, the design's own token for
// this boundary. Only the fill tells resting from hovered apart, following the package's own
// white-hovers-to-bone rule (see Checkbox.tsx and OptionCardGroup.tsx). A read-only field doesn't
// react to hover — its value can't be edited — but it is still in the tab order, and the box and
// input both suppress the browser's own focus ring, so it draws the package's focused border like
// any other reachable field: a keyboard user would otherwise lose track of where they are
// mid-form. A disabled field can't be reached at all, so it needs neither. Focus draws only the
// 2px brand-blue-ui border, with no outer shadow ring. `hover:not-focus-within:` keeps the hovered
// fill from ever showing once the field is focused, regardless of stylesheet order.
function boxStateClassName(disabled: boolean, readOnly: boolean, invalid: boolean): string {
  if (disabled) {
    return "bg-surface-white shadow-[inset_0_0_0_2px_var(--color-line)]";
  }
  if (readOnly) {
    return (
      "bg-surface-bone shadow-[inset_0_0_0_2px_var(--color-line)] " +
      "focus-within:shadow-[inset_0_0_0_2px_var(--color-brand-blue-ui)]"
    );
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

export function TextField(props: TextFieldProps) {
  const {
    label,
    value,
    onChange,
    helperText,
    disabled = false,
    readOnly = false,
    required = false,
    labelledBy,
    labelVisuallyHidden = false,
    kind,
  } = props;
  const invalid = props.invalid ?? false;
  const errorMessage = props.invalid ? props.errorMessage : undefined;
  const errorMessageId = props.invalid ? props.errorMessageId : undefined;
  const prefix =
    kind === "amount" || kind === "counted-cash" || kind === "price" ? props.prefix : undefined;
  const suffix =
    kind === "weight" || kind === "quantity" || kind === "plain-text" ? props.suffix : undefined;

  // The design never draws a backoffice money or kg field; those five kinds keep their own
  // register frame regardless of the ambient FieldSizeProvider, since only plain text's frame
  // varies with it.
  const contextSize = useFieldSize();
  const size = kind === "plain-text" ? contextSize : "register";
  const boxFrameClassName =
    kind === "plain-text"
      ? size === "backoffice"
        ? backofficeFieldBoxClassName
        : registerPlainTextFrameClassName
      : frameClassName[kind];
  const plainTextValueClass =
    size === "backoffice"
      ? `${backofficeFieldValueClassName} text-left`
      : registerPlainTextValueClassName;
  const plainTextSuffixedValueClass =
    size === "backoffice"
      ? `${backofficeFieldValueClassName} text-right`
      : registerPlainTextSuffixedValueClassName;

  // The prefix and suffix are visual-only (`aria-hidden`) so a screen reader doesn't hit them a
  // second time as stray text while moving through the field, but a sighted user reads the unit
  // right there in the box, so a screen reader user needs it too — as part of the field's own
  // description, the same place its helper text and error message already land. react-aria's own
  // useField composes `aria-describedby` from the description slot, the error-message slot and
  // whatever `aria-describedby` the caller passes to TextField itself, in that order, so handing
  // it this id here reaches the input without the caller ever repeating the unit in the label.
  const affixId = useId();
  // Left out entirely rather than set to `undefined` for a field with no affix: AriaTextField's own
  // `aria-describedby` prop type doesn't accept `undefined` under this project's
  // `exactOptionalPropertyTypes` (see `disabledTextProps` below for the same technique).
  const describedBy = [
    prefix !== undefined || suffix !== undefined ? affixId : undefined,
    errorMessageId,
  ]
    .filter((id) => id !== undefined)
    .join(" ");
  const describedByProps = describedBy !== "" ? { "aria-describedby": describedBy } : {};

  // react-aria's own useTextField already wires the input's accessible name to this label through
  // its own generated id; giving that id here (instead of leaving react-aria to generate one it
  // never hands back) lets `labelledBy` list an external heading before it, without disturbing the
  // internal association react-aria itself relies on.
  const labelId = useId();
  const labelledByProps =
    labelledBy !== undefined ? { "aria-labelledby": `${labelledBy} ${labelId}` } : {};

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
      {...describedByProps}
      className={`${wrapperBaseClassName} ${fieldWrapperGapClassName[size]}`}
    >
      <AriaLabel
        id={labelId}
        className={
          labelVisuallyHidden
            ? "sr-only"
            : required
              ? `${fieldLabelClassName[size]} ${requiredFieldLabelSuffixClassName}`
              : fieldLabelClassName[size]
        }
      >
        {label}
      </AriaLabel>
      <div
        className={`${boxBaseClassName} ${boxFrameClassName} ${boxStateClassName(disabled, readOnly, invalid)}`}
      >
        {prefix !== undefined && (
          <span aria-hidden="true" id={affixId} className={moneyPrefixClassName}>
            {prefix}
          </span>
        )}
        <AriaInput
          className={`${inputBaseClassName} ${
            kind === "plain-text"
              ? suffix !== undefined
                ? plainTextSuffixedValueClass
                : plainTextValueClass
              : valueClassName[kind]
          }`}
          {...labelledByProps}
        />
        {suffix !== undefined && (
          <span
            aria-hidden="true"
            id={affixId}
            className={kind === "plain-text" ? plainTextSuffixClassName : unitSuffixClassName}
          >
            {suffix}
          </span>
        )}
      </div>
      {errorMessage !== undefined ? (
        <AriaText slot="errorMessage" className={errorClassName} {...disabledTextProps}>
          {errorMessage}
        </AriaText>
      ) : (
        !invalid &&
        helperText !== undefined && (
          <AriaText slot="description" className={helperClassName} {...disabledTextProps}>
            {helperText}
          </AriaText>
        )
      )}
    </AriaTextField>
  );
}
