import type { FiscalEmissionMode } from "@purosur/domain";
import {
  type Clock,
  closeInterruptedContingency,
  type IdGenerator,
  recordContingencyChange,
  startContingencyReporting,
} from "@purosur/domain/register/use-cases";
import type { LocalDatabase } from "../platform/local-database";
import { SqliteContingencyLedger } from "./sqlite-contingency-ledger";

export interface ContingencyRecordingDeps {
  database: LocalDatabase;
  now: Clock["now"];
  ids: IdGenerator;
  readMode: () => FiscalEmissionMode;
  readOutboxChainKey: () => Promise<string | undefined>;
  reportFailure: (error: unknown) => void;
}

export interface ContingencyRecording {
  startup(): Promise<void>;
  check(): Promise<void>;
}

export function createContingencyRecording({
  database,
  now,
  ids,
  readMode,
  readOutboxChainKey,
  reportFailure,
}: ContingencyRecordingDeps): ContingencyRecording {
  let queue: Promise<void> = Promise.resolve();

  function serialized(work: (ledger: SqliteContingencyLedger) => void): Promise<void> {
    queue = queue.then(async () => {
      try {
        const outboxChainKey = await readOutboxChainKey();
        if (outboxChainKey !== undefined) {
          work(new SqliteContingencyLedger(database, outboxChainKey));
        }
      } catch (error) {
        reportFailure(error);
      }
    });
    return queue;
  }

  function check(ledger: SqliteContingencyLedger): void {
    const clock = { now };
    startContingencyReporting({ ledger, clock, ids });
    recordContingencyChange({ ledger, clock, ids }, { mode: readMode() });
  }

  return {
    startup: () =>
      serialized((ledger) => {
        closeInterruptedContingency({ ledger, ids });
        check(ledger);
      }),
    check: () => serialized(check),
  };
}
