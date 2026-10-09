import type { RegisterStatus } from "@purosur/contracts";
import { Outlet } from "@tanstack/react-router";
import type { CashSessionState } from "../register/cash-session-state";
import { useRegisterStatusQuery } from "../register/register-queries";
import { RegisterStatusBar } from "./register-status-bar";
import type { SignedInPerson } from "./signed-in-person";

export type StatusBarLayoutProps = {
  person: SignedInPerson | undefined;
  cashSession: CashSessionState;
  readStatus: () => Promise<RegisterStatus | "unavailable">;
};

export function StatusBarLayout({ person, cashSession, readStatus }: StatusBarLayoutProps) {
  const status = useRegisterStatusQuery(readStatus);
  return (
    <div className="flex h-full w-full flex-col">
      <RegisterStatusBar person={person} cashSession={cashSession} status={status} />
      <div className="min-h-0 flex-1">
        <Outlet />
      </div>
    </div>
  );
}
