import type { ConvertPaidOrderIntoRefundOutcome } from "@purosur/contracts";
import type { PaidOrderDiscoveryState } from "@purosur/domain";
import {
  type DiscoverPaidOrdersWithoutSaleOutcome,
  discoverPaidOrdersWithoutSale,
} from "@purosur/domain/payments/use-cases";
import type { IdGenerator } from "@purosur/domain/sales/use-cases";
import {
  type CloudClientDeps,
  getFromCloud,
  postToCloudWithBearer,
} from "../platform/cloud-client";
import type { LocalDatabase } from "../platform/local-database";
import type { ReceiptPrinting } from "../sales/receipt-printing-wiring";
import type { ActionGate } from "../sessions/action-gate";
import { CloudPaidOrdersOfRegister } from "./cloud-paid-orders-of-register";
import { convertPaidOrderIntoRefundFor } from "./paid-order-refund-requests";
import { paidOrderSale } from "./paid-order-sale";
import { SqliteLocalPaidOrders } from "./sqlite-local-paid-orders";

export interface PaidOrderDiscovery {
  discoverAtStartup(): Promise<void>;
  afterEachSync(): void;
  state(): PaidOrderDiscoveryState;
}

export interface PaidOrderDiscoveryDeps {
  discover: () => Promise<DiscoverPaidOrdersWithoutSaleOutcome>;
  printing: Pick<ReceiptPrinting, "afterEachCompletedSale">;
  reportFailure: (activity: string, error: unknown) => void;
}

function withCompletedSales(outcome: DiscoverPaidOrdersWithoutSaleOutcome) {
  return {
    outcome,
    followed:
      outcome.kind === "checked"
        ? outcome.completedSaleIds.map((saleId) => ({
            outcome: { kind: "completed", sale_id: saleId },
          }))
        : [],
  };
}

export function createPaidOrderDiscovery({
  discover,
  printing,
  reportFailure,
}: PaidOrderDiscoveryDeps): PaidOrderDiscovery {
  let state: PaidOrderDiscoveryState = "pending";
  let underWay: Promise<void> | undefined;
  const discoverWithCompletedSales = async (_request: undefined) =>
    withCompletedSales(await discover());
  const discoverAndPrint =
    printing.afterEachCompletedSale(discoverWithCompletedSales) ?? discoverWithCompletedSales;

  async function discoverOnce(): Promise<void> {
    try {
      const { outcome } = await discoverAndPrint(undefined);
      if (outcome.kind === "deferred") {
        state = "deferred";
      } else if (outcome.failed > 0) {
        state = "deferred";
        reportFailure(
          `handling ${outcome.failed} paid orders found in the cloud`,
          new Error("the register could not handle every paid order the cloud holds for it"),
        );
      } else {
        state = "checked";
      }
    } catch (error) {
      state = "deferred";
      reportFailure("discovering the paid orders without a sale", error);
    }
  }

  function discoverNow(): Promise<void> {
    if (state === "checked") {
      return Promise.resolve();
    }
    underWay ??= discoverOnce().finally(() => {
      underWay = undefined;
    });
    return underWay;
  }

  return {
    discoverAtStartup: discoverNow,
    afterEachSync: () => {
      void discoverNow();
    },
    state: () => state,
  };
}

export interface PaidOrderDiscoveryWiringDeps {
  database: LocalDatabase | undefined;
  gate: ActionGate | undefined;
  printing: Pick<ReceiptPrinting, "afterEachCompletedSale">;
  cloudClient: CloudClientDeps | undefined;
  readDeviceToken: () => Promise<string | undefined>;
  readOutboxChainKey: () => Promise<string | undefined>;
  now: () => Date;
  ids: IdGenerator;
  reportFailure: (activity: string, error: unknown) => void;
}

export interface PaidOrderDiscoveryWiring extends PaidOrderDiscovery {
  convertIntoRefund:
    | ((request: { paymentTransactionId: string }) => Promise<ConvertPaidOrderIntoRefundOutcome>)
    | undefined;
}

export function createPaidOrderDiscoveryWiring({
  database,
  gate,
  printing,
  cloudClient,
  readDeviceToken,
  readOutboxChainKey,
  now,
  ids,
  reportFailure,
}: PaidOrderDiscoveryWiringDeps): PaidOrderDiscoveryWiring {
  const cloud =
    cloudClient === undefined
      ? undefined
      : new CloudPaidOrdersOfRegister({
          readDeviceToken,
          post: (path, bearerToken, body, options) =>
            postToCloudWithBearer(cloudClient, path, bearerToken, body, options),
          get: (path, bearerToken, options) =>
            getFromCloud(cloudClient, path, { authorization: `Bearer ${bearerToken}` }, options),
        });
  const discovery = createPaidOrderDiscovery({
    discover: async () => {
      if (database === undefined || cloud === undefined) {
        return { kind: "deferred" };
      }
      return discoverPaidOrdersWithoutSale({
        cloud,
        refunds: cloud,
        local: new SqliteLocalPaidOrders({ database }),
        sale: paidOrderSale({ database, outboxChainKey: await readOutboxChainKey(), now, ids }),
        clock: { now },
      });
    },
    printing,
    reportFailure,
  });
  return {
    ...discovery,
    convertIntoRefund:
      database === undefined || gate === undefined || cloud === undefined
        ? undefined
        : (request) =>
            convertPaidOrderIntoRefundFor({ database, gate, refunds: cloud, now }, request),
  };
}
