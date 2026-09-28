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
  success: "border-l-brand-green",
  warning: "border-l-status-warning-accent",
  error: "border-l-status-error-accent",
};

const toneCircleClassName: Record<NotificationTone, string> = {
  success: "bg-brand-green-message-bg text-brand-green-strong",
  warning: "bg-status-warning-message-bg text-status-warning-strong",
  error: "bg-status-error-message-bg text-status-error-strong",
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
    "flex items-start gap-3 rounded-lg border-l-4 bg-surface-white p-4",
    toneBorderClassName[tone],
    floating ? "w-[24.25rem] shadow-[0_6px_20px_var(--color-ink-shadow)]" : "w-full",
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
        <p className="text-base font-bold text-ink">{title}</p>
        <p className="text-sm text-ink-secondary">{detail}</p>
        {whatToDo ? <p className="text-sm font-semibold text-ink">{whatToDo}</p> : null}
        {time ? <p className="text-xs text-ink-secondary">{time}</p> : null}
      </div>
      <NoticeLiveRegion
        assertiveness={tone === "error" ? "assertive" : "polite"}
        text={[title, detail, whatToDo, time].filter(Boolean).join(" ")}
      />
    </div>
  );
}
