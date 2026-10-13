import type {
  AbandonMercadoPagoChargeOutcome,
  FollowMercadoPagoChargeOutcome,
  StartMercadoPagoChargeOutcome,
} from "@purosur/contracts";
import type { FollowInterruptedMercadoPagoChargesOutcome } from "@purosur/domain/payments/use-cases";
import type { IdGenerator } from "@purosur/domain/sales/use-cases";
import {
  type CloudClientDeps,
  getFromCloud,
  postToCloudWithBearer,
} from "../platform/cloud-client";
import type { LocalDatabase } from "../platform/local-database";
import type { ActionGate } from "../sessions/action-gate";
import { CloudMercadoPagoChargeOrders } from "./cloud-mercado-pago-charge-orders";
import {
  abandonMercadoPagoChargeFor,
  followInterruptedMercadoPagoChargesFor,
  followMercadoPagoChargeFor,
  type MercadoPagoChargeRequestDeps,
  startMercadoPagoChargeFor,
} from "./mercado-pago-charge-requests";

export interface MercadoPagoChargingWiringDeps {
  database: LocalDatabase | undefined;
  gate: ActionGate | undefined;
  cloudClient: CloudClientDeps | undefined;
  readDeviceToken: () => Promise<string | undefined>;
  readOutboxChainKey: () => Promise<string | undefined>;
  now: () => Date;
  ids: IdGenerator;
}

interface MercadoPagoCharging {
  start:
    | ((request: {
        saleId: string;
        method: "QR" | "POINT";
        amount: number;
      }) => Promise<StartMercadoPagoChargeOutcome>)
    | undefined;
  follow:
    | ((request: { paymentTransactionId: string }) => Promise<FollowMercadoPagoChargeOutcome>)
    | undefined;
  abandon:
    | ((request: { paymentTransactionId: string }) => Promise<AbandonMercadoPagoChargeOutcome>)
    | undefined;
  followInterrupted:
    | (() => Promise<FollowInterruptedMercadoPagoChargesOutcome<unknown>>)
    | undefined;
}

export function createMercadoPagoCharging({
  database,
  gate,
  cloudClient,
  readDeviceToken,
  readOutboxChainKey,
  now,
  ids,
}: MercadoPagoChargingWiringDeps): MercadoPagoCharging {
  if (database === undefined || gate === undefined || cloudClient === undefined) {
    return {
      start: undefined,
      follow: undefined,
      abandon: undefined,
      followInterrupted: undefined,
    };
  }
  const deps: MercadoPagoChargeRequestDeps = {
    database,
    gate,
    orders: new CloudMercadoPagoChargeOrders({
      readDeviceToken,
      post: (path, bearerToken, body, options) =>
        postToCloudWithBearer(cloudClient, path, bearerToken, body, options),
      get: (path, bearerToken, options) =>
        getFromCloud(cloudClient, path, { authorization: `Bearer ${bearerToken}` }, options),
      now,
    }),
    readOutboxChainKey,
    now,
    ids,
  };
  return {
    start: (request) => startMercadoPagoChargeFor(deps, request),
    follow: (request) => followMercadoPagoChargeFor(deps, request),
    abandon: (request) => abandonMercadoPagoChargeFor(deps, request),
    followInterrupted: () => followInterruptedMercadoPagoChargesFor(deps),
  };
}
