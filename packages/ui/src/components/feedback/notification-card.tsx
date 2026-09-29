import type { Icon } from "../shared/icon";
import { type NoticeTone, toneClassName } from "../shared/tone";
import { NoticeFrame } from "./notice-frame";

export type NotificationCardProps = {
  tone: NoticeTone;
  icon: Icon;
  title: string;
  description: string;
  whatToDo?: string;
  time?: string;
  floating?: boolean;
};

export function NotificationCard({
  tone,
  icon,
  title,
  description,
  whatToDo,
  time,
  floating = false,
}: NotificationCardProps) {
  const className = [
    "flex items-start gap-3 rounded-lg border-l-4 bg-surface p-4",
    toneClassName[tone].startBorder,
    floating ? "w-97 shadow-md" : "w-full",
  ].join(" ");

  const circleClassName = [
    "flex size-8 shrink-0 items-center justify-center rounded-full",
    toneClassName[tone].surface,
  ].join(" ");

  return (
    <NoticeFrame
      tone={tone}
      className={className}
      icon={icon}
      iconSize="md"
      iconBadgeClassName={circleClassName}
      announcement={[title, description, whatToDo, time]}
    >
      <p className="text-body font-bold text-text">{title}</p>
      <p className="text-detail text-text-subtle">{description}</p>
      {whatToDo ? <p className="text-detail font-semibold text-text">{whatToDo}</p> : null}
      {time ? <p className="text-caption text-text-subtle">{time}</p> : null}
    </NoticeFrame>
  );
}
