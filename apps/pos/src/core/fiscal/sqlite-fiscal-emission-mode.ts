import type { FiscalEmissionMode } from "@purosur/domain";
import {
  type FiscalEmissionModeReads,
  readFiscalEmissionMode,
} from "@purosur/domain/fiscal/use-cases";
import type { LocalDatabase } from "../platform/local-database";
import { readFiscalOnlineEvidence } from "./sqlite-fiscal-online-evidence";
import {
  readOfflineAuthorizationCodeOf,
  readOfflineSeries,
  readRealTimeSeries,
} from "./sqlite-fiscal-series";
import { readLatestPreEmissionGateOutcome } from "./sqlite-pre-emission-gate";

function sqliteFiscalEmissionModeReads(database: LocalDatabase): FiscalEmissionModeReads {
  return {
    fiscalOnlineEvidence: () => readFiscalOnlineEvidence(database),
    realTimeSeries: () => readRealTimeSeries(database),
    offlineSeries: () => readOfflineSeries(database),
    offlineAuthorizationCodeOf: (fortnight) => readOfflineAuthorizationCodeOf(database, fortnight),
    latestPreEmissionGateOutcome: () => readLatestPreEmissionGateOutcome(database),
  };
}

export function readFiscalEmissionModeIn(database: LocalDatabase, now: Date): FiscalEmissionMode {
  return readFiscalEmissionMode(sqliteFiscalEmissionModeReads(database), { now: () => now });
}
