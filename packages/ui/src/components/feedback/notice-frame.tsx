import type { ReactNode } from "react";
import type { NoticeTone } from "../shared/tone";
import { NoticeLiveRegion } from "./notice-live-region";

export type NoticeFrameProps = {
  tone: NoticeTone;
  className: string;
  icon: ReactNode;
  announcement: ReadonlyArray<string | undefined>;
  children: ReactNode;
};

export function NoticeFrame({ tone, className, icon, announcement, children }: NoticeFrameProps) {
  return (
    <div className={className}>
      {icon}
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
