import { REAL_TIME_AUTHORIZATION_TIMEOUT_MS } from "@purosur/domain";
import {
  applyUnclearOutcomeDecisions,
  type CatchUpDeferredSalesPorts,
  type CloudCreditNotes as CloudCreditNotesPort,
  catchUpDeferredSales,
  type IdGenerator,
  type RealTimeTaxAuthority,
  recordRegisterHealthCheck,
  requestPendingCreditNotes,
  type ShortCodeRandomness,
  settleInterruptedRealTimeAuthorizations,
} from "@purosur/domain/fiscal/use-cases";
import {
  type CloudClientDeps,
  getFromCloud,
  postToCloudWithBearer,
} from "../platform/cloud-client";
import type { LocalDatabase } from "../platform/local-database";
import { checkRegisterHealth } from "./check-register-health";
import { CloudCreditNotes } from "./cloud-credit-notes";
import { CloudRealTimeTaxAuthority } from "./cloud-real-time-tax-authority";
import { CloudUnclearOutcomeDecisions } from "./cloud-unclear-outcome-decisions";
import {
  createDeferredBacklogSerializer,
  type DeferredBacklogSerializer,
} from "./deferred-backlog-serializer";
import { authorizeSaleInRealTime } from "./real-time-sale-authorization";
import { startRegisterHealthMonitor } from "./register-health-monitor";
import { SqliteDeferredSaleCatchUp } from "./sqlite-deferred-sale-catch-up";
import { SqliteRealTimeFiscalDocuments } from "./sqlite-real-time-fiscal-documents";
import { SqliteRegisterHealthChecks } from "./sqlite-register-health-checks";
import { SqliteRoundTripSamples } from "./sqlite-round-trip-samples";
import { SqliteVoidCreditNotes } from "./sqlite-void-credit-notes";

export interface RealTimeAuthorizationWiringDeps {
  database: LocalDatabase | undefined;
  cloudClient: CloudClientDeps | undefined;
  readDeviceToken: () => Promise<string | undefined>;
  now: () => Date;
  reportFailure: (error: unknown) => void;
}

export interface DeferralIdentities {
  ids: IdGenerator;
  shortCodes: ShortCodeRandomness;
  readOutboxChainKey: () => Promise<string | undefined>;
}

interface RealTimeAuthorization {
  authorizeSale(saleId: string): Promise<void>;
}

const UNABLE_TO_ASK: RealTimeTaxAuthority = {
  authorize: async () => ({ kind: "unclear" }),
};

function realTimeTaxAuthority({
  cloudClient,
  readDeviceToken,
}: Pick<RealTimeAuthorizationWiringDeps, "cloudClient" | "readDeviceToken">): RealTimeTaxAuthority {
  return cloudClient === undefined
    ? UNABLE_TO_ASK
    : new CloudRealTimeTaxAuthority({
        readDeviceToken,
        post: (path, bearerToken, body, options) =>
          postToCloudWithBearer(cloudClient, path, bearerToken, body, options),
      });
}

export function deferredSaleCatchUpPorts(
  database: LocalDatabase,
  outboxChainKey: string | undefined,
  {
    cloudClient,
    readDeviceToken,
    now,
    ids,
    shortCodes,
  }: Pick<RealTimeAuthorizationWiringDeps, "cloudClient" | "readDeviceToken" | "now"> &
    Pick<DeferralIdentities, "ids" | "shortCodes">,
): CatchUpDeferredSalesPorts {
  return {
    catchUp: new SqliteDeferredSaleCatchUp(database, outboxChainKey),
    documents: new SqliteRealTimeFiscalDocuments(database, outboxChainKey),
    roundTrips: new SqliteRoundTripSamples(database),
    taxAuthority: realTimeTaxAuthority({ cloudClient, readDeviceToken }),
    clock: { now },
    ids,
    shortCodes,
  };
}

