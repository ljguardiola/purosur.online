import { describe, expect, it } from "vitest";
import { OFFSITE_DUMP_SHRINK_THRESHOLD_PERCENT } from "../../backups/index.js";
import {
  clockCorrectedObservation,
  externalBillingObservation,
  fiscalDocumentAuthorizedObservation,
  fiscalRejectionAlertObservation,
  fiscalRejectionObservation,
  lotsExpiringObservation,
  lotsNoLongerExpiringObservation,
  offlineAuthorizationCodeHeldObservation,
  offlineAuthorizationCodeMissingObservation,
  offsiteDumpUnverifiedObservation,
  offsiteDumpVerifiedObservation,
  quietRegisterObservation,
  registerFiscalEmissionObservation,
  registerSalesDeniedObservation,
  registerSyncedObservation,
  registerVersionObservation,
} from "./alert-condition-observation.js";

describe("registerVersionObservation", () => {
  it("holds the update-required condition of the register, naming the device and the version, for a version the cloud does not accept", () => {
    expect(
      registerVersionObservation({
        registerId: "register-1",
        deviceId: "device-1",
        appVersion: "0.9.0",
        accepted: false,
      }),
    ).toEqual({
      holds: true,
      alert: {
        kind: "update_required",
        scope: "register-1",
        detail: { deviceId: "device-1", appVersion: "0.9.0" },
      },
    });
  });

  it("clears the update-required condition of the register for a version the cloud accepts", () => {
    expect(
      registerVersionObservation({
        registerId: "register-1",
        deviceId: "device-1",
        appVersion: "1.4.0",
        accepted: true,
      }),
    ).toEqual({ holds: false, kind: "update_required", scope: "register-1" });
  });
});

describe("quietRegisterObservation", () => {
  it("holds the silent-register condition of the register, in its branch, naming the device and when it last synced", () => {
    expect(
      quietRegisterObservation({
        registerId: "register-1",
        deviceId: "device-1",
        locationId: "location-1",
        lastSuccessfulSyncAt: new Date("2026-10-05T14:30:00.000Z"),
      }),
    ).toEqual({
      holds: true,
      alert: {
        kind: "register_silent",
        scope: "register-1",
        locationId: "location-1",
        detail: { deviceId: "device-1", lastAcceptedPushAt: "2026-10-05T14:30:00.000Z" },
      },
    });
  });
});

describe("registerSyncedObservation", () => {
  it("clears the silent-register condition of the register", () => {
    expect(registerSyncedObservation("register-1")).toEqual({
      holds: false,
      kind: "register_silent",
      scope: "register-1",
    });
  });
});

describe("registerSalesDeniedObservation", () => {
  const register = { registerId: "register-1", deviceId: "device-1", locationId: "location-1" };

  it("holds the sales-denied condition of the register, in its branch, naming the device and why, for a register that reports it can't sell", () => {
    expect(
      registerSalesDeniedObservation({
        ...register,
        report: { sales_denied: true, sales_denied_reason: "event_history_broken" },
      }),
    ).toEqual({
      holds: true,
      alert: {
        kind: "sales_denied",
        scope: "register-1",
        locationId: "location-1",
        detail: { deviceId: "device-1", reason: "event_history_broken" },
      },
    });
  });

  it("clears the sales-denied condition of the register for a register that reports it can sell", () => {
    expect(
      registerSalesDeniedObservation({ ...register, report: { sales_denied: false } }),
    ).toEqual({
      holds: false,
      kind: "sales_denied",
      scope: "register-1",
    });
  });

  it("observes nothing of a register that reports nothing about selling", () => {
    expect(registerSalesDeniedObservation({ ...register, report: {} })).toBeUndefined();
  });
});

