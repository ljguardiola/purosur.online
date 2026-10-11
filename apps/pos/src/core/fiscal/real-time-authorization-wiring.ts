import {
  type RealTimeTaxAuthority,
  recordRegisterHealthCheck,
  settleInterruptedRealTimeAuthorizations,
} from "@purosur/domain/fiscal/use-cases";
import {
  type CloudClientDeps,
  getFromCloud,
  postToCloudWithBearer,
} from "../platform/cloud-client";
import type { LocalDatabase } from "../platform/local-database";
import { checkRegisterHealth } from "./check-register-health";
import { CloudRealTimeTaxAuthority } from "./cloud-real-time-tax-authority";
import { authorizeSaleInRealTime } from "./real-time-sale-authorization";
import { startRegisterHealthMonitor } from "./register-health-monitor";
import { SqliteRealTimeFiscalDocuments } from "./sqlite-real-time-fiscal-documents";
import { SqliteRegisterHealthChecks } from "./sqlite-register-health-checks";

export interface RealTimeAuthorizationWiringDeps {
  database: LocalDatabase | undefined;
  cloudClient: CloudClientDeps | undefined;
  readDeviceToken: () => Promise<string | undefined>;
  now: () => Date;
  reportFailure: (error: unknown) => void;
}

interface RealTimeAuthorization {
  authorizeSale(saleId: string): Promise<void>;
}

const UNABLE_TO_ASK: RealTimeTaxAuthority = {
  authorize: async () => ({ kind: "unclear" }),
};

export function createRealTimeAuthorization({
  database,
  cloudClient,
  readDeviceToken,
  now,
  reportFailure,
}: RealTimeAuthorizationWiringDeps): RealTimeAuthorization {
  if (database === undefined) {
    return { authorizeSale: async () => undefined };
  }
  const taxAuthority =
    cloudClient === undefined
      ? UNABLE_TO_ASK
      : new CloudRealTimeTaxAuthority({
          readDeviceToken,
          post: (path, bearerToken, body, options) =>
            postToCloudWithBearer(cloudClient, path, bearerToken, body, options),
        });
  return {
    authorizeSale: async (saleId) => {
      try {
        await authorizeSaleInRealTime({ database, taxAuthority, now }, saleId);
      } catch (error) {
        reportFailure(error);
        await authorizeSaleInRealTime({ database, taxAuthority: UNABLE_TO_ASK, now }, saleId).catch(
          reportFailure,
        );
      }
    },
  };
}

export async function settleInterruptedAuthorizations({
  database,
  now,
  reportFailure,
}: Pick<RealTimeAuthorizationWiringDeps, "database" | "now" | "reportFailure">): Promise<void> {
  if (database === undefined) {
    return;
  }
  await settleInterruptedRealTimeAuthorizations({
    documents: new SqliteRealTimeFiscalDocuments(database),
    clock: { now },
  }).catch(reportFailure);
}

export function startRegisterHealthChecks({
  database,
  cloudClient,
  readDeviceToken,
  now,
  scheduleNext,
  reportFailure,
}: RealTimeAuthorizationWiringDeps & {
  scheduleNext: (run: () => void, delayMs: number) => () => void;
}): (() => void) | undefined {
  if (database === undefined || cloudClient === undefined) {
    return undefined;
  }
  const healthChecks = new SqliteRegisterHealthChecks(database);
  return startRegisterHealthMonitor({
    check: () =>
      checkRegisterHealth({
        readDeviceToken,
        get: (path, headers, options) => getFromCloud(cloudClient, path, headers, options),
        record: (check) => recordRegisterHealthCheck({ healthChecks }, check),
        now,
      }),
    scheduleNext,
    onFailure: reportFailure,
  });
}
