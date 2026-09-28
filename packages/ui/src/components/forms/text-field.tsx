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
} from "./field-size";
import {
  disabledTextProps,
  fieldBoxClassName,
  fieldBoxStateClassName,
  fieldErrorClassName,
  fieldHelperClassName,
  fieldWrapperClassName,
} from "./field-styles";

export type TextFieldValueKind =
  | "amount"
  | "counted-cash"
  | "price"
  | "weight"
  | "quantity"
  | "plain-text";

// Excludes boolean along with null/undefined since React renders a boolean as nothing, so a kind
// that calls for a prefix or a suffix can't compile with an effectively empty one.
export type TextFieldAffix = Exclude<ReactNode, null | undefined | boolean>;

type TextFieldCommonProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  helperText?: string;
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
  // The id of another element whose text names this field alongside its own visible `label`,
  // prepended to it in the accessible name without changing the visible label.
  labelledBy?: string;
  // Keeps the label as the input's accessible name but renders it visually hidden (`sr-only`)
  // instead of the ordinary visible caption.
  labelVisuallyHidden?: boolean;
};

// `errorMessageId` names a message already rendered elsewhere and shared by several fields: this
// one turns invalid and is described by it, without rendering the message under itself too.
type TextFieldValidityProps =
  | { invalid: true; errorMessage: string; errorMessageId?: undefined }
  | { invalid: true; errorMessageId: string; errorMessage?: undefined }
  | { invalid?: false; errorMessage?: undefined; errorMessageId?: undefined };

type TextFieldKindProps =
  | { kind: "amount" | "counted-cash" | "price"; prefix: TextFieldAffix; suffix?: undefined }
  | { kind: "weight" | "quantity"; suffix: TextFieldAffix; prefix?: undefined }
  | { kind: "plain-text"; prefix?: undefined; suffix?: TextFieldAffix };

export type TextFieldProps = TextFieldCommonProps & TextFieldValidityProps & TextFieldKindProps;

const frameClassName: Record<Exclude<TextFieldValueKind, "plain-text">, string> = {
  amount: "h-control-6xl gap-2 px-4",
  "counted-cash": "h-control-7xl gap-3 px-6",
  price: "h-control-6xl gap-2 px-4",
  weight: "h-control-5xl gap-2 px-4",
  quantity: "h-control-6xl gap-2 px-4",
};
const registerPlainTextFrameClassName = "h-control-3xl gap-2 px-4";

const valueClassName: Record<Exclude<TextFieldValueKind, "plain-text">, string> = {
  amount: "text-right text-display text-text",
  "counted-cash": "text-right text-display text-text",
  price: "text-right text-display text-text",
  weight: "text-left text-display text-text",
  quantity: "text-right text-display text-text",
};
const registerPlainTextValueClassName = "text-left text-body text-text";
const registerPlainTextSuffixedValueClassName = "text-right text-body text-text";

const inputBaseClassName = "min-w-0 flex-1 bg-transparent caret-focus outline-none";

const moneyPrefixClassName = "shrink-0 text-display font-normal text-text-subtle";
const unitSuffixClassName = "shrink-0 text-heading font-normal text-text-subtle";
const plainTextSuffixClassName = "shrink-0 text-body text-text-subtle";

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

  // The prefix/suffix are `aria-hidden` so a screen reader doesn't hit them again as stray text;
  // react-aria's useField composes `aria-describedby` from the description slot, the error-message
  // slot and any caller-supplied `aria-describedby`, so this id reaches the input through that.
  const affixId = useId();
  // Left out entirely rather than set to `undefined`: AriaTextField's `aria-describedby` prop type
  // doesn't accept `undefined` under `exactOptionalPropertyTypes`.
  const describedBy = [
    prefix !== undefined || suffix !== undefined ? affixId : undefined,
    errorMessageId,
  ]
    .filter((id) => id !== undefined)
    .join(" ");
  const describedByProps = describedBy !== "" ? { "aria-describedby": describedBy } : {};

  // react-aria's useTextField wires the input's accessible name to this label through its own
  // generated id; supplying it here instead lets `labelledBy` list an external heading before it.
  const labelId = useId();
  const labelledByProps =
    labelledBy !== undefined ? { "aria-labelledby": `${labelledBy} ${labelId}` } : {};

  return (
    <AriaTextField
      value={value}
      onChange={onChange}
      isDisabled={disabled}
      isReadOnly={readOnly}
      isRequired={required}
      isInvalid={invalid}
      {...describedByProps}
      className={`${fieldWrapperClassName} ${fieldWrapperGapClassName[size]}`}
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
        className={`${fieldBoxClassName} ${boxFrameClassName} ${fieldBoxStateClassName({ disabled, readOnly, invalid })}`}
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
        <AriaText
          slot="errorMessage"
          className={fieldErrorClassName}
          {...disabledTextProps(disabled)}
        >
          {errorMessage}
        </AriaText>
      ) : (
        !invalid &&
        helperText !== undefined && (
          <AriaText
            slot="description"
            className={fieldHelperClassName}
            {...disabledTextProps(disabled)}
          >
            {helperText}
          </AriaText>
        )
      )}
    </AriaTextField>
  );
}
