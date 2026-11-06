import { type ReactNode, useEffect, useRef } from "react";
import { FocusScope } from "react-aria";
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
    <PanelContent onClose={onClose} title={title} footer={footer}>
      {children}
    </PanelContent>
  );
}

function PanelContent({ onClose, title, children, footer }: Omit<DetailPanelProps, "open">) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const scopeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  // A native listener sees only keys pressed inside this panel's own DOM; a React handler would also
  // receive those of a modal opened from its content, which React bubbles through the portal.
  useEffect(() => {
    const scope = scopeRef.current;
    if (scope === null) {
      return;
    }
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    scope.addEventListener("keydown", closeOnEscape);
    return () => scope.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <FocusScope restoreFocus>
      <div ref={scopeRef} className="contents">
        <SidePanel
          label={title}
          footer={footer}
          header={
            <div className="flex items-center justify-between gap-4 border-b border-border px-8 py-4">
              <AriaHeading
                ref={headingRef}
                level={2}
                slot="title"
                tabIndex={-1}
                className="text-heading text-text outline-none"
              >
                {title}
              </AriaHeading>
              <CloseButton onPress={onClose} />
            </div>
          }
        >
          {children}
        </SidePanel>
      </div>
    </FocusScope>
  );
}
