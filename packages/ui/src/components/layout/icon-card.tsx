import { type Icon, iconSlotClassName } from "../shared/icon";

export type IconCardProps = {
  icon: Icon;
  label: string;
};

export function IconCard({ icon, label }: IconCardProps) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center rounded-lg border border-border bg-surface">
      <span
        role="img"
        aria-label={label}
        className="flex size-control-6xl shrink-0 items-center justify-center rounded-full bg-surface-soft text-text-eyebrow"
      >
        <span aria-hidden="true" className={iconSlotClassName["3xl"]}>
          {icon}
        </span>
      </span>
    </div>
  );
}
