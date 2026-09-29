import { X } from "lucide-react";
import { Button as AriaButton } from "react-aria-components";
import { iconSlotClassName } from "./icon";

const closeButtonClassName =
  "flex size-control-lg shrink-0 items-center justify-center rounded-full bg-surface-subtle text-text-subtle " +
  "transition-background outline-none data-hovered:bg-surface-soft " +
  "data-focus-visible:focus-ring";

export function CloseButton({ onPress }: { onPress: () => void }) {
  return (
    <AriaButton aria-label="Cerrar" onPress={onPress} className={closeButtonClassName}>
      <span className={iconSlotClassName.lg}>
        <X aria-hidden="true" />
      </span>
    </AriaButton>
  );
}
