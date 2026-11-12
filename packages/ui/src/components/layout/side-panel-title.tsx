import { Lock } from "lucide-react";
import { useContext } from "react";
import { CloseButton } from "../shared/close-button";
import { type Icon, iconSlotClassName } from "../shared/icon";
import { type Tone, toneClassName } from "../shared/tone";
import { SidePanelInsetContext } from "./side-panel-inset";

export type SidePanelTitleTone = Extract<Tone, "neutral" | "warning" | "error">;

export type SidePanelTitleProps = {
  icon: Icon;
  title: string;
  tone?: SidePanelTitleTone;
  onClose?: (() => void) | undefined;
  closeDisabled?: boolean;
  locked?: boolean;
  closeLabel?: string;
};

const badgeToneClassName = {
  neutral: "bg-surface-soft text-text",
  warning: toneClassName.warning.surface,
  error: toneClassName.error.surface,
} satisfies Record<SidePanelTitleTone, string>;

export function SidePanelTitle({
  icon,
  title,
  tone = "neutral",
  onClose,
  closeDisabled = false,
  locked = false,
  closeLabel,
}: SidePanelTitleProps) {
  const horizontalInset = useContext(SidePanelInsetContext);

  return (
    <div className={`flex items-center gap-3 pt-6 ${horizontalInset}`}>
      <span
        aria-hidden="true"
        className={`flex size-10 shrink-0 items-center justify-center rounded-full ${badgeToneClassName[tone]}`}
      >
        <span className={iconSlotClassName.lg}>{icon}</span>
      </span>
      <h2 className="flex flex-1 items-center gap-2 text-subheading font-bold text-text">
        {title}
        {locked ? (
          <>
            <Lock aria-hidden="true" className="size-icon-md shrink-0 text-text-subtle" />
            <span className="sr-only">{" Pide autorización"}</span>
          </>
        ) : null}
      </h2>
      {onClose === undefined ? null : (
        <CloseButton escapeKeycap label={closeLabel} disabled={closeDisabled} onPress={onClose} />
      )}
    </div>
  );
}