describe("registerFiscalEmissionObservation", () => {
  const register = { registerId: "register-1", deviceId: "device-1", locationId: "location-1" };

  it("holds the fiscal-emission-stopped condition of the register, in its branch, naming the device and the failed check, for a register that reports its emission stopped", () => {
    expect(
      registerFiscalEmissionObservation({
        ...register,
        report: {
          fiscal_emission_stopped: true,
          fiscal_emission_stopped_reason: "issuer_identification_missing",
        },
      }),
    ).toEqual({
      holds: true,
      alert: {
        kind: "fiscal_emission_stopped",
        scope: "register-1",
        locationId: "location-1",
        detail: { deviceId: "device-1", reason: "issuer_identification_missing" },
      },
    });
  });

  it("clears the fiscal-emission-stopped condition of the register for a register that reports its emission available", () => {
    expect(
      registerFiscalEmissionObservation({
        ...register,
        report: { fiscal_emission_stopped: false },
      }),
    ).toEqual({ holds: false, kind: "fiscal_emission_stopped", scope: "register-1" });
  });

  it("observes nothing of a register that reports nothing about its emission", () => {
    expect(registerFiscalEmissionObservation({ ...register, report: {} })).toBeUndefined();
  });
});

describe("fiscalRejectionObservation", () => {
  const rejections = [{ code: 10242, message: "El valor de CondicionIVAReceptorId es invalido." }];

  it("holds the fiscal-rejected condition of the point of sale and document type, naming the rejection and the document that opened it", () => {
    expect(
      fiscalRejectionObservation({
        pointOfSale: 12,
        documentType: "factura_c",
        rejectionClass: "content",
        fiscalDocumentId: "fiscal-document-1",
        saleId: "sale-1",
        rejections,
      }),
    ).toEqual({
      holds: true,
      alert: {
        kind: "fiscal_rejected",
        scope: "12:factura_c",
        detail: {
          pointOfSale: 12,
          documentType: "factura_c",
          rejectionClass: "content",
          fiscalDocumentId: "fiscal-document-1",
          saleId: "sale-1",
          rejections,
        },
      },
    });
  });

  it("scopes the condition to each point of sale on its own", () => {
    const observation = fiscalRejectionObservation({
      pointOfSale: 3,
      documentType: "factura_c",
      rejectionClass: "standing",
      fiscalDocumentId: "fiscal-document-2",
      saleId: "sale-2",
      rejections,
    });

    expect(observation).toMatchObject({ alert: { scope: "3:factura_c" } });
  });
});

describe("fiscalDocumentAuthorizedObservation", () => {
  it("clears the fiscal-rejected condition of the point of sale and document type", () => {
    expect(
      fiscalDocumentAuthorizedObservation({ pointOfSale: 12, documentType: "factura_c" }),
    ).toEqual({
      holds: false,
      kind: "fiscal_rejected",
      scope: "12:factura_c",
    });
  });
});

describe("fiscalRejectionAlertObservation", () => {
  it("holds the condition for the change that opens the alert", () => {
    const change = {
      kind: "open",
      pointOfSale: 12,
      documentType: "factura_c",
      rejectionClass: "standing",
      fiscalDocumentId: "fiscal-document-1",
      saleId: "sale-1",
      rejections: [{ code: 10005, message: "El punto de venta no es RECE." }],
    } as const;

    expect(fiscalRejectionAlertObservation(change)).toEqual(
      fiscalRejectionObservation({ ...change }),
    );
  });

  it("clears the condition for the change that clears the alert", () => {
    const change = { kind: "clear", pointOfSale: 12, documentType: "factura_c" } as const;

    expect(fiscalRejectionAlertObservation(change)).toEqual(
      fiscalDocumentAuthorizedObservation(change),
    );
  });
});

describe("offlineAuthorizationCodeMissingObservation", () => {
  it("holds the missing-code condition of the register and fortnight at the given level, naming the device and the fortnight", () => {
    expect(
      offlineAuthorizationCodeMissingObservation({
        registerId: "register-1",
        deviceId: "device-1",
        fortnight: { start: "2026-10-16", end: "2026-10-31" },
        level: "warning",
      }),
    ).toEqual({
      holds: true,
      level: "warning",
      alert: {
        kind: "offline_authorization_code_missing",
        scope: "register-1:2026-10-16",
        detail: { deviceId: "device-1", fortnightStart: "2026-10-16", fortnightEnd: "2026-10-31" },
      },
    });
  });
});

