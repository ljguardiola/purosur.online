import type { ReactNode } from "react";
import { createContext, use, useState } from "react";
import { createPortal } from "react-dom";
import { RegisterHeader } from "./register-header";
import { useRegisterStatusData } from "./register-status-context";

export type RegisterFrameProps = {
  background: "surface" | "subtle";
  rail: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
};

const BACKGROUNDS = { surface: "bg-surface", subtle: "bg-surface-subtle" } as const;

const PanelSlotContext = createContext<HTMLElement | null>(null);

export function FramePanel({ children }: { children: ReactNode }) {
  const slot = use(PanelSlotContext);
  return slot === null ? null : createPortal(children, slot);
}

export function RegisterFrame({ background, rail, aside, children }: RegisterFrameProps) {
  const statusData = useRegisterStatusData();
  const [panelSlot, setPanelSlot] = useState<HTMLElement | null>(null);
  return (
    <PanelSlotContext value={panelSlot}>
      <div className={`relative flex h-full w-full ${BACKGROUNDS[background]}`}>
        {rail}
        <div className="flex min-w-0 flex-1 flex-col">
          {statusData === undefined ? null : <RegisterHeader {...statusData} />}
          <div className="flex min-h-0 flex-1">{children}</div>
        </div>
        {aside}
        <div
          ref={setPanelSlot}
          className="absolute inset-y-0 right-0 z-raised flex w-100 empty:hidden"
        />
      </div>
    </PanelSlotContext>
  );
}
