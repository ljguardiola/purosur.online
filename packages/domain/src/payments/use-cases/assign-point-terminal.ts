import { normalizePointTerminalId } from "../model/point-terminal-id.js";
import {
  PointTerminalAlreadyAssigned,
  type PointTerminalAssignment,
  type PointTerminalAssignmentStore,
} from "./point-terminal-assignment-store.js";

export interface AssignPointTerminalInput {
  locationId: string;
  registerId: string;
  terminalId: string | null;
  version: number;
  actorId: string;
}

export type AssignPointTerminalOutcome =
  | { kind: "invalid_terminal_id" }
  | { kind: "register_not_found" }
  | { kind: "stale_version" }
  | { kind: "terminal_taken" }
  | { kind: "unchanged"; assignment: PointTerminalAssignment }
  | { kind: "assigned"; assignment: PointTerminalAssignment };

export async function assignPointTerminal(
  store: PointTerminalAssignmentStore,
  input: AssignPointTerminalInput,
): Promise<AssignPointTerminalOutcome> {
  const terminalId = input.terminalId === null ? null : normalizePointTerminalId(input.terminalId);
  if (input.terminalId !== null && terminalId === null) {
    return { kind: "invalid_terminal_id" };
  }

  try {
    return await store.transaction<AssignPointTerminalOutcome>(async (tx) => {
      const register = await tx.lockBranchRegister(input.locationId, input.registerId);
      if (register.kind === "not_found") {
        return { kind: "register_not_found" };
      }

      const current = await tx.lockRegisterPointTerminal(input.registerId);
      if (current.version !== input.version) {
        return { kind: "stale_version" };
      }
      if (current.terminalId === terminalId) {
        return { kind: "unchanged", assignment: current };
      }

      if (terminalId !== null) {
        const holder = await tx.lockPointTerminalHolder(terminalId);
        if (holder !== undefined) {
          return { kind: "terminal_taken" };
        }
      }

      const assignment = { terminalId, version: current.version + 1 };
      await tx.recordPointTerminalAssignment({
        registerId: input.registerId,
        ...assignment,
        actorId: input.actorId,
      });
      return { kind: "assigned", assignment };
    });
  } catch (error) {
    if (!(error instanceof PointTerminalAlreadyAssigned)) {
      throw error;
    }
    return { kind: "terminal_taken" };
  }
}