describe("offlineAuthorizationCodeHeldObservation", () => {
  it("clears the missing-code condition of the scope", () => {
    expect(offlineAuthorizationCodeHeldObservation("register-1:2026-10-16")).toEqual({
      holds: false,
      kind: "offline_authorization_code_missing",
      scope: "register-1:2026-10-16",
    });
  });
});

describe("lotsExpiringObservation", () => {
  it("holds the lots-expiring condition of the branch, in the branch, naming how many lots and the window", () => {
    expect(
      lotsExpiringObservation({ locationId: "location-1", lotCount: 3, windowDays: 30 }),
    ).toEqual({
      holds: true,
      alert: {
        kind: "lots_expiring",
        scope: "location-1",
        locationId: "location-1",
        detail: { lotCount: 3, windowDays: 30 },
      },
    });
  });
});

describe("lotsNoLongerExpiringObservation", () => {
  it("clears the lots-expiring condition of the scope", () => {
    expect(lotsNoLongerExpiringObservation("location-1")).toEqual({
      holds: false,
      kind: "lots_expiring",
      scope: "location-1",
    });
  });
});

describe("offsiteDumpUnverifiedObservation", () => {
  it("holds the unverified-dump condition of the environment, naming the night and why it is unverified", () => {
    expect(
      offsiteDumpUnverifiedObservation({
        environment: "production",
        night: "2026-10-14",
        reason: "not_reported",
      }),
    ).toEqual({
      holds: true,
      alert: {
        kind: "offsite_dump_unverified",
        scope: "production",
        detail: { night: "2026-10-14", reason: "not_reported" },
      },
    });
  });

  it("names the threshold the dump fell below when it shrank", () => {
    expect(
      offsiteDumpUnverifiedObservation({
        environment: "production",
        night: "2026-10-14",
        reason: "shrank",
      }),
    ).toEqual({
      holds: true,
      alert: {
        kind: "offsite_dump_unverified",
        scope: "production",
        detail: {
          night: "2026-10-14",
          reason: "shrank",
          shrinkThresholdPercent: OFFSITE_DUMP_SHRINK_THRESHOLD_PERCENT,
        },
      },
    });
  });
});

describe("offsiteDumpVerifiedObservation", () => {
  it("clears the unverified-dump condition of the environment", () => {
    expect(offsiteDumpVerifiedObservation("production")).toEqual({
      holds: false,
      kind: "offsite_dump_unverified",
      scope: "production",
    });
  });
});

describe("externalBillingObservation", () => {
  it("holds the condition of the number of the point of sale and document type that no sale accounts for", () => {
    expect(
      externalBillingObservation({ pointOfSale: 12, documentType: "factura_c", number: 41 }),
    ).toEqual({
      holds: true,
      alert: {
        kind: "external_billing",
        scope: "12:factura_c:41",
        detail: { pointOfSale: 12, documentType: "factura_c", number: 41 },
      },
    });
  });

  it("scopes the condition to each number on its own", () => {
    expect(
      externalBillingObservation({ pointOfSale: 12, documentType: "factura_c", number: 42 }),
    ).toMatchObject({ alert: { scope: "12:factura_c:42" } });
    expect(
      externalBillingObservation({ pointOfSale: 3, documentType: "factura_c", number: 41 }),
    ).toMatchObject({ alert: { scope: "3:factura_c:41" } });
  });
});

describe("clockCorrectedObservation", () => {
  const correction = {
    registerId: "register-1",
    locationId: "location-1",
    pointOfSale: 12,
    documentType: "factura_c",
    previousReading: "2026-10-03T12:00:00.000Z",
    correctedReading: "2026-10-01T12:00:00.000Z",
    actorId: "user-1",
  } as const;

  it("holds the condition of the register's clock correction, in its branch, naming the point of sale, both readings and who did it", () => {
    expect(clockCorrectedObservation(correction)).toEqual({
      holds: true,
      alert: {
        kind: "clock_corrected",
        scope: "register-1",
        locationId: "location-1",
        detail: {
          pointOfSale: 12,
          documentType: "factura_c",
          previousReading: "2026-10-03T12:00:00.000Z",
          correctedReading: "2026-10-01T12:00:00.000Z",
          actorId: "user-1",
        },
      },
    });
  });
});
