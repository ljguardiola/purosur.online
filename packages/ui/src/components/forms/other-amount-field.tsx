import { Input as AriaInput, TextField as AriaTextField } from "react-aria-components";
import { Keycap, type KeyName } from "../data-display/keycap";
import { disabledTextProps, fieldErrorClassName } from "./field-styles";
import { useDecimalTyping } from "./use-decimal-typing";

export type OtherAmountFieldProps = {
  label: string;
  prefix: string;
  placeholder: string;
  keyName?: KeyName | undefined;
  value: string;
  onChange: (value: string) => void;
  selected?: boolean;
  disabled?: boolean;
  errorMessage?: string | undefined;
};

const DECIMALS = 2;

export function OtherAmountField({
  label,
  prefix,
  placeholder,
  keyName,
  value,
  onChange,
  selected = false,
  disabled = false,
  errorMessage,
}: OtherAmountFieldProps) {
  const [attachInput, onDecimalChange] = useDecimalTyping(DECIMALS, onChange);
  return (
    <AriaTextField
      aria-label={label}
      value={value}
      onChange={onDecimalChange}
      isDisabled={disabled}
      isInvalid={errorMessage !== undefined}
      inputMode="decimal"
      className="flex min-w-0 flex-col gap-1 data-disabled:opacity-disabled"
    >
      <div
        className={
          `flex h-15 items-center gap-2 rounded-lg border px-3 focus-within:border-action ` +
          `${selected ? "border-action bg-action-subtle" : "border-border bg-surface"}`
        }
      >
        <span
          aria-hidden="true"
          {...disabledTextProps(disabled)}
          className="shrink-0 text-subheading font-bold text-text-subtle"
        >
          {prefix}
        </span>
        <AriaInput
          ref={attachInput}
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent text-right text-subheading font-bold text-text caret-focus outline-none placeholder:font-normal placeholder:text-text-subtle"
        />
        {keyName === undefined ? null : (
          <span aria-hidden="true" className="flex">
            <Keycap keyName={keyName} />
          </span>
        )}
      </div>
      {errorMessage === undefined ? null : (
        <span slot="errorMessage" className={fieldErrorClassName}>
          {errorMessage}
        </span>
      )}
    </AriaTextField>
  );
}
