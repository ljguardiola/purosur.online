import { useContext } from "react";
import { CloseButton } from "../shared/close-button";
import { type Icon, iconSlotClassName } from "../shared/icon";
import { toneClassName } from "../shared/tone";
import { SidePanelInsetContext } from "./side-panel-inset";

export type SidePanelTitleProps = {
  icon: Icon;
  title: string;
  tone?: "neutral" | "warning";
  onClose?: (() => void) | undefined;
  closeDisabled?: boolean;
  closeLabel?: string;
};

export function SidePanelTitle({
  icon,
  title,
  tone = "neutral",
  onClose,
  closeDisabled = false,
  closeLabel,
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
      {onClose === undefined ? null : (
        <CloseButton escapeKeycap label={closeLabel} disabled={closeDisabled} onPress={onClose} />
      )}
    </div>
  );
}
