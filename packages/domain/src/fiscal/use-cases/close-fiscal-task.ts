import { CLOSED_FISCAL_TASK_STATE } from "../model/fiscal-task.js";
import type { CloseFiscalTaskPorts } from "./close-fiscal-task-ports.js";

export interface CloseFiscalTaskInput {
  taskId: string;
  locationId: string;
  closedBy: string;
  note: string;
}

export type CloseFiscalTaskOutcome =
  | { kind: "not_found" }
  | { kind: "already_closed" }
  | { kind: "closed"; closedAt: Date };

export async function closeFiscalTask(
  { store, clock }: CloseFiscalTaskPorts,
  input: CloseFiscalTaskInput,
): Promise<CloseFiscalTaskOutcome> {
  return store.transaction<CloseFiscalTaskOutcome>(async (tx) => {
    const state = await tx.lockFiscalTaskOfBranch(input.taskId, input.locationId);
    if (state === null) {
      return { kind: "not_found" };
    }
    if (state === CLOSED_FISCAL_TASK_STATE) {
      return { kind: "already_closed" };
    }

    const closedAt = clock.now();
    await tx.recordClosing({
      taskId: input.taskId,
      closedBy: input.closedBy,
      closedAt,
      note: input.note,
    });
    await tx.recordClosingAudit({
      taskId: input.taskId,
      actorId: input.closedBy,
      at: closedAt,
      note: input.note,
    });
    return { kind: "closed", closedAt };
  });
}
