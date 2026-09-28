import type { ButtonIcon } from "../forms/button";
import { type NoticeTone, noticeToneClassName } from "./inline-notice";
import { NoticeLiveRegion } from "./notice-live-region";

export type HighlightedNoticeProps = {
  tone: NoticeTone;
  icon: ButtonIcon;
  title: string;
  detail: string;
};

const iconWrapperClassName = "inline-flex size-icon-lg shrink-0 *:size-full";

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
        <p className="text-subheading">{title}</p>
        <p className="text-detail leading-sm">{detail}</p>
      </div>
      <NoticeLiveRegion
        assertiveness={tone === "error" ? "assertive" : "polite"}
        text={`${title} ${detail}`}
      />
    </div>
  );
}
