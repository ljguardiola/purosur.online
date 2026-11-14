import type { ReactNode } from "react";
import { Button as AriaButton } from "react-aria-components";
import { Keycap } from "../data-display/keycap";
import { iconSlotClassName } from "../shared/icon";

export type ModePillProps = {
  icon: ReactNode;
  label: string;
  onExit: () => void;
};

const pillClassName =
  "inline-flex items-center gap-2 rounded-lg bg-border-accent py-1 pr-1 pl-3 text-detail font-bold " +
  "text-text-inverse outline-none data-focus-visible:focus-ring";

export function ModePill({ icon, label, onExit }: ModePillProps) {
  return (
    <AriaButton onPress={onExit} className={pillClassName}>
      <span aria-hidden="true" className={iconSlotClassName.sm}>
        {icon}
      </span>
      {label}
      <span aria-hidden="true" className="inline-flex">
        <Keycap keyName="Escape" variant="onPrimary" />
      </span>
    </AriaButton>
  );
}
