import type { ButtonIcon } from "./Button";
import { NoticeLiveRegion } from "./NoticeLiveRegion";

export type NoticeTone = "warning" | "info" | "error";

export const noticeToneClassName: Record<NoticeTone, string> = {
  warning: "bg-warning-subtle text-warning-strong",
  info: "bg-info-subtle text-info-strong",
  error: "bg-error-subtle text-error-strong",
};

type NoticeContent = { title: string; detail?: string } | { title?: string; detail: string };

export type InlineNoticeProps = {
  tone: NoticeTone;
  icon: ButtonIcon;
} & NoticeContent;

const iconWrapperClassName = "inline-flex size-icon-md shrink-0 *:size-full";

export function InlineNotice({ tone, icon, title, detail }: InlineNoticeProps) {
  const className = [
    "flex w-full items-start gap-3 rounded-lg py-3 px-4",
    noticeToneClassName[tone],
  ].join(" ");

  return (
    <div className={className}>
      <span aria-hidden="true" className={iconWrapperClassName}>
        {icon}
      </span>
      {/* Hidden from assistive technology so its text isn't announced twice: the live region
          below is its only accessible copy. */}
      <div aria-hidden="true" className="flex flex-col gap-1">
        {title && <p className="text-body font-bold">{title}</p>}
        {detail && <p className="text-detail leading-sm">{detail}</p>}
      </div>
      <NoticeLiveRegion
        assertiveness={tone === "error" ? "assertive" : "polite"}
        text={[title, detail].filter(Boolean).join(" ")}
      />
    </div>
  );
}
