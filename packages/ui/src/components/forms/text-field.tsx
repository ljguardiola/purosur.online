import type { ComponentProps, ReactNode } from "react";
import { useId } from "react";
import {
  Focusable as AriaFocusable,
  Input as AriaInput,
  Label as AriaLabel,
  Text as AriaText,
  TextField as AriaTextField,
} from "react-aria-components";
import { Tooltip } from "../overlays/tooltip";
import { type FieldErrorProps, fieldError } from "./field-error";
import {
  backofficeFieldBoxClassName,
  backofficeFieldHeightClassName,
  backofficeFieldInsetClassName,
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
  | "discount"
  | "plain-text";

// Excludes boolean along with null/undefined since React renders a boolean as nothing, so a kind
// that calls for a prefix or a suffix can't compile with an effectively empty one.
export type TextFieldAffix = Exclude<ReactNode, null | undefined | boolean>;

type TextFieldDiscountWidth = "standard" | "narrow";

type TextFieldCommonProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  description?: string;
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
  // The id of another element whose text names this field alongside its own visible `label`,
  // prepended to it in the accessible name without changing the visible label.
  labelledBy?: string;
  // Keeps the label as the input's accessible name but renders it visually hidden (`sr-only`)
  // instead of the ordinary visible caption.
  labelVisuallyHidden?: boolean;
  type?: "text" | "password";
  inputMode?: "text" | "numeric" | "decimal";
};

type TextFieldKindProps =
  | {
      kind: "amount" | "counted-cash" | "price";
      prefix: TextFieldAffix;
      suffix?: undefined;
      width?: undefined;
    }
  | { kind: "weight" | "quantity"; suffix: TextFieldAffix; prefix?: undefined; width?: undefined }
  | {
      kind: "discount";
      prefix?: undefined;
      suffix?: TextFieldAffix;
      width?: TextFieldDiscountWidth;
    }
  | { kind: "plain-text"; prefix?: undefined; suffix?: TextFieldAffix; width?: undefined };

export type TextFieldProps = TextFieldCommonProps &
  FieldErrorProps &
  TextFieldKindProps & { readOnlyReason?: undefined };

// The reason opens as a tooltip over the whole box, so the box's horizontal padding moves onto the
// input to keep that area edge to edge, which leaves no room for an affix beside it.
export type TextFieldReadOnlyReasonProps = TextFieldCommonProps &
  FieldErrorProps & {
    kind: "plain-text";
    disabled?: false;
    prefix?: undefined;
    suffix?: undefined;
    width?: undefined;
    readOnly: true;
    readOnlyReason: string;
  };

const frameClassName: Record<Exclude<TextFieldValueKind, "plain-text">, string> = {
  amount: "h-control-6xl gap-2 px-4",
  "counted-cash": "h-control-7xl gap-3 px-6",
  price: "h-control-6xl gap-2 px-4",
  weight: "h-control-5xl gap-2 px-4",
  quantity: "h-control-6xl gap-2 px-4",
  discount: "h-control-4xl shrink-0 gap-2 px-4",
};
const discountWidthClassName: Record<TextFieldDiscountWidth, string> = {
  standard: "w-55",
  narrow: "w-45",
};
const registerPlainTextHeightClassName = "h-control-3xl";
const registerPlainTextInsetClassName = "px-4";
const registerPlainTextFrameClassName = `${registerPlainTextHeightClassName} gap-2 ${registerPlainTextInsetClassName}`;

const valueClassName: Record<Exclude<TextFieldValueKind, "plain-text">, string> = {
  amount: "text-right text-display text-text",
  "counted-cash": "text-right text-display text-text",
  price: "text-right text-display text-text",
  weight: "text-left text-display text-text",
  quantity: "text-right text-display text-text",
  discount: "text-left text-title text-text",
};
const registerPlainTextValueClassName = "text-left text-body text-text";
const registerPlainTextSuffixedValueClassName = "text-right text-body text-text";

const inputBaseClassName = "min-w-0 flex-1 bg-transparent caret-focus outline-none";

const moneyPrefixClassName = "shrink-0 text-display font-normal text-text-subtle";
const unitSuffixClassName = "shrink-0 text-heading font-normal text-text-subtle";
const discountSuffixClassName = "shrink-0 text-subheading font-normal text-text-subtle";
const discountDescriptionClassName = "text-detail text-text-subtle";
const plainTextSuffixClassName = "shrink-0 text-body text-text-subtle";

// The tooltip trigger adds its own `aria-describedby` while open, replacing the input's; the
// reason is already in the description, so dropping it keeps the description whole and unrepeated.
function ReadOnlyReasonInput({
  "aria-describedby": _tooltipDescribedBy,
  ...props
}: ComponentProps<typeof AriaInput>) {
  return <AriaInput {...props} />;
}

