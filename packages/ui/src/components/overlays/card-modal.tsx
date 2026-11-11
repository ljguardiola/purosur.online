import { type ReactNode, useId, useRef } from "react";
import {
  Dialog as AriaDialog,
  Heading as AriaHeading,
  Modal as AriaModal,
  ModalOverlay as AriaModalOverlay,
} from "react-aria-components";
import { CardTitleRow, cardSurfaceClassName } from "../shared/card-surface";
import { CloseButton } from "../shared/close-button";
import type { Icon } from "../shared/icon";
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
      <AriaModal
        className={`flex max-h-modal max-w-modal shrink-0 flex-col px-6 ${cardSurfaceClassName}`}
      >
        <AriaDialog className="flex min-h-0 flex-1 flex-col outline-none">
          <div className="shrink-0 py-4">
            <CardTitleRow
              icon={icon}
              gapClassName="gap-4"
              title={
                <AriaHeading id={titleId} slot="title" className="flex-1 text-title text-text">
                  {title}
                </AriaHeading>
              }
              end={
                closable ? <CloseButton onPress={() => onOpenChange(false)} escapeKeycap /> : null
              }
            />
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
