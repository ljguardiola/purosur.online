import { X } from "lucide-react";
import { Button as AriaButton } from "react-aria-components";
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
  "flex h-control-lg shrink-0 items-center gap-2 rounded-lg px-1 text-detail font-semibold text-text-accent " +
  "outline-none data-disabled:opacity-disabled data-focus-visible:focus-ring";

export function CloseButton({
  onPress,
  escapeKeycap = false,
  label,
  disabled = false,
}: {
  onPress: () => void;
  escapeKeycap?: boolean;
  label?: string | undefined;
  disabled?: boolean;
}) {
  if (escapeKeycap && label !== undefined) {
    return (
      <AriaButton onPress={onPress} isDisabled={disabled} className={labelledCloseButtonClassName}>
        <span aria-hidden="true">
          <Keycap keyName="Escape" />
        </span>
        {label}
      </AriaButton>
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
