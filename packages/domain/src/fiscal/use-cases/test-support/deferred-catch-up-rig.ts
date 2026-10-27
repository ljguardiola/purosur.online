import type { DeferredBacklogEntry } from "../../model/deferred-backlog.js";
import type { RealTimeAuthorizationAnswer } from "../../model/real-time-authorization.js";
import {
  FICTIONAL_CUIT,
  FICTIONAL_GROSS_INCOME_REGISTRATION,
  FICTIONAL_LEGAL_NAME,
} from "../../test-support/fictional-tax-identities.js";
import type { CatchUpDeferredSalesPorts } from "../catch-up-deferred-sales-ports.js";
import { ManualClock } from "./fake-arca-vitality.js";
import {
  type BacklogSale,
  FakeDeferredSaleCatchUp,
  type FakeDeferredSaleCatchUpState,
  ScriptedRealTimeTaxAuthority,
} from "./fake-deferred-sale-catch-up.js";
import { FakeRoundTripSamples } from "./fake-real-time-authorization.js";
import { SequentialIds } from "./fake-sale-authorization.js";
import { ScriptedShortCodes } from "./scripted-short-codes.js";

export const NOW = new Date("2026-10-03T15:00:00.000Z");
export const ORIGIN = { registerId: "register-1", actorId: "cashier" };

export const AUTHORIZED: RealTimeAuthorizationAnswer = {
  kind: "authorized",
  authorizationCode: "75123456789012",
  authorizationCodeDueOn: "2026-10-13",
};
export const REJECTED: RealTimeAuthorizationAnswer = {
  kind: "rejected",
  codes: [10015],
  rejectionClass: "content",
};

export function sale(
  id: string,
  occurredAt: string,
  overrides: Partial<DeferredBacklogEntry> = {},
): BacklogSale {
  return {
    origin: ORIGIN,
    entry: {
      deferredSaleId: `deferred-of-${id}`,
      saleId: id,
      occurredAt: new Date(occurredAt),
      routedAt: new Date(occurredAt),
      total: 1_000,
      lastAttemptEndedAt: null,
      ...overrides,
    },
  };
}

export const FIRST = sale("sale-1", "2026-10-01T14:00:00.000Z");
export const SECOND = sale("sale-2", "2026-10-02T02:30:00.000Z");
export const THIRD = sale("sale-3", "2026-10-02T13:00:00.000Z");

export function state(
  overrides: Partial<FakeDeferredSaleCatchUpState> = {},
): FakeDeferredSaleCatchUpState {
  return {
    series: {
      pointOfSale: 12,
      taxAuthorityLastAuthorized: 100,
      numberingFrozen: false,
      clockMark: null,
      taxAuthorityLastIssuedOn: "2026-09-30",
      clockCorrections: [],
    },
    online: { lastHealthCheckOkAt: NOW, tokenValid: true, arcaReachable: true },
    issuer: {
      legalName: FICTIONAL_LEGAL_NAME,
      grossIncomeRegistration: FICTIONAL_GROSS_INCOME_REGISTRATION,
      activityStartDate: "2020-01-01",
      authorizedCuit: FICTIONAL_CUIT,
      taxStatus: "MONOTRIBUTO",
      version: 3,
    },
    buyerTaxStatuses: [{ code: 5, description: "Consumidor Final", invoiceClass: "C" }],
    awaitingRestoredNumbering: false,
    backlog: [FIRST, SECOND, THIRD],
    holdingAuthorizedDocument: [],
    ...overrides,
  };
}

export function deferredCatchUpRig(
  overrides: Partial<FakeDeferredSaleCatchUpState> = {},
  answers: readonly RealTimeAuthorizationAnswer[] = [AUTHORIZED],
) {
  const register = new FakeDeferredSaleCatchUp(state(overrides));
  const taxAuthority = new ScriptedRealTimeTaxAuthority(answers);
  const ports: CatchUpDeferredSalesPorts = {
    catchUp: register,
    documents: register,
    roundTrips: new FakeRoundTripSamples([100]),
    taxAuthority,
    clock: new ManualClock(NOW),
    ids: new SequentialIds(),
    shortCodes: new ScriptedShortCodes(["7KQ4M2P9"]),
  };
  return { register, taxAuthority, ports };
}
