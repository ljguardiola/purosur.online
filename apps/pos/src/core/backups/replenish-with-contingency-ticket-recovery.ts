import type { ReplenishAttempt } from "../sync/replenish-restored-register-step";
import type { ContingencyTicketRecoveryAttempt } from "./recover-contingency-tickets-step";

export interface ReplenishWithContingencyTicketRecoveryDeps {
  replenish: () => Promise<ReplenishAttempt>;
  recover: () => Promise<ContingencyTicketRecoveryAttempt>;
  report: (attempt: ContingencyTicketRecoveryAttempt) => void;
  onFailure: (error: unknown) => void;
}

export function replenishWithContingencyTicketRecovery({
  replenish,
  recover,
  report,
  onFailure,
}: ReplenishWithContingencyTicketRecoveryDeps): () => Promise<ReplenishAttempt> {
  return async () => {
    const replenished = await replenish();
    try {
      const attempt = await recover();
      report(attempt);
      if (attempt.kind === "released") {
        return await replenish();
      }
    } catch (error) {
      onFailure(error);
    }
    return replenished;
  };
}
