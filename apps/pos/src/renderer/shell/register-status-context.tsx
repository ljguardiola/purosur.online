import type { ContingencyBackupTicketsAnswer, RegisterStatus } from "@purosur/contracts";
import { createContext, useContext } from "react";
import type { CoreData } from "../platform/use-core-query";
import type { CashSessionState } from "../register/cash-session-state";
import type { SignedInPerson } from "./signed-in-person";

export type RegisterStatusData = {
  person: SignedInPerson | undefined;
  registerName: string | null;
  cashSession: CashSessionState;
  status: CoreData<RegisterStatus>;
  backupTickets: CoreData<ContingencyBackupTicketsAnswer>;
  onDiscardBackupTickets: () => void;
};

const RegisterStatusContext = createContext<RegisterStatusData | undefined>(undefined);

export const RegisterStatusProvider = RegisterStatusContext.Provider;

export function useRegisterStatusData(): RegisterStatusData | undefined {
  return useContext(RegisterStatusContext);
}
