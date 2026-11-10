import { useId } from "react";
import { Button } from "../forms/button";
import { CloseButton } from "../shared/close-button";
import { type Icon, iconSlotClassName } from "../shared/icon";
import { Eyebrow } from "./eyebrow";
import { SidePanel } from "./side-panel";

export type ConfirmationPanelProps = {
  title: string;
  icon: Icon;
  fieldLabel: string;
  value: string;
  actionLabel: string;
  actionIcon: Icon;
  onClose: () => void;
  onConfirm: () => void;
};

export function ConfirmationPanel({
  title,
  icon,
  fieldLabel,
  value,
  actionLabel,
  actionIcon,
  onClose,
  onConfirm,
}: ConfirmationPanelProps) {
  const titleId = useId();
  return (
    <SidePanel
      label={title}
      header={
        <div className="flex items-center gap-3 px-8 pt-6">
          <span
            aria-hidden="true"
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-soft text-text"
          >
            <span className={iconSlotClassName.lg}>{icon}</span>
          </span>
          <h2 id={titleId} className="flex-1 text-subheading font-bold text-text">
            {title}
          </h2>
          <CloseButton onPress={onClose} escapeKeycap />
        </div>
      }
      footer={
        <Button size="large" fullWidth icon={actionIcon} keycap="Enter" onPress={onConfirm}>
          {actionLabel}
        </Button>
      }
    >
      <Eyebrow text={fieldLabel} />
      <p className="text-display text-text">{value}</p>
    </SidePanel>
  );
}
