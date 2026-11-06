import type { ReactNode } from "react";
import { Heading as AriaHeading } from "react-aria-components";
import { CloseButton } from "../shared/close-button";
import { SidePanel } from "./side-panel";

export type DetailPanelProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode | undefined;
};

export function DetailPanel({ open, onClose, title, children, footer }: DetailPanelProps) {
  if (!open) {
    return null;
  }
  return (
    <SidePanel
      label={title}
      footer={footer}
      header={
        <div className="flex items-center justify-between gap-4 border-b border-border px-8 py-4">
          <AriaHeading level={2} slot="title" className="text-heading text-text">
            {title}
          </AriaHeading>
          <CloseButton onPress={onClose} />
        </div>
      }
    >
      {children}
    </SidePanel>
  );
}
