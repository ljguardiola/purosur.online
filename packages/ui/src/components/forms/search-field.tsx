import { Input as AriaInput, SearchField as AriaSearchField } from "react-aria-components";
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
  disabled?: boolean;
  // Makes the field the combobox of a list of suggestions the caller draws under it.
  combobox?: { expanded: boolean; listboxId: string; activeOptionId?: string | undefined };
};

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

const chipClassName =
  "inline-flex size-12 shrink-0 items-center justify-center rounded-md bg-action-subtle";

const registerIconWrapperClassName = `${iconSlotClassName["2xl"]} text-text-accent`;
const backofficeIconWrapperClassName = `${iconSlotClassName.md} text-text-subtle`;

export function SearchField(props: SearchFieldProps) {
  const { value, onChange, placeholder, icon, label, disabled = false, combobox } = props;

  const size = useFieldSize();

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
      aria-label={label ?? placeholder}
      className={fieldDisabledClassName}
    >
      <div
        className={`${fieldBoxClassName} ${frameClassName[size]} ${fieldBoxStateClassName({ disabled })}`}
      >
        {leading}
        <AriaInput
          placeholder={placeholder}
          className={`${inputBaseClassName} ${valueClassName[size]}`}
          {...(combobox === undefined
            ? {}
            : {
                role: "combobox",
                "aria-autocomplete": "list",
                "aria-expanded": combobox.expanded,
                "aria-controls": combobox.expanded ? combobox.listboxId : undefined,
                "aria-activedescendant": combobox.expanded ? combobox.activeOptionId : undefined,
              })}
        />
      </div>
    </AriaSearchField>
  );
}
