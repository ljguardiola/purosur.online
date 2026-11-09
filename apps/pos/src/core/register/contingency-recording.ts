import type { DeviceCredentials } from "@purosur/contracts";
import type { FiscalEmissionMode } from "@purosur/domain";
import {
  type Clock,
  closeInterruptedContingency,
  closePredecessorContingency,
  type IdGenerator,
  recordContingencyChange,
  recordRegisterSeenUnenrolled,
  startContingencyReporting,
} from "@purosur/domain/register/use-cases";
import type { LocalDatabase } from "../platform/local-database";
import { SqliteContingencyLedger } from "./sqlite-contingency-ledger";

export interface ContingencyRecordingDeps {
  database: LocalDatabase;
  now: Clock["now"];
  ids: IdGenerator;
  readMode: () => FiscalEmissionMode;
  readCredentials: () => Promise<DeviceCredentials | undefined>;
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
  readCredentials,
  reportFailure,
}: ContingencyRecordingDeps): ContingencyRecording {
  let queue: Promise<void> = Promise.resolve();

  function serialized(work: (ledger: SqliteContingencyLedger) => void): Promise<void> {
    queue = queue.then(async () => {
      try {
        const credentials = await readCredentials();
        if (credentials === undefined) {
          recordRegisterSeenUnenrolled({
            ledger: new SqliteContingencyLedger(database, undefined, readMode),
          });
        } else if (credentials.keys !== undefined) {
          work(new SqliteContingencyLedger(database, credentials.keys.outbox_chain_key, readMode));
        }
      } catch (error) {
        reportFailure(error);
      }
    });
    return queue;
  }

  function check(ledger: SqliteContingencyLedger): void {
    const clock = { now };
    closePredecessorContingency({ ledger, ids });
    startContingencyReporting({ ledger, clock, ids });
    recordContingencyChange({ ledger, clock, ids });
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
