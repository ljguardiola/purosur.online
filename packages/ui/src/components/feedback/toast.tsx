import { useEffect, useEffectEvent } from "react";
import type { Icon } from "../shared/icon";
import { type NoticeTone, toneClassName } from "../shared/tone";
import { NoticeFrame } from "./notice-frame";

export type ToastProps = {
  tone: NoticeTone;
  icon: Icon;
  title: string;
  description: string;
  onDismiss: () => void;
};

const LIFETIME_MS = 5000;

export function Toast({ tone, icon, title, description, onDismiss }: ToastProps) {
  const dismiss = useEffectEvent(onDismiss);
  const expires = tone !== "error";

  useEffect(() => {
    if (!expires) return;
    const timeout = setTimeout(dismiss, LIFETIME_MS);
    return () => clearTimeout(timeout);
  }, [expires]);

  const circleClassName = [
    "flex size-8 shrink-0 items-center justify-center rounded-full",
    toneClassName[tone].surface,
  ].join(" ");

  return (
    <NoticeFrame
      tone={tone}
      className="flex w-95 items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3 shadow-md"
      icon={icon}
      iconSize="sm"
      iconBadgeClassName={circleClassName}
      announcement={[title, description]}
    >
      <p className="text-body font-bold text-text">{title}</p>
      <p className="text-detail font-semibold leading-sm text-text">{description}</p>
    </NoticeFrame>
  );
}
