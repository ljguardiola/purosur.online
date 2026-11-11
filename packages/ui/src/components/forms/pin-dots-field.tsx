import { type Ref, useEffect, useId, useRef } from "react";
import { mergeRefs } from "react-aria";
import { Keycap } from "../data-display/keycap";
import { fieldLabelClassName } from "./field-size";

export type PinDotsFieldProps = {
  label: string;
  value: string;
  onChange: (digits: string) => void;
  errorMessageId?: string | undefined;
  disabled?: boolean | undefined;
  autoFocus?: boolean | undefined;
  ref?: Ref<HTMLInputElement> | undefined;
};

const minimumDots = 6;

const dotClassName = {
  filled: "size-3.5 rounded-full bg-surface-inverse",
  empty: "size-3.5 rounded-full bg-border",
} as const;

function boxClassName(invalid: boolean): string {
  return (
    "relative flex h-16 items-center justify-center gap-4 rounded-lg bg-surface inset-ring-2 " +
    `${invalid ? "inset-ring-error" : "inset-ring-border"} focus-within:inset-ring-action`
  );
}

export function PinDotsField({
  label,
  value,
  onChange,
  errorMessageId,
  disabled = false,
  autoFocus = false,
  ref,
}: PinDotsFieldProps) {
  const labelId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocus) {
      inputRef.current?.focus();
    }
  }, [autoFocus]);
  const invalid = errorMessageId !== undefined;
  const dots = [];
  for (let slot = 0; slot < Math.max(minimumDots, value.length); slot += 1) {
    const state = slot < value.length ? "filled" : "empty";
    dots.push(<span key={slot} data-pin-slot={state} className={dotClassName[state]} />);
  }

  return (
    <div className={`flex flex-col gap-1.5 ${disabled ? "opacity-disabled" : ""}`}>
      <div className="flex items-center gap-2">
        <span id={labelId} className={fieldLabelClassName.register}>
          {label}
        </span>
        <Keycap keyName="Digits" />
      </div>
      <div className={boxClassName(invalid)}>
        {dots}
        <input
          ref={mergeRefs(inputRef, ref)}
          type="password"
          inputMode="numeric"
          autoComplete="off"
          aria-labelledby={labelId}
          aria-invalid={invalid ? true : undefined}
          aria-describedby={errorMessageId}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value.replace(/\D/g, ""))}
          className="absolute inset-0 size-full bg-transparent text-transparent caret-transparent outline-none"
        />
      </div>
    </div>
  );
}
