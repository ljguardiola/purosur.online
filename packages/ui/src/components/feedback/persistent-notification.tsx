import { createPortal } from "react-dom";
import { NotificationCard, type NotificationCardProps } from "./notification-card";

export type PersistentNotificationProps = Omit<NotificationCardProps, "onClose" | "action"> &
  Required<Pick<NotificationCardProps, "action">>;

export function PersistentNotification(card: PersistentNotificationProps) {
  return createPortal(
    <div className="fixed right-6 bottom-6 z-overlay w-97 rounded-lg shadow-md">
      <NotificationCard {...card} />
    </div>,
    document.body,
  );
}
