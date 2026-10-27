import { restorationStanding } from "../model/restoration-protocol.js";
import type { AwaitContingencyTicketRecoveryPorts } from "./await-contingency-ticket-recovery-ports.js";

export type AwaitContingencyTicketRecoveryOutcome<TFailure> =
  | { kind: "not_this_step" }
  | { kind: "awaiting" }
  | { kind: "released" }
  | { kind: "failed"; failure: TFailure };

export async function awaitContingencyTicketRecovery<TFailure>({
  evidence,
  cloud,
  awaited,
}: AwaitContingencyTicketRecoveryPorts<TFailure>): Promise<
  AwaitContingencyTicketRecoveryOutcome<TFailure>
> {
  const standing = restorationStanding(evidence.evidence());
  const atTheRecovery =
    (standing.kind === "in_progress" || standing.kind === "without_connection") &&
    standing.step === "recover_contingency_tickets";
  const predecessor = atTheRecovery ? await awaited.predecessor() : undefined;
  if (predecessor === undefined) {
    return { kind: "not_this_step" };
  }
  const status = await cloud.ask(predecessor.deviceId);
  if (status.kind !== "finished") {
    return status;
  }
  await awaited.release(predecessor);
  return { kind: "released" };
}
