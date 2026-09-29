import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Group } from "react-aria-components";
import { createPortal } from "react-dom";
import type { NoticeTone } from "../shared/tone";
import { NotificationCard, type NotificationCardProps } from "./notification-card";

export type FloatingNotificationProps = Omit<NotificationCardProps, "onClose"> & {
  onDismiss: () => void;
  expiresAfterSeconds?: number | undefined;
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
  // A given lifetime is when the notice stops being true, so reading it cannot extend it.
  const paused = expiresAfterSeconds === undefined && (hovered || focused);
  const dismiss = useEffectEvent(onDismiss);
  const focusBeforeEntering = useRef<HTMLElement | null>(null);

  const close = () => {
    const returnTo = focusBeforeEntering.current;
    if (focused && returnTo?.isConnected) returnTo.focus();
    onDismiss();
  };

  useEffect(() => {
    if (lifetimeSeconds === undefined || paused) return;
    const timeout = setTimeout(dismiss, lifetimeSeconds * 1000);
    return () => clearTimeout(timeout);
  }, [lifetimeSeconds, paused]);

  return createPortal(
    <Group
      onHoverChange={setHovered}
      onFocus={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          focusBeforeEntering.current =
            event.relatedTarget instanceof HTMLElement ? event.relatedTarget : null;
        }
        setFocused(true);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
      className="fixed right-6 bottom-6 z-overlay w-97 rounded-lg shadow-md"
    >
      <NotificationCard {...card} onClose={close} />
    </Group>,
    document.body,
  );
}
