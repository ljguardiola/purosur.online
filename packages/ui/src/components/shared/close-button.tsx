import { X } from "lucide-react";
import { iconSlotClassName } from "./icon";
import { IconOnlyButton } from "./icon-only-button";

const closeButtonClassName =
  "flex size-control-lg shrink-0 items-center justify-center rounded-full bg-surface-subtle text-text-subtle " +
  "transition-background outline-none data-hovered:bg-surface-soft " +
  "data-focus-visible:focus-ring";

export function CloseButton({ onPress }: { onPress: () => void }) {
  return (
    <IconOnlyButton name="Cerrar" onPress={onPress} className={closeButtonClassName}>
      <span className={iconSlotClassName.lg}>
        <X aria-hidden="true" />
      </span>
    </IconOnlyButton>
  );
}
