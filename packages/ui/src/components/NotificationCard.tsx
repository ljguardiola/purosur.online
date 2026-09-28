import type { ButtonIcon } from "./Button";
import { NoticeLiveRegion } from "./NoticeLiveRegion";

export type NotificationTone = "success" | "warning" | "error";

export type NotificationCardProps = {
  tone: NotificationTone;
  icon: ButtonIcon;
  title: string;
  detail: string;
  whatToDo?: string;
  time?: string;
  floating?: boolean;
};

const toneBorderClassName: Record<NotificationTone, string> = {
  success: "border-l-success-soft",
  warning: "border-l-warning-soft",
  error: "border-l-error-soft",
};

const toneCircleClassName: Record<NotificationTone, string> = {
  success: "bg-success-subtle text-success-strong",
  warning: "bg-warning-subtle text-warning-strong",
  error: "bg-error-subtle text-error-strong",
};

const iconWrapperClassName = "inline-flex size-[1.125rem] shrink-0 [&>svg]:h-full [&>svg]:w-full";

export function NotificationCard({
  tone,
  icon,
  title,
  detail,
  whatToDo,
  time,
  floating = false,
}: NotificationCardProps) {
  const className = [
    "flex items-start gap-3 rounded-lg border-l-4 bg-surface p-4",
    toneBorderClassName[tone],
    floating ? "w-[24.25rem] shadow-[0_6px_20px_var(--palette-neutral-900-a12)]" : "w-full",
  ].join(" ");

  const circleClassName = [
    "flex size-8 shrink-0 items-center justify-center rounded-full",
    toneCircleClassName[tone],
  ].join(" ");

  return (
    <div className={className}>
      <span aria-hidden="true" className={circleClassName}>
        <span className={iconWrapperClassName}>{icon}</span>
      </span>
      {/* Hidden from assistive technology so its text isn't announced twice: the live region
          below is its only accessible copy. */}
      <div aria-hidden="true" className="flex flex-col gap-1">
        <p className="text-base font-bold text-text">{title}</p>
        <p className="text-sm text-text-subtle">{detail}</p>
        {whatToDo && <p className="text-sm font-semibold text-text">{whatToDo}</p>}
        {time && <p className="text-xs text-text-subtle">{time}</p>}
      </div>
      <NoticeLiveRegion
        assertiveness={tone === "error" ? "assertive" : "polite"}
        text={[title, detail, whatToDo, time].filter(Boolean).join(" ")}
      />
    </div>
  );
}
