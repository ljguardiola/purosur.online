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
    needsTicket?: (
      args: Parameters<NonNullable<THandler>>,
      outcome: Awaited<ReturnType<NonNullable<THandler>>>,
    ) => boolean,
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

function appendStep(spans: Reading[][], before: Reading, after: Reading): void {
  if (after.lastDeviceSeq === before.lastDeviceSeq) return;
  const span = spans.at(-1);
  if (span?.at(-1)?.lastDeviceSeq === before.lastDeviceSeq) {
    span.push(before, after);
  } else {
    spans.push([before, after]);
  }
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
    await recordSpan(operation, subjectOf(), [before, after]);
  }

  async function recordSpan(
    operation: ContingencyBackupOperation,
    subjectId: string | null,
    readings: Reading[],
  ): Promise<void> {
    const first = readings[0];
    const last = readings.at(-1);
    if (first === undefined || last === undefined) return;
    try {
      await record({
        operation,
        subjectId,
        modesAround: readings.map(({ mode }) => mode),
        range: { firstDeviceSeq: first.lastDeviceSeq + 1, lastDeviceSeq: last.lastDeviceSeq },
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
    ticketed(operation, handler, subjectOf, needsTicket) {
      if (handler === undefined) return handler;
      const ticketedHandler = async (...args: Parameters<NonNullable<typeof handler>>) => {
        const before = read();
        const outcome = await handler(...args);
        if (before === undefined || needsTicket?.(args, outcome as never) === false) {
          return outcome;
        }
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
      const spans: Reading[][] = [];
      try {
        return await operate((step) => {
          const before = read();
          const outcome = step();
          const after = before && read();
          if (before !== undefined && after !== undefined) {
            appendStep(spans, before, after);
          }
          return outcome;
        });
      } finally {
        for (const span of spans) {
          await recordSpan(operation, subjectId, span);
        }
      }
    },
  };
}
