import { type ReactNode, useContext } from "react";
import { Button as AriaButton } from "react-aria-components";
import { Keycap } from "../data-display/keycap";
import { CloseButton } from "../shared/close-button";
import { type Icon, iconSlotClassName } from "../shared/icon";
import { toneClassName } from "../shared/tone";
import { SidePanelInsetContext } from "./side-panel-inset";

export type SidePanelTitleProps = {
  icon: Icon;
  title: string;
  tone?: "neutral" | "warning";
  children?: ReactNode;
  close?: { onPress: () => void; label?: string; disabled?: boolean };
};

const labelledCloseClassName =
  "flex h-control-lg shrink-0 items-center gap-2 rounded-lg px-1 text-body font-semibold " +
  "text-text-accent outline-none data-focus-visible:focus-ring data-disabled:opacity-disabled";

export function SidePanelTitle({
  icon,
  title,
  tone = "neutral",
  children,
  close,
}: SidePanelTitleProps) {
  const horizontalInset = useContext(SidePanelInsetContext);

  return (
    <div className={`flex items-center gap-3 pt-6 ${horizontalInset}`}>
      <span
        aria-hidden="true"
        className={`flex size-10 shrink-0 items-center justify-center rounded-full ${tone === "warning" ? toneClassName.warning.surface : "bg-surface-soft text-text"}`}
      >
        <span className={iconSlotClassName.lg}>{icon}</span>
      </span>
      <h2 className="flex-1 text-subheading font-bold text-text">{title}</h2>
      {children}
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
