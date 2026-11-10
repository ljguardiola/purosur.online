import type {
  DiscardContingencyBackupTicketsAnswer,
  ReadContingencyBackupTicketsOutcome,
  RegisterStatus,
} from "@purosur/contracts";
import { Outlet } from "@tanstack/react-router";
import {
  useContingencyBackupTicketsQuery,
  useDiscardContingencyBackupTickets,
} from "../backups/backups-queries";
import type { CashSessionState } from "../register/cash-session-state";
import { useRegisterNameQuery, useRegisterStatusQuery } from "../register/register-queries";
import { RegisterStatusProvider } from "./register-status-context";
import type { SignedInPerson } from "./signed-in-person";

export type StatusBarLayoutProps = {
  person: SignedInPerson | undefined;
  readRegisterName: () => Promise<string | null>;
  cashSession: CashSessionState;
  readStatus: () => Promise<RegisterStatus | "unavailable">;
  readBackupTickets: () => Promise<ReadContingencyBackupTicketsOutcome>;
  discardBackupTickets: () => Promise<DiscardContingencyBackupTicketsAnswer>;
};

export function StatusBarLayout({
  person,
  readRegisterName,
  cashSession,
  readStatus,
  readBackupTickets,
  discardBackupTickets,
}: StatusBarLayoutProps) {
  const registerName = useRegisterNameQuery(readRegisterName);
  const status = useRegisterStatusQuery(readStatus);
  const backupTickets = useContingencyBackupTicketsQuery(readBackupTickets);
  const discard = useDiscardContingencyBackupTickets(discardBackupTickets);
  return (
    <RegisterStatusProvider
      value={{
        person,
        registerName,
        cashSession,
        status,
        backupTickets,
        onDiscardBackupTickets: discard,
      }}
    >
      <div className="h-full w-full">
        <Outlet />
      </div>
    </RegisterStatusProvider>
  );
}
