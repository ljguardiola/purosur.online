import type { ButtonIcon } from "./Button";
import { NoticeLiveRegion } from "./NoticeLiveRegion";

export type NoticeTone = "warning" | "info" | "error";

// Background and text/icon color are the same pair for every tone across the notice family
// (see contrast.test.ts's shared toneOnMessageBackgroundPairs), so it is defined once here and
// reused instead of duplicated per component.
export const noticeToneClassName: Record<NoticeTone, string> = {
  warning: "bg-status-warning-message-bg text-status-warning-strong",
  info: "bg-brand-blue-message-bg text-brand-blue-strong",
  error: "bg-status-error-message-bg text-status-error-strong",
};

type NoticeContent = { title: string; detail?: string } | { title?: string; detail: string };

// A notice with neither a title nor a detail would have nothing to say, so the type only accepts
// a value that supplies at least one of them.
export type InlineNoticeProps = {
  tone: NoticeTone;
  icon: ButtonIcon;
} & NoticeContent;

// See Button.tsx's iconWrapperClassName: the glyph's size is imposed by this box's own CSS,
// never by cloning a `size` prop onto the caller's icon element.
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
