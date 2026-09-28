import { Input as AriaInput, SearchField as AriaSearchField } from "react-aria-components";
import type { ButtonIcon } from "./Button";

export type SearchFieldVariant = "register" | "backoffice";

export type SearchFieldIcon = ButtonIcon;

export type SearchFieldProps = {
  variant: SearchFieldVariant;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  icon: SearchFieldIcon;
  // No visible label is drawn for this field in either variant: when supplied, it names the
  // field for assistive technology only, the same way the placeholder does when it is not.
  label?: string;
  disabled?: boolean;
};

const wrapperClassName = "data-disabled:opacity-disabled";

const boxBaseClassName = "flex items-center rounded-lg outline-none";

const frameClassName: Record<SearchFieldVariant, string> = {
  register: "h-control-5xl gap-4 px-2",
  backoffice: "h-control-xl gap-2 px-3",
};

// The field is a type="search" input, so Chromium paints its own clear button inside it as soon
// as it holds a value, and Tailwind's preflight resets ::-webkit-search-decoration only. Neither
// variant draws a clear affordance, so that button is taken out of the input altogether.
const inputBaseClassName =
  "min-w-0 flex-1 bg-transparent caret-focus outline-none " +
  "placeholder:text-text-subtle search-cancel-button:hidden";

const valueClassName: Record<SearchFieldVariant, string> = {
  register: "text-heading font-normal text-text",
  backoffice: "text-detail text-text",
};

const chipClassName =
  "inline-flex size-12 shrink-0 items-center justify-center rounded-md bg-action-subtle";

const registerIconWrapperClassName =
  "inline-flex size-icon-2xl shrink-0 text-text-accent *:size-full";
const backofficeIconWrapperClassName =
  "inline-flex size-icon-md shrink-0 text-text-subtle *:size-full";

// A disabled field keeps its resting look on the box itself; the wrapper's opacity communicates
// "disabled", so neither hover nor focus treatment applies here while it is set.
function boxStateClassName(disabled: boolean): string {
  if (disabled) {
    return "bg-surface inset-ring-2 inset-ring-border";
  }
  return (
    "bg-surface inset-ring-2 inset-ring-border " +
    "hover:not-focus-within:bg-surface-subtle " +
    "focus-within:inset-ring-action"
  );
}

export function SearchField(props: SearchFieldProps) {
  const { variant, value, onChange, placeholder, icon, label, disabled = false } = props;

  const leading =
    variant === "register" ? (
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
      className={wrapperClassName}
    >
      <div
        className={`${boxBaseClassName} ${frameClassName[variant]} ${boxStateClassName(disabled)}`}
      >
        {leading}
        <AriaInput
          placeholder={placeholder}
          className={`${inputBaseClassName} ${valueClassName[variant]}`}
        />
      </div>
    </AriaSearchField>
  );
}
