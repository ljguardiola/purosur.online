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

  return {
    ticketed(operation, handler, subjectOf) {
      if (handler === undefined) return handler;
      const ticketedHandler = async (...args: Parameters<NonNullable<typeof handler>>) => {
        const before = read();
        const outcome = await handler(...args);
        if (before === undefined) return outcome;
        try {
          const after = read();
          if (after === undefined) return outcome;
          await record({
            operation,
            subjectId: subjectOf?.(args, outcome as never) ?? null,
            modesAround: [before.mode, after.mode],
            range: { firstDeviceSeq: before.lastDeviceSeq + 1, lastDeviceSeq: after.lastDeviceSeq },
          });
          afterRecorded();
        } catch (error) {
          reportFailure("recording a contingency backup ticket", error);
        }
        return outcome;
      };
      return ticketedHandler as typeof handler;
    },
  };
}
