import { describe, expect, it } from "vitest";
import { OFFSITE_DUMP_SHRINK_THRESHOLD_PERCENT } from "../../backups/index.js";
import {
  clockCorrectedObservation,
  externalBillingObservation,
  fiscalDocumentAuthorizedObservation,
  fiscalRejectionAlertObservation,
  fiscalRejectionObservation,
  invoiceAlreadyCreditedObservation,
  lotsExpiringObservation,
  lotsNoLongerExpiringObservation,
  offlineAuthorizationCodeHeldObservation,
  offlineAuthorizationCodeMissingObservation,
  offsiteDumpUnverifiedObservation,
  offsiteDumpVerifiedObservation,
  quietRegisterObservation,
  registerBackedUpObservation,
  registerBackupOverdueObservation,
  registerBatteryHealthObservation,
  registerBatteryMissingObservation,
  registerClockDriftObservation,
  registerDiskSpaceObservation,
  registerFiscalEmissionObservation,
  registerOnBatteryObservation,
  registerReplenishmentObservation,
  registerSalesDeniedObservation,
  registerSyncedObservation,
  registerVersionObservation,
  registerWalSizeObservation,
  registerZoneRulesObservation,
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

describe("registerClockDriftObservation", () => {
  const register = { registerId: "register-1", deviceId: "device-1", locationId: "location-1" };

  it("holds the clock-drift condition of the register, in its branch, naming the device, for a register that reports its clock drifted", () => {
    expect(registerClockDriftObservation({ ...register, report: { clock_drift: true } })).toEqual({
      holds: true,
      alert: {
        kind: "clock_drift",
        scope: "register-1",
        locationId: "location-1",
        detail: { deviceId: "device-1" },
      },
    });
  });

  it("clears the clock-drift condition of the register for a register that reports its clock within tolerance", () => {
    expect(registerClockDriftObservation({ ...register, report: { clock_drift: false } })).toEqual({
      holds: false,
      kind: "clock_drift",
      scope: "register-1",
    });
  });

  it("observes nothing of a register that reports nothing about its clock", () => {
    expect(registerClockDriftObservation({ ...register, report: {} })).toBeUndefined();
  });
});

describe("registerZoneRulesObservation", () => {
  const register = { registerId: "register-1", deviceId: "device-1", locationId: "location-1" };

  it.each(["2025c", null])(
    "holds the zone-rules-mismatch condition of the register, in its branch, naming the device and both versions, for a register that runs %s while the cloud publishes 2026a",
    (registerVersion) => {
      expect(
        registerZoneRulesObservation({
          ...register,
          report: { zone_rules_version: registerVersion },
          cloudZoneRulesVersion: "2026a",
        }),
      ).toEqual({
        holds: true,
        alert: {
          kind: "tz_rules_mismatch",
          scope: "register-1",
          locationId: "location-1",
          detail: { deviceId: "device-1", registerVersion, cloudVersion: "2026a" },
        },
      });
    },
  );

  it("clears the zone-rules-mismatch condition of the register for a register that runs the cloud's version", () => {
    expect(
      registerZoneRulesObservation({
        ...register,
        report: { zone_rules_version: "2026a" },
        cloudZoneRulesVersion: "2026a",
      }),
    ).toEqual({ holds: false, kind: "tz_rules_mismatch", scope: "register-1" });
  });

  it("observes nothing of a register that reports nothing about its zone rules", () => {
    expect(
      registerZoneRulesObservation({ ...register, report: {}, cloudZoneRulesVersion: "2026a" }),
    ).toBeUndefined();
  });

  it("observes nothing while the cloud has published no version to compare with", () => {
    expect(
      registerZoneRulesObservation({
        ...register,
        report: { zone_rules_version: null },
        cloudZoneRulesVersion: null,
      }),
    ).toBeUndefined();
  });
});

describe("registerReplenishmentObservation", () => {
  const register = { registerId: "register-1", deviceId: "device-1", locationId: "location-1" };

  it.each(["refused", "unreadable_event"] as const)(
    "holds the replenishment-failed condition of the register, in its branch, naming the device and the %s failure",
    (failure) => {
      expect(
        registerReplenishmentObservation({
          ...register,
          report: { replenishment_failed: failure },
        }),
      ).toEqual({
        holds: true,
        alert: {
          kind: "register_replenishment_failed",
          scope: "register-1",
          locationId: "location-1",
          detail: { deviceId: "device-1", failure },
        },
      });
    },
  );

  it("clears the replenishment-failed condition of the register for a register that reports none", () => {
    expect(
      registerReplenishmentObservation({ ...register, report: { replenishment_failed: false } }),
    ).toEqual({ holds: false, kind: "register_replenishment_failed", scope: "register-1" });
  });

  it("observes nothing of a register that reports nothing about its replenishment", () => {
    expect(registerReplenishmentObservation({ ...register, report: {} })).toBeUndefined();
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

  it("holds the condition of a credit note number that no credit note of the register accounts for", () => {
    expect(
      externalBillingObservation({ pointOfSale: 12, documentType: "credit_note_c", number: 3 }),
    ).toEqual({
      holds: true,
      alert: {
        kind: "external_billing",
        scope: "12:credit_note_c:3",
        detail: { pointOfSale: 12, documentType: "credit_note_c", number: 3 },
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
    previousReadingSource: "tax_authority_day",
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
          previousReadingSource: "tax_authority_day",
          correctedReading: "2026-10-01T12:00:00.000Z",
          actorId: "user-1",
        },
      },
    });
  });
});

describe("invoiceAlreadyCreditedObservation", () => {
  it("holds the condition of the invoice of the point of sale and number that a voided sale could not credit", () => {
    expect(
      invoiceAlreadyCreditedObservation({ pointOfSale: 12, number: 41, saleId: "sale-1" }),
    ).toEqual({
      holds: true,
      alert: {
        kind: "invoice_already_credited",
        scope: "12:factura_c:41",
        detail: { pointOfSale: 12, number: 41, saleId: "sale-1" },
      },
    });
  });

  it("scopes the condition to each invoice on its own", () => {
    expect(
      invoiceAlreadyCreditedObservation({ pointOfSale: 12, number: 42, saleId: "sale-1" }),
    ).toMatchObject({ alert: { scope: "12:factura_c:42" } });
    expect(
      invoiceAlreadyCreditedObservation({ pointOfSale: 3, number: 41, saleId: "sale-1" }),
    ).toMatchObject({ alert: { scope: "3:factura_c:41" } });
  });
});

describe("registerBackupOverdueObservation", () => {
  it("holds the overdue-backup condition of the register, naming its last verified generation and first unbacked change", () => {
    expect(
      registerBackupOverdueObservation({
        registerId: "register-1",
        lastVerifiedGenerationAt: new Date("2026-10-14T08:00:00.000Z"),
        firstChangeAt: new Date("2026-10-14T09:15:00.000Z"),
      }),
    ).toEqual({
      holds: true,
      alert: {
        kind: "register_backup_overdue",
        scope: "register-1",
        detail: {
          lastVerifiedGenerationAt: "2026-10-14T08:00:00.000Z",
          firstChangeAt: "2026-10-14T09:15:00.000Z",
        },
      },
    });
  });

  it("names no last verified generation for a register that never had one", () => {
    expect(
      registerBackupOverdueObservation({
        registerId: "register-1",
        lastVerifiedGenerationAt: null,
        firstChangeAt: new Date("2026-10-14T09:15:00.000Z"),
      }),
    ).toMatchObject({
      alert: { detail: { lastVerifiedGenerationAt: null } },
    });
  });
});

describe("registerBackedUpObservation", () => {
  it("clears the overdue-backup condition of the register", () => {
    expect(registerBackedUpObservation("register-1")).toEqual({
      holds: false,
      kind: "register_backup_overdue",
      scope: "register-1",
    });
  });
});

describe("register battery and storage observations", () => {
  const register = { registerId: "register-1", deviceId: "device-1", locationId: "location-1" };
  const storage = { wal_size_bytes: 0, disk_free_bytes: 100 * 1024 ** 3, disk_free_ratio: 0.5 };
  const onBattery = (minutes: number) => ({
    present: true as const,
    charge_percent: 80,
    on_battery: true,
    on_battery_minutes: minutes,
  });
  const onMains = {
    present: true as const,
    charge_percent: 80,
    on_battery: false,
    on_battery_minutes: 0,
  };

  describe("registerOnBatteryObservation", () => {
    it("holds the on-battery condition, naming the device, the minutes and the threshold, once the register has run on battery for 10 minutes", () => {
      expect(
        registerOnBatteryObservation({
          ...register,
          report: { ...storage, battery: onBattery(12) },
        }),
      ).toEqual({
        holds: true,
        alert: {
          kind: "on_battery",
          scope: "register-1",
          locationId: "location-1",
          detail: { deviceId: "device-1", onBatteryMinutes: 12, thresholdMinutes: 10 },
        },
      });
    });

    it("observes nothing while the register has run on battery for under 10 minutes", () => {
      expect(
        registerOnBatteryObservation({
          ...register,
          report: { ...storage, battery: onBattery(9) },
        }),
      ).toBeUndefined();
    });

    it.each([
      ["back on mains power", onMains],
      ["without a battery", { present: false as const }],
    ])("clears the on-battery condition for a register %s", (_name, battery) => {
      expect(
        registerOnBatteryObservation({ ...register, report: { ...storage, battery } }),
      ).toEqual({
        holds: false,
        kind: "on_battery",
        scope: "register-1",
      });
    });

    it("observes nothing of a register whose battery could not be read", () => {
      expect(registerOnBatteryObservation({ ...register, report: storage })).toBeUndefined();
    });
  });

  describe("registerBatteryMissingObservation", () => {
    it("holds the battery-missing condition, naming the device, for a register that reports no battery", () => {
      expect(
        registerBatteryMissingObservation({
          ...register,
          report: { ...storage, battery: { present: false } },
        }),
      ).toEqual({
        holds: true,
        alert: {
          kind: "battery_missing",
          scope: "register-1",
          locationId: "location-1",
          detail: { deviceId: "device-1" },
        },
      });
    });

    it("clears the battery-missing condition for a register that reports a battery", () => {
      expect(
        registerBatteryMissingObservation({
          ...register,
          report: { ...storage, battery: onMains },
        }),
      ).toEqual({ holds: false, kind: "battery_missing", scope: "register-1" });
    });

    it("observes nothing of a register whose battery could not be read", () => {
      expect(registerBatteryMissingObservation({ ...register, report: storage })).toBeUndefined();
    });
  });

  describe("registerBatteryHealthObservation", () => {
    it("holds the battery-health condition, naming the device, the health and the worn limit, for a health below 60 percent", () => {
      expect(
        registerBatteryHealthObservation({
          ...register,
          report: { ...storage, battery: { ...onMains, health_percent: 59 } },
        }),
      ).toEqual({
        holds: true,
        alert: {
          kind: "battery_health_low",
          scope: "register-1",
          locationId: "location-1",
          detail: { deviceId: "device-1", healthPercent: 59, wornBelowPercent: 60 },
        },
      });
    });

    it.each([60, 95])(
      "clears the battery-health condition for a health of %s percent",
      (health) => {
        expect(
          registerBatteryHealthObservation({
            ...register,
            report: { ...storage, battery: { ...onMains, health_percent: health } },
          }),
        ).toEqual({ holds: false, kind: "battery_health_low", scope: "register-1" });
      },
    );

    it("clears the battery-health condition for a register that reports no battery", () => {
      expect(
        registerBatteryHealthObservation({
          ...register,
          report: { ...storage, battery: { present: false } },
        }),
      ).toEqual({ holds: false, kind: "battery_health_low", scope: "register-1" });
    });

    it("observes nothing of a battery that reports no health", () => {
      expect(
        registerBatteryHealthObservation({ ...register, report: { ...storage, battery: onMains } }),
      ).toBeUndefined();
    });

    it("observes nothing of a register whose battery could not be read", () => {
      expect(registerBatteryHealthObservation({ ...register, report: storage })).toBeUndefined();
    });
  });

  describe("registerWalSizeObservation", () => {
    it("holds the oversized-WAL condition, naming the device, its size and the limit, once it passes 256 MB", () => {
      const walSizeBytes = 256 * 1024 * 1024 + 1;
      expect(
        registerWalSizeObservation({
          ...register,
          report: { ...storage, wal_size_bytes: walSizeBytes },
        }),
      ).toEqual({
        holds: true,
        alert: {
          kind: "wal_oversized",
          scope: "register-1",
          locationId: "location-1",
          detail: { deviceId: "device-1", walSizeBytes, limitBytes: 256 * 1024 * 1024 },
        },
      });
    });

    it("clears the oversized-WAL condition at 256 MB", () => {
      expect(
        registerWalSizeObservation({
          ...register,
          report: { ...storage, wal_size_bytes: 256 * 1024 * 1024 },
        }),
      ).toEqual({ holds: false, kind: "wal_oversized", scope: "register-1" });
    });
  });

  describe("registerDiskSpaceObservation", () => {
    it("holds the disk-space condition, naming the device and the free disk, below 20 percent free", () => {
      expect(
        registerDiskSpaceObservation({
          ...register,
          report: { ...storage, disk_free_bytes: 50 * 1024 ** 3, disk_free_ratio: 0.19 },
        }),
      ).toEqual({
        holds: true,
        alert: {
          kind: "register_disk_space_low",
          scope: "register-1",
          locationId: "location-1",
          detail: { deviceId: "device-1", diskFreeBytes: 50 * 1024 ** 3, diskFreeRatio: 0.19 },
        },
      });
    });

    it("clears the disk-space condition at 20 percent and 5 GB free", () => {
      expect(
        registerDiskSpaceObservation({
          ...register,
          report: { ...storage, disk_free_bytes: 5 * 1024 ** 3, disk_free_ratio: 0.2 },
        }),
      ).toEqual({ holds: false, kind: "register_disk_space_low", scope: "register-1" });
    });
  });
});
