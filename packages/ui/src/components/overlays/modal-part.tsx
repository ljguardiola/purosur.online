import { createContext, type ReactNode, useContext, useRef } from "react";
import { Group } from "react-aria-components";

export type ModalPartFocus = (focused: EventTarget, part: HTMLElement, action: HTMLElement) => void;

export const ModalPartFocusContext = createContext<ModalPartFocus | null>(null);

export type ModalPartProps = {
  action: ReactNode;
  children: ReactNode;
};

// React's focus events follow the component tree, so a field's list portaled outside the part
// still reports its focus here.
export function ModalPart({ action, children }: ModalPartProps) {
  const focusPart = useContext(ModalPartFocusContext);
  const partRef = useRef<HTMLDivElement>(null);
  const actionRef = useRef<HTMLDivElement>(null);

  return (
    <Group
      ref={partRef}
      role="presentation"
      className="contents"
      onFocus={(event) => {
        if (partRef.current !== null && actionRef.current !== null) {
          focusPart?.(event.target, partRef.current, actionRef.current);
        }
      }}
    >
      {children}
      <div ref={actionRef} className="contents">
        {action}
      </div>
    </Group>
  );
}
