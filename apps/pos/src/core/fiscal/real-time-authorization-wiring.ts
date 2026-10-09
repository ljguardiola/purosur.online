import { recordRegisterHealthCheck } from "@purosur/domain/fiscal/use-cases";
import {
  type CloudClientDeps,
  getFromCloud,
  postToCloudWithBearer,
} from "../platform/cloud-client";
import type { LocalDatabase } from "../platform/local-database";
import { authorizingCompletedSales } from "./authorizing-completed-sales";
import { checkRegisterHealth } from "./check-register-health";
import { CloudRealTimeTaxAuthority } from "./cloud-real-time-tax-authority";
import { authorizeSaleInRealTime } from "./real-time-sale-authorization";
import { startRegisterHealthMonitor } from "./register-health-monitor";
import { SqliteRegisterHealthChecks } from "./sqlite-register-health-checks";

export interface RealTimeAuthorizationWiringDeps {
  database: LocalDatabase | undefined;
  cloudClient: CloudClientDeps | undefined;
  readDeviceToken: () => Promise<string | undefined>;
  now: () => Date;
  reportFailure: (error: unknown) => void;
}

interface RealTimeAuthorization {
  afterCompletedSale<TRequest, TOutcome extends { kind: string }>(
    charge: ((request: TRequest) => Promise<TOutcome>) | undefined,
  ): ((request: TRequest) => Promise<TOutcome>) | undefined;
}

export function createRealTimeAuthorization({
  database,
  cloudClient,
  readDeviceToken,
  now,
  reportFailure,
}: RealTimeAuthorizationWiringDeps): RealTimeAuthorization {
  if (database === undefined || cloudClient === undefined) {
    return { afterCompletedSale: (charge) => charge };
  }
  const taxAuthority = new CloudRealTimeTaxAuthority({
    readDeviceToken,
    post: (path, bearerToken, body, options) =>
      postToCloudWithBearer(cloudClient, path, bearerToken, body, options),
  });
  return {
    afterCompletedSale: (charge) =>
      charge &&
      authorizingCompletedSales(
        {
          authorizeSale: (saleId) =>
            authorizeSaleInRealTime({ database, taxAuthority, now }, saleId),
          onFailure: reportFailure,
        },
        charge,
      ),
  };
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
