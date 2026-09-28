import type { Icon } from "../shared/icon";
import { iconSlotClassName } from "../shared/icon";
import { type NoticeTone, toneClassName } from "../shared/tone";
import { NoticeFrame } from "./notice-frame";

type NoticeContent = { title: string; detail?: string } | { title?: string; detail: string };

export type InlineNoticeProps = {
  tone: NoticeTone;
  icon: Icon;
} & NoticeContent;

export function InlineNotice({ tone, icon, title, detail }: InlineNoticeProps) {
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
      announcement={[title, detail]}
    >
      {title ? <p className="text-body font-bold">{title}</p> : null}
      {detail ? <p className="text-detail leading-sm">{detail}</p> : null}
    </NoticeFrame>
  );
}
