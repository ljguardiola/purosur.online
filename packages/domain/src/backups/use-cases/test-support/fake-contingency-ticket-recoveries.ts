import type {
  AwaitingContingencyTicketRecoveries,
  AwaitingContingencyTicketRecovery,
  ContingencyTicketRecoveries,
  ContingencyTicketRecoveryStanding,
  ContingencyTicketRecoveryTransaction,
  FinishedContingencyTicketRecovery,
  LockedContingencyTicketRecovery,
  OpenContingencyTicketRecovery,
} from "../contingency-ticket-recovery-ports.js";

interface StoredRecovery {
  id: string;
  registerId: string;
  registerName: string;
  restoredDeviceId: string;
  openedAt: Date;
  finishedAt: Date | null;
  finishedBy: string | null;
}

export class FakeContingencyTicketRecoveries
  implements ContingencyTicketRecoveries, AwaitingContingencyTicketRecoveries
{
  recoveries: StoredRecovery[] = [];
  transactions = 0;
  readonly locked: string[] = [];
  readonly registerNames = new Map<string, string>();
  failAfterOpening = false;
  failAfterFinishing = false;

  async transaction<TOutcome>(
    work: (tx: ContingencyTicketRecoveryTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    this.transactions += 1;
    const before = this.recoveries.map((recovery) => ({ ...recovery }));
    const tx: ContingencyTicketRecoveryTransaction = {
      openRecovery: async (opening) => {
        const standing = this.open(opening);
        if (this.failAfterOpening) {
          throw new Error("storage unavailable");
        }
        return standing;
      },
      lockRecovery: async (recoveryId) => {
        this.locked.push(recoveryId);
        const found = this.recoveries.find((recovery) => recovery.id === recoveryId);
        return found === undefined ? undefined : this.lockedOf(found);
      },
      recordFinished: async (finished) => {
        this.finish(finished);
        if (this.failAfterFinishing) {
          throw new Error("storage unavailable");
        }
      },
    };
    try {
      return await work(tx);
    } catch (error) {
      this.recoveries = before;
      throw error;
    }
  }

  async awaiting(): Promise<AwaitingContingencyTicketRecovery[]> {
    return this.recoveries
      .filter((recovery) => recovery.finishedAt === null)
      .map((recovery) => ({
        recoveryId: recovery.id,
        registerId: recovery.registerId,
        registerName: recovery.registerName,
        openedAt: recovery.openedAt,
      }));
  }

  private open({
    registerId,
    restoredDeviceId,
    at,
  }: OpenContingencyTicketRecovery): ContingencyTicketRecoveryStanding {
    const existing = this.recoveries.find(
      (recovery) => recovery.restoredDeviceId === restoredDeviceId,
    );
    if (existing !== undefined) {
      return existing.finishedAt === null ? { kind: "awaiting" } : { kind: "finished" };
    }
    this.recoveries.push({
      id: `recovery-${this.recoveries.length + 1}`,
      registerId,
      registerName: this.registerNames.get(registerId) ?? registerId,
      restoredDeviceId,
      openedAt: at,
      finishedAt: null,
      finishedBy: null,
    });
    return { kind: "awaiting" };
  }

  private lockedOf(recovery: StoredRecovery): LockedContingencyTicketRecovery {
    return { registerId: recovery.registerId, finished: recovery.finishedAt !== null };
  }

  private finish({ recoveryId, finishedBy, at }: FinishedContingencyTicketRecovery): void {
    const recovery = this.recoveries.find((candidate) => candidate.id === recoveryId);
    if (recovery !== undefined) {
      recovery.finishedAt = at;
      recovery.finishedBy = finishedBy;
    }
  }
}
