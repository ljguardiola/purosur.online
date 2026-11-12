import { X } from "lucide-react";
import { Keycap } from "../data-display/keycap";
import { iconSlotClassName } from "./icon";
import { IconOnlyButton } from "./icon-only-button";

const closeButtonClassName =
  "flex size-control-lg shrink-0 items-center justify-center rounded-full bg-surface-subtle text-text-subtle " +
  "transition-background outline-none data-hovered:bg-surface-soft " +
  "data-focus-visible:focus-ring";

export const escapeKeycapButtonClassName =
  "flex h-control-lg shrink-0 items-center justify-center rounded-lg px-1 outline-none " +
  "data-focus-visible:focus-ring";

const labelledCloseButtonClassName =
  "flex h-control-lg shrink-0 items-center rounded-lg px-1 text-body font-bold text-info outline-none " +
  "data-focus-visible:focus-ring";

export function CloseButton({
  onPress,
  escapeKeycap = false,
  disabled = false,
  label,
}: {
  onPress: () => void;
  escapeKeycap?: boolean;
  disabled?: boolean;
  label?: string;
}) {
  if (escapeKeycap && label !== undefined) {
    return (
      <span className="flex shrink-0 items-center gap-2">
        <span aria-hidden="true">
          <Keycap keyName="Escape" />
        </span>
        <IconOnlyButton
          name={label}
          onPress={onPress}
          disabled={disabled}
          className={labelledCloseButtonClassName}
        >
          {label}
        </IconOnlyButton>
      </span>
    );
  }
  return (
    <IconOnlyButton
      name={escapeKeycap ? "Cerrar con Esc" : "Cerrar"}
      onPress={onPress}
      disabled={disabled}
      className={escapeKeycap ? escapeKeycapButtonClassName : closeButtonClassName}
    >
      {escapeKeycap ? (
        <Keycap keyName="Escape" />
      ) : (
        <span className={iconSlotClassName.lg}>
          <X aria-hidden="true" />
        </span>
      )}
    </IconOnlyButton>
  );
}
