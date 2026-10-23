import type {
  DiscardContingencyBackupTicketsAnswer,
  ReadContingencyBackupTicketsOutcome,
  RegisterStatus,
} from "@purosur/contracts";
import { Outlet } from "@tanstack/react-router";
import {
  useContingencyBackupTicketsQuery,
  useDiscardContingencyBackupTickets,
} from "../backups/contingency-backup-tickets-queries";
import type { CashSessionState } from "../register/cash-session-state";
import { useRegisterStatusQuery } from "../register/register-queries";
import { RegisterStatusBar } from "./register-status-bar";
import type { SignedInPerson } from "./signed-in-person";

export type StatusBarLayoutProps = {
  person: SignedInPerson | undefined;
  cashSession: CashSessionState;
  readStatus: () => Promise<RegisterStatus | "unavailable">;
  readBackupTickets: () => Promise<ReadContingencyBackupTicketsOutcome>;
  discardBackupTickets: () => Promise<DiscardContingencyBackupTicketsAnswer>;
};

export function StatusBarLayout({
  person,
  cashSession,
  readStatus,
  readBackupTickets,
  discardBackupTickets,
}: StatusBarLayoutProps) {
  const status = useRegisterStatusQuery(readStatus);
  const backupTickets = useContingencyBackupTicketsQuery({ read: readBackupTickets });
  const discard = useDiscardContingencyBackupTickets(discardBackupTickets);
  return (
    <div className="flex h-full w-full flex-col">
      <RegisterStatusBar
        person={person}
        cashSession={cashSession}
        status={status}
        backupTickets={backupTickets}
        onDiscardBackupTickets={discard}
      />
      <div className="min-h-0 flex-1">
        <Outlet />
      </div>
    </div>
  );
}