// An overload rather than one more member of TextFieldProps' union: a member with required props
// stops a spread of an optional `errorMessageId` from being assignable to that union.
export function TextField(props: TextFieldReadOnlyReasonProps): ReactNode;
export function TextField(props: TextFieldProps): ReactNode;
export function TextField(props: TextFieldProps | TextFieldReadOnlyReasonProps) {
  const {
    label,
    value,
    onChange,
    description,
    disabled = false,
    readOnly = false,
    required = false,
    labelledBy,
    labelVisuallyHidden = false,
    type = "text",
    inputMode,
    kind,
  } = props;
  const { readOnlyReason } = props;
  const { invalid, errorMessage, errorMessageId } = fieldError(props);
  const prefix =
    kind === "amount" || kind === "counted-cash" || kind === "price" ? props.prefix : undefined;
  const suffix =
    kind === "weight" || kind === "quantity" || kind === "discount" || kind === "plain-text"
      ? props.suffix
      : undefined;

  const contextSize = useFieldSize();
  const size = kind === "plain-text" ? contextSize : "register";
  const boxFrameClassName =
    kind === "plain-text"
      ? size === "backoffice"
        ? backofficeFieldBoxClassName
        : registerPlainTextFrameClassName
      : kind === "discount"
        ? `${frameClassName.discount} ${discountWidthClassName[props.width ?? "standard"]}`
        : frameClassName[kind];
  const insetClassName =
    size === "backoffice" ? backofficeFieldInsetClassName : registerPlainTextInsetClassName;
  const heightClassName =
    size === "backoffice" ? backofficeFieldHeightClassName : registerPlainTextHeightClassName;
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
  const readOnlyReasonId = useId();
  // Left out entirely rather than set to `undefined`: AriaTextField's `aria-describedby` prop type
  // doesn't accept `undefined` under `exactOptionalPropertyTypes`.
  const describedBy = [
    prefix !== undefined || suffix !== undefined ? affixId : undefined,
    readOnlyReason !== undefined ? readOnlyReasonId : undefined,
    errorMessageId,
  ]
    .filter((id) => id !== undefined)
    .join(" ");
  const inputModeProps = inputMode !== undefined ? { inputMode } : {};
  const describedByProps = describedBy !== "" ? { "aria-describedby": describedBy } : {};

  // react-aria's useTextField wires the input's accessible name to this label through its own
  // generated id; supplying it here instead lets `labelledBy` list an external heading before it.
  const labelId = useId();
  const labelledByProps =
    labelledBy !== undefined ? { "aria-labelledby": `${labelledBy} ${labelId}` } : {};

  const inputClassName = `${inputBaseClassName} ${
    kind === "plain-text"
      ? suffix !== undefined
        ? plainTextSuffixedValueClass
        : plainTextValueClass
      : valueClassName[kind]
  } ${readOnlyReason !== undefined ? `self-stretch ${insetClassName}` : ""}`;

  const descriptionElement =
    errorMessage === undefined && !invalid && description !== undefined ? (
      <AriaText
        slot="description"
        className={kind === "discount" ? discountDescriptionClassName : fieldHelperClassName}
        {...disabledTextProps(disabled)}
      >
        {description}
      </AriaText>
    ) : null;
  const errorElement =
    errorMessage !== undefined ? (
      <AriaText
        slot="errorMessage"
        className={fieldErrorClassName}
        {...disabledTextProps(disabled)}
      >
        {errorMessage}
      </AriaText>
    ) : null;
  const descriptionBelowBox = kind === "discount" ? null : descriptionElement;
  const boxElement = (
    <div
      className={`${fieldBoxClassName} ${readOnlyReason !== undefined ? heightClassName : boxFrameClassName} ${fieldBoxStateClassName({ disabled, readOnly, invalid })}`}
    >
      {prefix !== undefined && (
        <span aria-hidden="true" id={affixId} className={moneyPrefixClassName}>
          {prefix}
        </span>
      )}
      {readOnlyReason !== undefined ? (
        <>
          <Tooltip description={readOnlyReason}>
            <AriaFocusable>
              <ReadOnlyReasonInput className={inputClassName} {...labelledByProps} />
            </AriaFocusable>
          </Tooltip>
          <span id={readOnlyReasonId} className="sr-only">
            {readOnlyReason}
          </span>
        </>
      ) : (
        <AriaInput className={inputClassName} {...labelledByProps} />
      )}
      {suffix !== undefined && (
        <span
          aria-hidden="true"
          id={affixId}
          className={
            kind === "plain-text"
              ? plainTextSuffixClassName
              : kind === "discount"
                ? discountSuffixClassName
                : unitSuffixClassName
          }
        >
          {suffix}
        </span>
      )}
    </div>
  );

  return (
    <AriaTextField
      value={value}
      onChange={onChange}
      isDisabled={disabled}
      isReadOnly={readOnly}
      isRequired={required}
      isInvalid={invalid}
      type={type}
      {...inputModeProps}
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
      {kind === "discount" ? (
        <div className="flex items-center gap-3">
          {boxElement}
          {descriptionElement}
        </div>
      ) : (
        boxElement
      )}
      {errorElement}
      {descriptionBelowBox}
    </AriaTextField>
  );
}
