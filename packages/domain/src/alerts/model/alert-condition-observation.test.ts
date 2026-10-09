import { describe, expect, it } from "vitest";
import {
  fiscalDocumentAuthorizedObservation,
  fiscalRejectionAlertObservation,
  fiscalRejectionObservation,
  quietRegisterObservation,
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
