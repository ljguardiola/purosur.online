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
  trailing?: ReactNode;
  actions?: ReactNode;
  actionsPlacement?: "below" | "end";
  children: ReactNode;
};

export function NoticeFrame({
  tone,
  className,
  icon,
  iconSize,
  iconBadgeClassName,
  announcement,
  trailing,
  actions,
  actionsPlacement = "below",
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
      {actions && actionsPlacement === "end" ? (
        <>
          <div aria-hidden="true" className="flex min-w-0 flex-1 flex-col gap-1">
            {children}
          </div>
          <div className="flex shrink-0 items-center gap-3">{actions}</div>
        </>
      ) : actions ? (
        <div className="flex flex-col gap-3">
          <div aria-hidden="true" className="flex flex-col gap-1">
            {children}
          </div>
          <div className="flex flex-wrap items-center gap-3">{actions}</div>
        </div>
      ) : (
        <div aria-hidden="true" className="flex flex-col gap-1">
          {children}
        </div>
      )}
      {trailing}
      <NoticeLiveRegion
        assertiveness={tone === "error" ? "assertive" : "polite"}
        text={announcement.filter(Boolean).join(" ")}
      />
    </div>
  );
}
