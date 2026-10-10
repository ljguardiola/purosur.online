import type {
  FollowMercadoPagoQrChargeOutcome,
  StartMercadoPagoQrChargeOutcome,
} from "@purosur/contracts";
import type { IdGenerator } from "@purosur/domain/sales/use-cases";
import {
  type CloudClientDeps,
  getFromCloud,
  postToCloudWithBearer,
} from "../platform/cloud-client";
import type { LocalDatabase } from "../platform/local-database";
import type { ActionGate } from "../sessions/action-gate";
import { CloudMercadoPagoQrChargeOrders } from "./cloud-mercado-pago-qr-charge-orders";
import {
  followMercadoPagoQrChargeFor,
  type MercadoPagoQrChargeRequestDeps,
  startMercadoPagoQrChargeFor,
} from "./mercado-pago-qr-charge-requests";

export interface MercadoPagoQrChargingWiringDeps {
  database: LocalDatabase | undefined;
  gate: ActionGate | undefined;
  cloudClient: CloudClientDeps | undefined;
  readDeviceToken: () => Promise<string | undefined>;
  readOutboxChainKey: () => Promise<string | undefined>;
  now: () => Date;
  ids: IdGenerator;
}

interface MercadoPagoQrCharging {
  start:
    | ((request: { saleId: string; amount: number }) => Promise<StartMercadoPagoQrChargeOutcome>)
    | undefined;
  follow:
    | ((request: { paymentTransactionId: string }) => Promise<FollowMercadoPagoQrChargeOutcome>)
    | undefined;
}

export function createMercadoPagoQrCharging({
  database,
  gate,
  cloudClient,
  readDeviceToken,
  readOutboxChainKey,
  now,
  ids,
}: MercadoPagoQrChargingWiringDeps): MercadoPagoQrCharging {
  if (database === undefined || gate === undefined || cloudClient === undefined) {
    return { start: undefined, follow: undefined };
  }
  const deps: MercadoPagoQrChargeRequestDeps = {
    database,
    gate,
    orders: new CloudMercadoPagoQrChargeOrders({
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
    start: (request) => startMercadoPagoQrChargeFor(deps, request),
    follow: (request) => followMercadoPagoQrChargeFor(deps, request),
  };
}
