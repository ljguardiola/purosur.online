import type { ReactNode } from "react";
import { RegisterHeader } from "./register-header";
import { useRegisterStatusData } from "./register-status-context";

export type RegisterFrameProps = {
  background: "surface" | "subtle";
  rail: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
};

const BACKGROUNDS = { surface: "bg-surface", subtle: "bg-surface-subtle" } as const;

export function RegisterFrame({ background, rail, aside, children }: RegisterFrameProps) {
  const statusData = useRegisterStatusData();
  return (
    <div className={`flex h-full w-full ${BACKGROUNDS[background]}`}>
      {rail}
      <div className="flex min-w-0 flex-1 flex-col">
        {statusData === undefined ? null : <RegisterHeader {...statusData} />}
        {children}
      </div>
      {aside}
    </div>
  );
}
