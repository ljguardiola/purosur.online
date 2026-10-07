import type { ComponentProps } from "react";
import { useId } from "react";
import {
  Focusable as AriaFocusable,
  Input as AriaInput,
  SearchField as AriaSearchField,
} from "react-aria-components";
import { Tooltip } from "../overlays/tooltip";
import { type Icon, iconSlotClassName } from "../shared/icon";
import { type FieldSize, useFieldSize } from "./field-size";
import { fieldBoxClassName, fieldBoxStateClassName, fieldDisabledClassName } from "./field-styles";

export type SearchFieldProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  icon: Icon;
  // No visible label is drawn for this field at either size: when supplied, it names the
  // field for assistive technology only, the same way the placeholder does when it is not.
  label?: string;
  // Makes the field the combobox of a list of suggestions the caller draws under it.
  combobox?: { expanded: boolean; listboxId: string; activeOptionId?: string | undefined };
} & (
  | { disabled?: boolean; disabledReason?: undefined }
  | { disabled?: undefined; disabledReason: string }
);

const frameClassName: Record<FieldSize, string> = {
  register: "h-control-5xl gap-4 px-2",
  backoffice: "h-control-xl gap-2 px-3",
};

// The field is a type="search" input, so Chromium paints its own clear button inside it as soon
// as it holds a value, and Tailwind's preflight resets ::-webkit-search-decoration only. Neither
// size draws a clear affordance, so that button is taken out of the input altogether.
const inputBaseClassName =
  "min-w-0 flex-1 bg-transparent caret-focus outline-none " +
  "placeholder:text-text-subtle search-cancel-button:hidden";

const valueClassName: Record<FieldSize, string> = {
  register: "text-heading font-normal text-text",
  backoffice: "text-detail text-text",
};

const lockedBoxClassName = `${fieldBoxStateClassName({ disabled: true })} focus-within:inset-ring-action`;

const chipClassName =
  "inline-flex size-12 shrink-0 items-center justify-center rounded-md bg-action-subtle";

const registerIconWrapperClassName = `${iconSlotClassName["2xl"]} text-text-accent`;
const backofficeIconWrapperClassName = `${iconSlotClassName.md} text-text-subtle`;

// A disabled input takes neither focus nor hover, so a field that says why it is disabled stays
// focusable and read-only, announced disabled, which is what lets its tooltip open. The tooltip
// trigger adds its own `aria-describedby` while open, replacing the input's; the reason is already
// in the description, so dropping it keeps the description whole.
function DisabledReasonInput({
  "aria-describedby": _tooltipDescribedBy,
  ...props
}: ComponentProps<typeof AriaInput>) {
  return <AriaInput {...props} />;
}

export function SearchField(props: SearchFieldProps) {
  const {
    value,
    onChange,
    placeholder,
    icon,
    label,
    disabled = false,
    disabledReason,
    combobox,
  } = props;

  const size = useFieldSize();
  const reasonId = useId();
  const locked = disabledReason !== undefined;

  const inputProps = {
    placeholder,
    className: `${inputBaseClassName} ${valueClassName[size]}`,
    ...(combobox === undefined
      ? {}
      : {
          role: "combobox",
          "aria-autocomplete": "list" as const,
          "aria-expanded": combobox.expanded,
          "aria-controls": combobox.expanded ? combobox.listboxId : undefined,
          "aria-activedescendant": combobox.expanded ? combobox.activeOptionId : undefined,
        }),
  };

  const leading =
    size === "register" ? (
      <span aria-hidden="true" className={chipClassName}>
        <span className={registerIconWrapperClassName}>{icon}</span>
      </span>
    ) : (
      <span aria-hidden="true" className={backofficeIconWrapperClassName}>
        {icon}
      </span>
    );

  return (
    <AriaSearchField
      value={value}
      onChange={onChange}
      isDisabled={disabled}
      isReadOnly={locked}
      aria-label={label ?? placeholder}
      {...(locked ? { "aria-describedby": reasonId } : {})}
      className={locked ? "opacity-disabled" : fieldDisabledClassName}
    >
      <div
        className={`${fieldBoxClassName} ${frameClassName[size]} ${
          locked ? lockedBoxClassName : fieldBoxStateClassName({ disabled })
        }`}
      >
        {leading}
        {locked ? (
          <Tooltip description={disabledReason}>
            <AriaFocusable>
              <DisabledReasonInput aria-disabled="true" {...inputProps} />
            </AriaFocusable>
          </Tooltip>
        ) : (
          <AriaInput {...inputProps} />
        )}
      </div>
      {locked ? (
        <span id={reasonId} className="sr-only">
          {disabledReason}
        </span>
      ) : null}
    </AriaSearchField>
  );
}
