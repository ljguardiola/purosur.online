import type {
  Authorization,
  CloseCashSessionOutcome,
  CloseLockedCashSessionOutcome,
  OpenCashSessionOutcome,
} from "@purosur/contracts";
import type { FiscalEmissionMode, ZoneRulesSource } from "@purosur/domain";
import type {
  Clock,
  IdGenerator,
  RestorationProtocolEvidence,
} from "@purosur/domain/register/use-cases";
import { startRegisterHealthChecks } from "../fiscal/real-time-authorization-wiring";
import type { LocalDatabase } from "../platform/local-database";
import type { ActionGate } from "../sessions/action-gate";
import {
  closeCashSessionFor,
  closeLockedCashSessionFor,
  openCashSessionFor,
} from "./cash-session-requests";
import { createContingencyRecording } from "./contingency-recording";

export interface ContingencyRecordingWiringDeps {
  database: LocalDatabase | undefined;
  gate: ActionGate | undefined;
  zoneRules: ZoneRulesSource;
  now: Clock["now"];
  ids: IdGenerator;
  readOutboxChainKey: () => Promise<string | undefined>;
  readMode: (database: LocalDatabase) => FiscalEmissionMode;
  restorationOf: (database: LocalDatabase) => RestorationProtocolEvidence;
  reportFailure: (error: unknown) => void;
  authorizeSale: (saleId: string) => Promise<void>;
  checkEnrollmentStanding: () => void;
}

type RegisterHealthChecksDeps = Parameters<typeof startRegisterHealthChecks>[0];

export interface ContingencyRecordingWiring {
  startup(): Promise<void>;
  startHealthChecks(healthChecks: RegisterHealthChecksDeps): (() => void) | undefined;
  authorizeSale(saleId: string): Promise<void>;
  checkEnrollmentStanding(): void;
  openCashSession: ((openingFloat: number) => Promise<OpenCashSessionOutcome>) | undefined;
  closeCashSession:
    | ((sessionId: string, countedCash: number) => Promise<CloseCashSessionOutcome>)
    | undefined;
  closeLockedCashSession:
    | ((
        sessionId: string,
        countedCash: number,
        closer: Authorization,
      ) => Promise<CloseLockedCashSessionOutcome>)
    | undefined;
}

export function createContingencyRecordingWiring({
  database,
  gate,
  zoneRules,
  now,
  ids,
  readOutboxChainKey,
  readMode,
  restorationOf,
  reportFailure,
  authorizeSale,
  checkEnrollmentStanding,
}: ContingencyRecordingWiringDeps): ContingencyRecordingWiring {
  const recording =
    database === undefined
      ? undefined
      : createContingencyRecording({
          database,
          now,
          ids,
          readMode: () => readMode(database),
          readOutboxChainKey,
          reportFailure,
        });
  const startup = async () => recording?.startup();
  const check = async () => recording?.check();
  const checkAfter = async <Answer>(request: Promise<Answer>): Promise<Answer> => {
    const answer = await request;
    void check();
    return answer;
  };
  const followers = {
    startHealthChecks: (healthChecks: RegisterHealthChecksDeps) =>
      startRegisterHealthChecks({
        ...healthChecks,
        afterCheck: () => {
          healthChecks.afterCheck?.();
          void check();
        },
      }),
    authorizeSale: (saleId: string) => checkAfter(authorizeSale(saleId)),
    checkEnrollmentStanding: () => {
      void check();
      checkEnrollmentStanding();
    },
  };
  if (database === undefined || gate === undefined) {
    return {
      startup,
      ...followers,
      openCashSession: undefined,
      closeCashSession: undefined,
      closeLockedCashSession: undefined,
    };
  }
  const requestDeps = { zoneRules, database, gate, readOutboxChainKey, now, ids };
  return {
    startup,
    ...followers,
    openCashSession: (openingFloat) =>
      checkAfter(
        openCashSessionFor({ ...requestDeps, restoration: restorationOf(database) }, openingFloat),
      ),
    closeCashSession: (sessionId, countedCash) =>
      checkAfter(closeCashSessionFor(requestDeps, { sessionId, countedCash })),
    closeLockedCashSession: (sessionId, countedCash, closer) =>
      checkAfter(closeLockedCashSessionFor(requestDeps, { sessionId, countedCash, closer })),
  };
}
