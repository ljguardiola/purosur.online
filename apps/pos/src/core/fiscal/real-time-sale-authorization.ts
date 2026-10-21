import {
  type IdGenerator,
  type RealTimeTaxAuthority,
  type RequestRealTimeAuthorizationOutcome,
  requestRealTimeAuthorization,
  type ShortCodeRandomness,
} from "@purosur/domain/fiscal/use-cases";
import type { LocalDatabase } from "../platform/local-database";
import { SqliteRealTimeFiscalDocuments } from "./sqlite-real-time-fiscal-documents";
import { SqliteRoundTripSamples } from "./sqlite-round-trip-samples";

export interface RealTimeSaleAuthorizationDeps {
  database: LocalDatabase;
  taxAuthority: RealTimeTaxAuthority;
  now: () => Date;
  ids: IdGenerator;
  shortCodes: ShortCodeRandomness;
  outboxChainKey: string | undefined;
}

export async function authorizeSaleInRealTime(
  { database, taxAuthority, now, ids, shortCodes, outboxChainKey }: RealTimeSaleAuthorizationDeps,
  saleId: string,
): Promise<RequestRealTimeAuthorizationOutcome> {
  return requestRealTimeAuthorization(
    {
      documents: new SqliteRealTimeFiscalDocuments(database, outboxChainKey),
      roundTrips: new SqliteRoundTripSamples(database),
      taxAuthority,
      clock: { now },
      ids,
      shortCodes,
    },
    { saleId },
  );
}
