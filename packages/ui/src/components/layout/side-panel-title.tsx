import { type Icon, iconSlotClassName } from "../shared/icon";

export type SidePanelTitleProps = {
  icon: Icon;
  title: string;
};

export function SidePanelTitle({ icon, title }: SidePanelTitleProps) {
  return (
    <div className="flex items-center gap-3 px-8 pt-6">
      <span
        aria-hidden="true"
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-soft text-text"
      >
        <span className={iconSlotClassName.lg}>{icon}</span>
      </span>
      <h2 className="flex-1 text-subheading font-bold text-text">{title}</h2>
    </div>
  );
}