export function createRealTimeAuthorization({
  database,
  cloudClient,
  readDeviceToken,
  now,
  reportFailure,
  ids,
  shortCodes,
  readOutboxChainKey,
}: RealTimeAuthorizationWiringDeps & DeferralIdentities): RealTimeAuthorization {
  if (database === undefined) {
    return { authorizeSale: async () => undefined };
  }
  const taxAuthority = realTimeTaxAuthority({ cloudClient, readDeviceToken });
  return {
    authorizeSale: async (saleId) => {
      try {
        await authorizeSaleInRealTime(
          { database, taxAuthority, now, ids, shortCodes, readOutboxChainKey },
          saleId,
        );
      } catch (error) {
        reportFailure(error);
        await authorizeSaleInRealTime(
          {
            database,
            taxAuthority: UNABLE_TO_ASK,
            now,
            ids,
            shortCodes,
            readOutboxChainKey,
          },
          saleId,
        ).catch(reportFailure);
      }
    },
  };
}

export async function settleInterruptedAuthorizations({
  database,
  now,
  reportFailure,
  ids,
  shortCodes,
  readOutboxChainKey,
}: Pick<RealTimeAuthorizationWiringDeps, "database" | "now" | "reportFailure"> &
  DeferralIdentities): Promise<void> {
  if (database === undefined) {
    return;
  }
  await (async () =>
    settleInterruptedRealTimeAuthorizations({
      documents: new SqliteRealTimeFiscalDocuments(database, await readOutboxChainKey()),
      clock: { now },
      ids,
      shortCodes,
    }))().catch(reportFailure);
}

export function cloudCreditNotes({
  cloudClient,
  readDeviceToken,
}: Pick<RealTimeAuthorizationWiringDeps, "cloudClient" | "readDeviceToken">):
  | CloudCreditNotesPort
  | undefined {
  return cloudClient === undefined
    ? undefined
    : new CloudCreditNotes({
        timeoutMs: REAL_TIME_AUTHORIZATION_TIMEOUT_MS,
        readDeviceToken,
        post: (path, bearerToken, body, options) =>
          postToCloudWithBearer(cloudClient, path, bearerToken, body, options),
      });
}

export function startRegisterHealthChecks({
  database,
  cloudClient,
  readDeviceToken,
  now,
  scheduleNext,
  reportFailure,
  afterCheck,
  ids,
  shortCodes,
  readOutboxChainKey,
  serialize = createDeferredBacklogSerializer(),
}: RealTimeAuthorizationWiringDeps &
  DeferralIdentities & {
    scheduleNext: (run: () => void, delayMs: number) => () => void;
    afterCheck?: () => void;
    serialize?: DeferredBacklogSerializer;
  }): (() => void) | undefined {
  if (database === undefined || cloudClient === undefined) {
    return undefined;
  }
  const healthChecks = new SqliteRegisterHealthChecks(database);
  const cloud = new CloudUnclearOutcomeDecisions({
    readDeviceToken,
    post: (path, bearerToken, body, options) =>
      postToCloudWithBearer(cloudClient, path, bearerToken, body, options),
  });
  const creditNotes = new SqliteVoidCreditNotes(database);
  const creditNotesCloud = cloudCreditNotes({ cloudClient, readDeviceToken });
  return startRegisterHealthMonitor({
    check: async () => {
      await checkRegisterHealth({
        readDeviceToken,
        get: (path, headers, options) => getFromCloud(cloudClient, path, headers, options),
        record: (check) => recordRegisterHealthCheck({ healthChecks }, check),
        now,
      }).catch(reportFailure);
      const outboxChainKey = await readOutboxChainKey().then(
        (key) => ({ key }),
        (error: unknown) => {
          reportFailure(error);
          return undefined;
        },
      );
      const documents = new SqliteRealTimeFiscalDocuments(database, outboxChainKey?.key);
      const { failed } = await applyUnclearOutcomeDecisions({
        documents,
        cloud,
        clock: { now },
        ids,
      });
      for (const { error } of failed) {
        reportFailure(error);
      }
      if (outboxChainKey !== undefined) {
        await serialize(() =>
          catchUpDeferredSales(
            deferredSaleCatchUpPorts(database, outboxChainKey.key, {
              cloudClient,
              readDeviceToken,
              now,
              ids,
              shortCodes,
            }),
          ),
        ).catch(reportFailure);
      }
      if (creditNotesCloud !== undefined) {
        await requestPendingCreditNotes({
          creditNotes,
          cloud: creditNotesCloud,
          clock: { now },
        }).catch(reportFailure);
      }
      afterCheck?.();
    },
    scheduleNext,
    onFailure: reportFailure,
  });
}
