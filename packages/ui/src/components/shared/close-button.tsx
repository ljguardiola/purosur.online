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

export function CloseButton({
  onPress,
  escapeKeycap = false,
}: {
  onPress: () => void;
  escapeKeycap?: boolean;
}) {
  return (
    <IconOnlyButton
      name={escapeKeycap ? "Cerrar con Esc" : "Cerrar"}
      onPress={onPress}
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
