import type { ReactNode } from "react";
import {
  Dialog as AriaDialog,
  DialogTrigger as AriaDialogTrigger,
  Heading as AriaHeading,
  Popover as AriaPopover,
} from "react-aria-components";
import { CloseButton } from "../shared/close-button";

export type NotificationPanelProps = {
  title: string;
  trigger: ReactNode;
  children: ReactNode;
};

const popoverClassName =
  "w-105 rounded-xl border border-border bg-surface p-4 shadow-lg outline-none";

export function NotificationPanel({ title, trigger, children }: NotificationPanelProps) {
  return (
    <AriaDialogTrigger>
      {trigger}
      <AriaPopover offset={8} placement="bottom end" className={popoverClassName}>
        <AriaDialog aria-label={title} className="flex flex-col gap-2 outline-none">
          {({ close }) => (
            <>
              <div className="flex items-center justify-between gap-3">
                <AriaHeading slot="title" className="text-body font-bold text-text">
                  {title}
                </AriaHeading>
                <CloseButton onPress={close} />
              </div>
              {children}
            </>
          )}
        </AriaDialog>
      </AriaPopover>
    </AriaDialogTrigger>
  );
}
