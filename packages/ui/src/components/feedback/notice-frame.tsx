import type { ReactNode } from "react";
import { type Icon, iconSlotClassName } from "../shared/icon";
import type { NoticeTone } from "../shared/tone";
import { NoticeLiveRegion } from "./notice-live-region";

export type NoticeFrameProps = {
  tone: NoticeTone;
  className: string;
  icon: Icon;
  iconSize: keyof typeof iconSlotClassName;
  iconBadgeClassName?: string;
  announcement: ReadonlyArray<string | undefined>;
  children: ReactNode;
};

export function NoticeFrame({
  tone,
  className,
  icon,
  iconSize,
  iconBadgeClassName,
  announcement,
  children,
}: NoticeFrameProps) {
  return (
    <div className={className}>
      {iconBadgeClassName === undefined ? (
        <span aria-hidden="true" className={iconSlotClassName[iconSize]}>
          {icon}
        </span>
      ) : (
        <span aria-hidden="true" className={iconBadgeClassName}>
          <span className={iconSlotClassName[iconSize]}>{icon}</span>
        </span>
      )}
      {/* Hidden from assistive technology so its text isn't announced twice: the live region
          below is its only accessible copy. */}
      <div aria-hidden="true" className="flex flex-col gap-1">
        {children}
      </div>
      <NoticeLiveRegion
        assertiveness={tone === "error" ? "assertive" : "polite"}
        text={announcement.filter(Boolean).join(" ")}
      />
    </div>
  );
}
