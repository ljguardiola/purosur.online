import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { NoticeTone } from "../shared/tone";
import { NotificationCard, type NotificationCardProps } from "./notification-card";

export type FloatingNotificationProps = Omit<NotificationCardProps, "onClose"> & {
  onDismiss: () => void;
  expiresAfterSeconds?: number;
};

const DEFAULT_LIFETIME_SECONDS = 5;

const defaultLifetimeSeconds: Record<NoticeTone, number | undefined> = {
  success: DEFAULT_LIFETIME_SECONDS,
  info: DEFAULT_LIFETIME_SECONDS,
  warning: DEFAULT_LIFETIME_SECONDS,
  error: undefined,
};

export function FloatingNotification({
  onDismiss,
  expiresAfterSeconds,
  ...card
}: FloatingNotificationProps) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);

  const lifetimeSeconds = expiresAfterSeconds ?? defaultLifetimeSeconds[card.tone];
  const paused = hovered || focused;

  useEffect(() => {
    if (lifetimeSeconds === undefined || paused) return;
    const timeout = setTimeout(onDismiss, lifetimeSeconds * 1000);
    return () => clearTimeout(timeout);
  }, [lifetimeSeconds, paused, onDismiss]);

  return createPortal(
    <div
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
      className="fixed right-6 bottom-6 z-overlay w-97 rounded-lg shadow-md"
    >
      <NotificationCard {...card} onClose={onDismiss} />
    </div>,
    document.body,
  );
}
