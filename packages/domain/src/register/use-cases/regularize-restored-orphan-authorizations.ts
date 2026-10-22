import { restorationStanding } from "../model/restoration-protocol.js";
import type { RegularizeRestoredOrphanAuthorizationsPorts } from "./regularize-restored-orphan-authorizations-ports.js";

export type RegularizeRestoredOrphanAuthorizationsOutcome<TFailure> =
  | { kind: "not_this_step" }
  | { kind: "regularized" }
  | { kind: "numbering_not_reconciled" }
  | { kind: "failed"; failure: TFailure };

export async function regularizeRestoredOrphanAuthorizations<TFailure>({
  evidence,
  cloud,
  awaited,
}: RegularizeRestoredOrphanAuthorizationsPorts<TFailure>): Promise<
  RegularizeRestoredOrphanAuthorizationsOutcome<TFailure>
> {
  const standing = restorationStanding(evidence.evidence());
  const atTheSweep =
    (standing.kind === "in_progress" || standing.kind === "without_connection") &&
    standing.step === "regularize_orphan_authorizations";
  if (!atTheSweep) {
    return { kind: "not_this_step" };
  }
  const answer = await cloud.requestSweep();
  if (answer.kind !== "swept") {
    return answer;
  }
  await awaited.clear();
  return { kind: "regularized" };
}
