import { type ReactNode, useId, useRef } from "react";
import {
  Dialog as AriaDialog,
  Heading as AriaHeading,
  Modal as AriaModal,
  ModalOverlay as AriaModalOverlay,
} from "react-aria-components";
import { CloseButton } from "../shared/close-button";
import { type Icon, iconSlotClassName } from "../shared/icon";
import { FieldFocusingContent } from "./modal";

export type CardModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  icon: Icon;
  title: string;
  subtitle?: string | undefined;
  closable: boolean;
  children: ReactNode;
  action: ReactNode;
};

export function CardModal({
  open,
  onOpenChange,
  icon,
  title,
  subtitle,
  closable,
  children,
  action,
}: CardModalProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  return (
    <AriaModalOverlay
      isOpen={open}
      onOpenChange={onOpenChange}
      isDismissable={false}
      isKeyboardDismissDisabled={!closable}
      className="fixed inset-0 z-overlay flex items-center justify-center bg-backdrop"
    >
      <AriaModal className="flex max-h-modal w-110 max-w-modal shrink-0 flex-col rounded-xl bg-surface px-6 shadow-xl">
        <AriaDialog className="flex min-h-0 flex-1 flex-col outline-none">
          <div className="flex shrink-0 items-center gap-4 py-4">
            <span
              aria-hidden="true"
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-action-subtle text-text-accent"
            >
              <span className={iconSlotClassName.md}>{icon}</span>
            </span>
            <AriaHeading id={titleId} slot="title" className="flex-1 text-title text-text">
              {title}
            </AriaHeading>
            {closable ? <CloseButton onPress={() => onOpenChange(false)} escapeKeycap /> : null}
          </div>
          {subtitle !== undefined ? (
            <p className="border-t border-border py-3 text-body font-bold text-text">{subtitle}</p>
          ) : null}
          <div ref={bodyRef} className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto py-2">
            <FieldFocusingContent bodyRef={bodyRef} focusPart={() => {}}>
              {children}
            </FieldFocusingContent>
          </div>
          <div className="flex shrink-0 flex-col py-6">{action}</div>
        </AriaDialog>
      </AriaModal>
    </AriaModalOverlay>
  );
}
