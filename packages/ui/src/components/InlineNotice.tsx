import type { ButtonIcon } from "./Button";
import { NoticeLiveRegion } from "./NoticeLiveRegion";

export type NoticeTone = "warning" | "info" | "error";

export const noticeToneClassName: Record<NoticeTone, string> = {
  warning: "bg-status-warning-message-bg text-status-warning-strong",
  info: "bg-brand-blue-message-bg text-brand-blue-strong",
  error: "bg-status-error-message-bg text-status-error-strong",
};

type NoticeContent = { title: string; detail?: string } | { title?: string; detail: string };

export type InlineNoticeProps = {
  tone: NoticeTone;
  icon: ButtonIcon;
} & NoticeContent;

// The icon's size is fixed by this span's CSS, not by cloning a `size` prop — only lucide icons
// interpret one.
const iconWrapperClassName = "inline-flex size-[1.125rem] shrink-0 [&>svg]:h-full [&>svg]:w-full";

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
        {title && <p className="text-base font-bold">{title}</p>}
        {detail && <p className="text-sm leading-[1.35]">{detail}</p>}
      </div>
      <NoticeLiveRegion
        assertiveness={tone === "error" ? "assertive" : "polite"}
        text={[title, detail].filter(Boolean).join(" ")}
      />
    </div>
  );
}
