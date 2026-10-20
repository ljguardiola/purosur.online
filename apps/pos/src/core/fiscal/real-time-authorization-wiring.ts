import { REAL_TIME_AUTHORIZATION_TIMEOUT_MS } from "@purosur/domain";
import {
  applyUnclearOutcomeDecisions,
  type CloudCreditNotes as CloudCreditNotesPort,
  type IdGenerator,
  type RealTimeTaxAuthority,
  recordRegisterHealthCheck,
  requestVoidCreditNotes,
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
import { authorizeSaleInRealTime } from "./real-time-sale-authorization";
import { startRegisterHealthMonitor } from "./register-health-monitor";
import { SqliteRealTimeFiscalDocuments } from "./sqlite-real-time-fiscal-documents";
import { SqliteRegisterHealthChecks } from "./sqlite-register-health-checks";
import { SqliteVoidCreditNotes } from "./sqlite-void-credit-notes";

export interface RealTimeAuthorizationWiringDeps {
  database: LocalDatabase | undefined;
  cloudClient: CloudClientDeps | undefined;
  readDeviceToken: () => Promise<string | undefined>;
  now: () => Date;
  reportFailure: (error: unknown) => void;
}

interface DeferralIdentities {
  ids: IdGenerator;
  shortCodes: ShortCodeRandomness;
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
  ids,
  shortCodes,
}: RealTimeAuthorizationWiringDeps & DeferralIdentities): RealTimeAuthorization {
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
        await authorizeSaleInRealTime({ database, taxAuthority, now, ids, shortCodes }, saleId);
      } catch (error) {
        reportFailure(error);
        await authorizeSaleInRealTime(
          {
            database,
            taxAuthority: UNABLE_TO_ASK,
            now,
            ids,
            shortCodes,
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
}: Pick<RealTimeAuthorizationWiringDeps, "database" | "now" | "reportFailure"> &
  DeferralIdentities): Promise<void> {
  if (database === undefined) {
    return;
  }
  await settleInterruptedRealTimeAuthorizations({
    documents: new SqliteRealTimeFiscalDocuments(database),
    clock: { now },
    ids,
    shortCodes,
  }).catch(reportFailure);
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
}: RealTimeAuthorizationWiringDeps & {
  scheduleNext: (run: () => void, delayMs: number) => () => void;
}): (() => void) | undefined {
  if (database === undefined || cloudClient === undefined) {
    return undefined;
  }
  const healthChecks = new SqliteRegisterHealthChecks(database);
  const documents = new SqliteRealTimeFiscalDocuments(database);
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
      const { failed } = await applyUnclearOutcomeDecisions({
        documents,
        cloud,
        clock: { now },
      });
      for (const { error } of failed) {
        reportFailure(error);
      }
      if (creditNotesCloud !== undefined) {
        await requestVoidCreditNotes({
          creditNotes,
          cloud: creditNotesCloud,
          clock: { now },
        }).catch(reportFailure);
      }
    },
    scheduleNext,
    onFailure: reportFailure,
  });
}
