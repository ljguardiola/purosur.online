export interface PointTerminalAssignment {
  terminalId: string | null;
  version: number;
}

export interface PointTerminalAssignmentRecord {
  registerId: string;
  terminalId: string | null;
  version: number;
  actorId: string;
}

export type LockBranchRegisterResult = { kind: "not_found" } | { kind: "locked" };

export class PointTerminalAlreadyAssigned extends Error {}

export interface PointTerminalAssignmentStore {
  transaction<TOutcome>(
    work: (tx: PointTerminalAssignmentStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}

export interface PointTerminalAssignmentStoreTransaction {
  lockBranchRegister(locationId: string, registerId: string): Promise<LockBranchRegisterResult>;
  lockRegisterPointTerminal(registerId: string): Promise<PointTerminalAssignment>;
  lockPointTerminalHolder(terminalId: string): Promise<string | undefined>;
  recordPointTerminalAssignment(record: PointTerminalAssignmentRecord): Promise<void>;
}
