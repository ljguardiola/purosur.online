import {
  type RealTimeTaxAuthority,
  type RequestRealTimeAuthorizationOutcome,
  requestRealTimeAuthorization,
} from "@purosur/domain/fiscal/use-cases";
import type { LocalDatabase } from "../platform/local-database";
import { SqliteRealTimeFiscalDocuments } from "./sqlite-real-time-fiscal-documents";
import { SqliteRoundTripSamples } from "./sqlite-round-trip-samples";

export interface RealTimeSaleAuthorizationDeps {
  database: LocalDatabase;
  taxAuthority: RealTimeTaxAuthority;
  now: () => Date;
}

export async function authorizeSaleInRealTime(
  { database, taxAuthority, now }: RealTimeSaleAuthorizationDeps,
  saleId: string,
): Promise<RequestRealTimeAuthorizationOutcome> {
  return requestRealTimeAuthorization(
    {
      documents: new SqliteRealTimeFiscalDocuments(database),
      roundTrips: new SqliteRoundTripSamples(database),
      taxAuthority,
      clock: { now },
    },
    { saleId },
  );
}
