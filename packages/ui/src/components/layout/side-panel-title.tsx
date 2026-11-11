import { CloseButton } from "../shared/close-button";
import { type Icon, iconSlotClassName } from "../shared/icon";

export type SidePanelTitleProps = {
  icon: Icon;
  title: string;
  onClose?: (() => void) | undefined;
};

export function SidePanelTitle({ icon, title, onClose }: SidePanelTitleProps) {
  return (
    <div className="flex items-center gap-3 px-6 pt-6">
      <span
        aria-hidden="true"
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-soft text-text"
      >
        <span className={iconSlotClassName.lg}>{icon}</span>
      </span>
      <h2 className="flex-1 text-subheading font-bold text-text">{title}</h2>
      {onClose === undefined ? null : <CloseButton escapeKeycap onPress={onClose} />}
    </div>
  );
}
