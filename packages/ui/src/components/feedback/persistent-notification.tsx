import { createPortal } from "react-dom";
import { NotificationCard, type NotificationCardProps } from "./notification-card";

export type PersistentNotificationProps = Omit<NotificationCardProps, "onClose" | "action"> &
  Required<Pick<NotificationCardProps, "action">>;

export function PersistentNotification(card: PersistentNotificationProps) {
  return createPortal(
    <div className="fixed top-6 left-1/2 z-overlay w-97 -translate-x-1/2 rounded-lg shadow-md">
      <NotificationCard {...card} />
    </div>,
    document.body,
  );
}
