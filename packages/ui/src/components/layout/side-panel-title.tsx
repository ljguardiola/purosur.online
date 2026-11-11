import { Button as AriaButton } from "react-aria-components";
import { Keycap } from "../data-display/keycap";
import { CloseButton } from "../shared/close-button";
import { type Icon, iconSlotClassName } from "../shared/icon";

export type SidePanelTitleProps = {
  icon: Icon;
  title: string;
  close?: { onPress: () => void; label?: string; disabled?: boolean };
};

const labelledCloseClassName =
  "flex h-control-lg shrink-0 items-center gap-2 rounded-lg px-1 text-body font-semibold " +
  "text-text-accent outline-none data-focus-visible:focus-ring data-disabled:opacity-disabled";

export function SidePanelTitle({ icon, title, close }: SidePanelTitleProps) {
  return (
    <div className="flex items-center gap-3 px-6 pt-6">
      <span
        aria-hidden="true"
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-soft text-text"
      >
        <span className={iconSlotClassName.lg}>{icon}</span>
      </span>
      <h2 className="flex-1 text-subheading font-bold text-text">{title}</h2>
      {close === undefined ? null : close.label === undefined ? (
        <CloseButton onPress={close.onPress} escapeKeycap disabled={close.disabled ?? false} />
      ) : (
        <AriaButton
          onPress={close.onPress}
          isDisabled={close.disabled ?? false}
          className={labelledCloseClassName}
        >
          <span aria-hidden="true" className="flex">
            <Keycap keyName="Escape" />
          </span>
          {close.label}
        </AriaButton>
      )}
    </div>
  );
}
