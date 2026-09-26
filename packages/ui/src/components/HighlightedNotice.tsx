import type { ButtonIcon } from "./Button";
import { type NoticeTone, noticeToneClassName } from "./InlineNotice";
import { NoticeLiveRegion } from "./NoticeLiveRegion";

export type HighlightedNoticeProps = {
  tone: NoticeTone;
  icon: ButtonIcon;
  title: string;
  detail: string;
};

// The icon's size is fixed by this span's CSS, not by cloning a `size` prop — only lucide icons
// interpret one.
const iconWrapperClassName = "inline-flex size-5 shrink-0 [&>svg]:h-full [&>svg]:w-full";

export function HighlightedNotice({ tone, icon, title, detail }: HighlightedNoticeProps) {
  const className = [
    "flex w-full items-start gap-3 rounded-lg p-4",
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
        <p className="text-lg font-bold">{title}</p>
        <p className="text-sm leading-[1.35]">{detail}</p>
      </div>
      <NoticeLiveRegion
        assertiveness={tone === "error" ? "assertive" : "polite"}
        text={`${title} ${detail}`}
      />
    </div>
  );
}
