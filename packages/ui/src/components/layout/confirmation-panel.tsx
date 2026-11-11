import { TriangleAlert } from "lucide-react";
import { SummaryRowGroup } from "../data-display/summary-row-group";
import { InlineNotice } from "../feedback/inline-notice";
import { Button } from "../forms/button";
import { CloseButton } from "../shared/close-button";
import { type Icon, iconSlotClassName } from "../shared/icon";
import { toneClassName } from "../shared/tone";
import { Eyebrow } from "./eyebrow";
import { SidePanel } from "./side-panel";

type ConfirmationDetail = { label: string; value: string };

export type ConfirmationPanelProps = {
  title: string;
  icon: Icon;
  fieldLabel: string;
  value: string;
  actionLabel: string;
  actionIcon: Icon;
  tone?: "neutral" | "warning";
  details?: readonly [ConfirmationDetail, ...ConfirmationDetail[]];
  notice?: string;
  busy?: boolean;
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
  tone = "neutral",
  details,
  notice,
  busy = false,
  onClose,
  onConfirm,
}: ConfirmationPanelProps) {
  return (
    <SidePanel
      label={title}
      header={
        <div className="flex items-center gap-3 px-8 pt-6">
          <span
            aria-hidden="true"
            className={`flex size-10 shrink-0 items-center justify-center rounded-full ${tone === "warning" ? toneClassName.warning.surface : "bg-surface-soft text-text"}`}
          >
            <span className={iconSlotClassName.lg}>{icon}</span>
          </span>
          <h2 className="flex-1 text-subheading font-bold text-text">{title}</h2>
          <CloseButton onPress={onClose} escapeKeycap disabled={busy} />
        </div>
      }
      footer={
        <Button
          size="large"
          fullWidth
          icon={actionIcon}
          iconPosition="start"
          keycap="Enter"
          disabled={busy}
          onPress={onConfirm}
        >
          {actionLabel}
        </Button>
      }
    >
      <Eyebrow text={fieldLabel} />
      <p className="text-hero text-text">{value}</p>
      {details === undefined ? null : <SummaryRowGroup rows={details} />}
      {notice === undefined ? null : (
        <InlineNotice tone="error" icon={<TriangleAlert />} title={notice} />
      )}
    </SidePanel>
  );
}
