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

const wrapperClassName = "data-[disabled]:opacity-[0.45]";

const boxBaseClassName = "flex items-center rounded-lg outline-none";

const frameClassName: Record<SearchFieldVariant, string> = {
  register: "h-16 gap-4 px-2",
  backoffice: "h-11 gap-2 px-3",
};

// The field is a type="search" input, so Chromium paints its own clear button inside it as soon
// as it holds a value, and Tailwind's preflight resets ::-webkit-search-decoration only. Neither
// variant draws a clear affordance, so that button is taken out of the input altogether.
const inputBaseClassName =
  "min-w-0 flex-1 bg-transparent caret-brand-blue-strong outline-none " +
  "placeholder:text-ink-secondary [&::-webkit-search-cancel-button]:hidden";

const valueClassName: Record<SearchFieldVariant, string> = {
  register: "text-xl font-normal text-ink",
  backoffice: "text-sm font-normal text-ink",
};

const chipClassName =
  "inline-flex size-12 shrink-0 items-center justify-center rounded-md bg-brand-blue-message-bg";

const registerIconWrapperClassName =
  "inline-flex size-[1.625rem] shrink-0 text-brand-blue-strong [&>svg]:h-full [&>svg]:w-full";
const backofficeIconWrapperClassName =
  "inline-flex size-[1.125rem] shrink-0 text-ink-secondary [&>svg]:h-full [&>svg]:w-full";

// The box's own border and shadow per interaction state, using the same inset-box-shadow
// technique as TextField.tsx's own boxStateClassName (see the comment there for why it stands in
// for a real border, and why hover is suppressed once focused regardless of stylesheet order). A
// disabled field keeps its resting look on the box itself; the wrapper's opacity is what
// communicates "disabled", so neither hover nor focus treatment applies here while it is set. Both
// variants draw the same box, following TextField.tsx's own line/brand-blue-ui system, with no
// outer shadow on focus.
function boxStateClassName(disabled: boolean): string {
  if (disabled) {
    return "bg-surface-white shadow-[inset_0_0_0_2px_var(--color-line)]";
  }
  return (
    "bg-surface-white shadow-[inset_0_0_0_2px_var(--color-line)] " +
    "hover:not-focus-within:bg-surface-bone " +
    "focus-within:shadow-[inset_0_0_0_2px_var(--color-brand-blue-ui)]"
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
