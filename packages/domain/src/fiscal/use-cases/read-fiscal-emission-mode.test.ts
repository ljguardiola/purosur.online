import { describe, expect, it } from "vitest";
import type { LatestPreEmissionGateOutcome } from "../model/fiscal-emission-stop.js";
import type { FiscalOnlineSignalEvidence } from "../model/fiscal-online-signal.js";
import type { OfflineSeries, RealTimeSeries } from "../model/real-time-authorization.js";
import {
  FICTIONAL_CUIT,
  FICTIONAL_GROSS_INCOME_REGISTRATION,
  FICTIONAL_LEGAL_NAME,
} from "../test-support/fictional-tax-identities.js";
import { decideSaleAuthorization } from "./decide-sale-authorization.js";
import type { FiscalEmissionModeReads } from "./fiscal-emission-mode-ports.js";
import { readFiscalEmissionMode } from "./read-fiscal-emission-mode.js";
import {
  FakeSaleAuthorizationTransaction,
  SequentialIds,
} from "./test-support/fake-sale-authorization.js";
import { FixedClock } from "./test-support/fixed-clock.js";
import { ScriptedShortCodes } from "./test-support/scripted-short-codes.js";

const NOW = new Date("2026-10-02T02:30:00.000Z");
const ONLINE: FiscalOnlineSignalEvidence = {
  lastHealthCheckOkAt: new Date(NOW.getTime() - 1_000),
  tokenValid: true,
  arcaReachable: true,
};
const OFFLINE: FiscalOnlineSignalEvidence = { ...ONLINE, arcaReachable: false };
const SERIES: RealTimeSeries = {
  pointOfSale: 12,
  localLastAuthorized: 40,
  taxAuthorityLastAuthorized: 38,
  documentRequesting: false,
  documentUnknown: false,
  numberingFrozen: false,
  clockMark: null,
  taxAuthorityLastIssuedOn: null,
  clockCorrections: [],
};
const OFFLINE_SERIES: OfflineSeries = {
  pointOfSale: 7,
  blocksInAssignmentOrder: [{ firstNumber: 101, lastNumber: 1100 }],
  localLastUsed: 120,
  taxAuthorityLastAuthorized: 100,
  highestSyncedNumber: null,
  clockMark: null,
};
const FIRST_HALF = { start: "2026-10-01", end: "2026-10-15" };
const SECOND_HALF = { start: "2026-10-16", end: "2026-10-31" };
const CODE = "71234567890123";

function transaction(
  changes: Partial<ConstructorParameters<typeof FakeSaleAuthorizationTransaction>[0]> = {},
) {
  return new FakeSaleAuthorizationTransaction({
    online: ONLINE,
    series: SERIES,
    offlineSeries: OFFLINE_SERIES,
    heldCodes: [{ fortnight: FIRST_HALF, code: CODE }],
    origin: { registerId: "register-1", actorId: "cashier" },
    takenShortCodes: [],
    ...changes,
  });
}

function readsOf(
  tx: FakeSaleAuthorizationTransaction,
  latestGate: LatestPreEmissionGateOutcome | undefined = undefined,
): FiscalEmissionModeReads {
  return {
    fiscalOnlineEvidence: () => tx.fiscalOnlineEvidence(),
    realTimeSeries: () => tx.realTimeSeries(),
    offlineSeries: () => tx.offlineSeries(),
    offlineAuthorizationCodeOf: (fortnight) => tx.offlineAuthorizationCodeOf(fortnight),
    latestPreEmissionGateOutcome: () => latestGate,
  };
}

function modeOf(changes: Parameters<typeof transaction>[0] = {}) {
  return readFiscalEmissionMode(readsOf(transaction(changes)), new FixedClock(NOW));
}

describe("readFiscalEmissionMode", () => {
  it("answers the mode of the register's series and connectivity", () => {
    expect(modeOf({ online: OFFLINE })).toEqual({ kind: "offline_code", cause: "no_connectivity" });
  });

  it("answers the register's latest pre-emission gate", () => {
    expect(
      readFiscalEmissionMode(
        readsOf(transaction({ online: OFFLINE }), {
          kind: "failed",
          reason: "issuer_identification_missing",
        }),
        new FixedClock(NOW),
      ),
    ).toEqual({ kind: "deferring", reason: "pre_emission_gate_failed" });
  });

  it("looks the code up for the fortnight of the moment the clock gives", () => {
    const tx = transaction({ online: OFFLINE });

    readFiscalEmissionMode(readsOf(tx), new FixedClock(new Date("2026-10-20T15:00:00.000Z")));

    expect(tx.codeLookups).toEqual([SECOND_HALF]);
  });
});

describe("the mode and a real sale", () => {
  const DOCUMENT = {
    kind: "passed",
    document: {
      invoiceClass: "C",
      total: 100,
      netAmount: 100,
      vatAmount: 0,
      issuer: {
        legalName: FICTIONAL_LEGAL_NAME,
        cuit: FICTIONAL_CUIT,
        taxStatus: "MONOTRIBUTO",
        grossIncomeRegistration: FICTIONAL_GROSS_INCOME_REGISTRATION,
        activityStartDate: "2020-01-01",
        version: 1,
      },
      buyerTaxStatusCode: 5,
      buyerTaxStatusDescription: "Consumidor Final",
    },
  } as const;

  it.each([
    ["online with its series ready", {}],
    ["without connectivity", { online: OFFLINE }],
    ["without connectivity and without a code", { online: OFFLINE, heldCodes: [] }],
    ["with a frozen numbering", { series: { ...SERIES, numberingFrozen: true } }],
    ["with an unknown document", { series: { ...SERIES, documentUnknown: true } }],
    ["without a point of sale", { series: { ...SERIES, pointOfSale: null } }],
  ])("a sale %s is issued offline exactly when the mode is the offline code", (_case, changes) => {
    const mode = modeOf(changes);
    const outcome = decideSaleAuthorization(
      transaction(changes),
      new SequentialIds(),
      new ScriptedShortCodes(["7KQ4M2P9"]),
      { saleId: "sale-1", gate: DOCUMENT, decidedAt: NOW, occurredAt: NOW, total: 100 },
    );

    expect(outcome.kind === "issued_offline").toBe(mode.kind === "offline_code");
    expect(outcome.kind === "reserved").toBe(mode.kind === "real_time");
    expect(outcome.kind === "deferred").toBe(mode.kind === "deferring");
  });
});
