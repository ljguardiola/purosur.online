import type { ReactElement } from "react";
import { Input as AriaInput, SearchField as AriaSearchField } from "react-aria-components";

export type SearchFieldVariant = "register" | "backoffice";

// See Button.tsx's own ButtonIcon: the wrapper imposes the icon's size with CSS instead of
// cloning a `size` prop onto it, so `size` is left out of what a caller's icon can declare.
export type SearchFieldIcon = ReactElement<{ className?: string }>;

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

// No visible label sits above the box in either variant, so the wrapper only needs to carry the
// disabled dimming — unlike TextField.tsx's own wrapper, which also stacks a label above it.
const wrapperClassName = "data-[disabled]:opacity-[0.45]";

const boxBaseClassName = "flex items-center rounded-lg outline-none";

// Height, horizontal padding and gap per variant, in the exact px the design specifies.
const frameClassName: Record<SearchFieldVariant, string> = {
  register: "h-16 gap-4 px-2",
  backoffice: "h-11 gap-2 px-3",
};

const inputBaseClassName =
  "min-w-0 flex-1 bg-transparent caret-brand-blue-strong outline-none placeholder:text-ink-secondary";

const valueClassName: Record<SearchFieldVariant, string> = {
  register: "text-xl font-normal text-ink",
  backoffice: "text-sm font-normal text-ink",
};

// The register variant wraps its icon in a 48px chip filled with the brand-blue message
// background; the backoffice variant renders a bare icon with no chip behind it.
const chipClassName =
  "inline-flex size-12 shrink-0 items-center justify-center rounded-md bg-brand-blue-message-bg";

const registerIconWrapperClassName =
  "inline-flex size-[1.625rem] shrink-0 text-brand-blue-strong [&>svg]:h-full [&>svg]:w-full";
const backofficeIconWrapperClassName =
  "inline-flex size-[1.125rem] shrink-0 text-ink-secondary [&>svg]:h-full [&>svg]:w-full";

// The box's own border and shadow per interaction state, copied verbatim from TextField.tsx's
// own boxStateClassName (see the comment there for why an inset box-shadow stands in for a real
// border, and why hover is suppressed once focused regardless of stylesheet order). A disabled
// field keeps its resting look on the box itself; the wrapper's opacity is what communicates
// "disabled", so neither hover nor focus treatment applies here while it is set.
function boxStateClassName(disabled: boolean): string {
  if (disabled) {
    return "bg-surface-white shadow-[inset_0_0_0_2px_var(--color-ink-secondary)]";
  }
  return (
    "bg-surface-white shadow-[inset_0_0_0_2px_var(--color-ink-secondary)] " +
    "hover:not-focus-within:bg-surface-bone " +
    "focus-within:shadow-[inset_0_0_0_3px_var(--color-brand-blue-strong),0_0_0_4px_var(--color-brand-blue-ui-shadow)]"
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
