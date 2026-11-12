import { TriangleAlert } from "lucide-react";
import { SummaryRowGroup } from "../data-display/summary-row-group";
import { InlineNotice } from "../feedback/inline-notice";
import { Button } from "../forms/button";
import type { Icon } from "../shared/icon";
import { Eyebrow } from "./eyebrow";
import { SidePanel } from "./side-panel";
import { SidePanelTitle, type SidePanelTitleTone } from "./side-panel-title";

type ConfirmationDetail = { label: string; value: string };

export type ConfirmationPanelProps = {
  title: string;
  icon: Icon;
  fieldLabel: string;
  value: string;
  actionLabel: string;
  actionIcon: Icon;
  tone?: SidePanelTitleTone;
  locked?: boolean;
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
  locked = false,
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
        <SidePanelTitle
          title={title}
          icon={icon}
          tone={tone}
          locked={locked}
          onClose={onClose}
          closeDisabled={busy}
        />
      }
      footer={
        <Button
          size="large"
          fullWidth
          icon={actionIcon}
          iconPosition="start"
          keycap="Enter"
          destructive={tone === "error"}
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
