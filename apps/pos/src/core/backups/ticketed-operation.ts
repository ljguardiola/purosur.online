import type { ContingencyBackupOperation, FiscalEmissionMode } from "@purosur/domain";
import type { RecordContingencyBackupTicketInput } from "@purosur/domain/backups/use-cases";

export interface TicketedOperationsDeps {
  readLastDeviceSeq: () => number;
  readEmissionMode: () => FiscalEmissionMode;
  record: (input: RecordContingencyBackupTicketInput) => Promise<unknown>;
  afterRecorded: () => void;
  reportFailure: (context: string, error: unknown) => void;
}

type Handler = (...args: never[]) => Promise<unknown>;

export interface TicketedOperations {
  ticketed<THandler extends Handler | undefined>(
    operation: ContingencyBackupOperation,
    handler: THandler,
    subjectOf?: (
      args: Parameters<NonNullable<THandler>>,
      outcome: Awaited<ReturnType<NonNullable<THandler>>>,
    ) => string | null,
  ): THandler;
  ticketedNow<TArgs extends unknown[], TOutcome>(
    operation: ContingencyBackupOperation,
    step: (...args: TArgs) => TOutcome,
    subjectOf?: (args: TArgs, outcome: TOutcome) => string | null,
  ): (...args: TArgs) => TOutcome;
  ticketedSettlement<TArgs extends unknown[], TSettlement extends { kind: string }>(
    settle: (...args: TArgs) => TSettlement,
  ): (...args: TArgs) => TSettlement;
  ticketedSteps<TOutcome>(
    operation: ContingencyBackupOperation,
    subjectId: string | null,
    operate: (ticketedStep: TicketedStep) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}

export type TicketedStep = <TStep>(step: () => TStep) => TStep;

function completedSaleOf(settlement: { kind: string }): string | null {
  return settlement.kind === "completed" &&
    "saleId" in settlement &&
    typeof settlement.saleId === "string"
    ? settlement.saleId
    : null;
}

interface Reading {
  lastDeviceSeq: number;
  mode: FiscalEmissionMode;
}

export function createTicketedOperations({
  readLastDeviceSeq,
  readEmissionMode,
  record,
  afterRecorded,
  reportFailure,
}: TicketedOperationsDeps): TicketedOperations {
  function read(): Reading | undefined {
    try {
      return { lastDeviceSeq: readLastDeviceSeq(), mode: readEmissionMode() };
    } catch (error) {
      reportFailure("reading the register before a contingency backup ticket", error);
      return undefined;
    }
  }

  async function recordAround(
    operation: ContingencyBackupOperation,
    subjectOf: () => string | null,
    before: Reading,
    after: Reading | undefined,
  ): Promise<void> {
    if (after === undefined) return;
    try {
      await record({
        operation,
        subjectId: subjectOf(),
        modesAround: [before.mode, after.mode],
        range: { firstDeviceSeq: before.lastDeviceSeq + 1, lastDeviceSeq: after.lastDeviceSeq },
      });
      afterRecorded();
    } catch (error) {
      reportFailure("recording a contingency backup ticket", error);
    }
  }

  function ticketedNow<TArgs extends unknown[], TOutcome>(
    operation: ContingencyBackupOperation,
    step: (...args: TArgs) => TOutcome,
    subjectOf?: (args: TArgs, outcome: TOutcome) => string | null,
  ): (...args: TArgs) => TOutcome {
    return (...args) => {
      const before = read();
      const outcome = step(...args);
      if (before !== undefined) {
        void recordAround(operation, () => subjectOf?.(args, outcome) ?? null, before, read());
      }
      return outcome;
    };
  }

  return {
    ticketed(operation, handler, subjectOf) {
      if (handler === undefined) return handler;
      const ticketedHandler = async (...args: Parameters<NonNullable<typeof handler>>) => {
        const before = read();
        const outcome = await handler(...args);
        if (before === undefined) return outcome;
        await recordAround(
          operation,
          () => subjectOf?.(args, outcome as never) ?? null,
          before,
          read(),
        );
        return outcome;
      };
      return ticketedHandler as typeof handler;
    },

    ticketedNow,

    ticketedSettlement: (settle) =>
      ticketedNow("sale", settle, (_args, settlement) => completedSaleOf(settlement)),

    async ticketedSteps(operation, subjectId, operate) {
      const steps: [Reading, Reading | undefined][] = [];
      try {
        return await operate((step) => {
          const before = read();
          const outcome = step();
          if (before !== undefined) steps.push([before, read()]);
          return outcome;
        });
      } finally {
        for (const [before, after] of steps) {
          await recordAround(operation, () => subjectId, before, after);
        }
      }
    },
  };
}
