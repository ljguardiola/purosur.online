import type { Ref } from "react";

const MINIMUM_SLOTS = 6;

export type PinFieldProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  errorMessageId?: string;
  ref?: Ref<HTMLInputElement>;
};

export function PinField({
  value,
  onChange,
  disabled = false,
  errorMessageId,
  ref,
}: PinFieldProps) {
  const invalid = errorMessageId !== undefined;
  const slots = Array.from({ length: Math.max(MINIMUM_SLOTS, value.length) }, (_, position) => ({
    id: `slot-${position}`,
    filled: position < value.length,
  }));
  const boxClassName = [
    "relative flex h-16 items-center gap-4 rounded-lg bg-surface px-4 inset-ring-2",
    invalid ? "inset-ring-error" : "inset-ring-border",
    "has-focus-visible:inset-ring-action has-focus-visible:focus-ring",
  ].join(" ");

  return (
    <label
      className={["flex flex-col gap-1.5", disabled ? "opacity-disabled" : ""]
        .filter(Boolean)
        .join(" ")}
    >
      <span className="text-body font-bold text-text">PIN</span>
      <span className={boxClassName}>
        {slots.map((slot) => (
          <span
            key={slot.id}
            aria-hidden="true"
            data-pin-slot={slot.filled ? "filled" : "empty"}
            className={[
              "size-4 shrink-0 rounded-full border-2 border-border-strong",
              slot.filled ? "bg-surface-inverse" : "bg-transparent",
            ].join(" ")}
          />
        ))}
        <input
          ref={ref}
          type="password"
          inputMode="numeric"
          autoComplete="off"
          disabled={disabled}
          value={value}
          aria-invalid={invalid ? true : undefined}
          aria-describedby={errorMessageId}
          onChange={(event) => onChange(event.target.value.replace(/\D/g, ""))}
          className="absolute inset-0 size-full cursor-text opacity-0 outline-none disabled:cursor-default"
        />
      </span>
    </label>
  );
}
