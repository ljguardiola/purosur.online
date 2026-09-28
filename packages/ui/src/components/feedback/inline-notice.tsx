import type { Icon } from "../shared/icon";
import { iconSlotClassName } from "../shared/icon";
import { type NoticeTone, toneClassName } from "../shared/tone";
import { NoticeFrame } from "./notice-frame";

type NoticeContent =
  | { title: string; description?: string }
  | { title?: string; description: string };

export type InlineNoticeProps = {
  tone: NoticeTone;
  icon: Icon;
} & NoticeContent;

export function InlineNotice({ tone, icon, title, description }: InlineNoticeProps) {
  const className = [
    "flex w-full items-start gap-3 rounded-lg py-3 px-4",
    toneClassName[tone].surface,
  ].join(" ");

  return (
    <NoticeFrame
      tone={tone}
      className={className}
      icon={
        <span aria-hidden="true" className={iconSlotClassName.md}>
          {icon}
        </span>
      }
      announcement={[title, description]}
    >
      {title ? <p className="text-body font-bold">{title}</p> : null}
      {description ? <p className="text-detail leading-sm">{description}</p> : null}
    </NoticeFrame>
  );
}
