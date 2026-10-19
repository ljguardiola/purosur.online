import { describe, expectTypeOf, it } from "vitest";
import type { ALERT_KINDS } from "./alert-catalog.js";
import type { AlertDetails, OpenAlertInput } from "./alert-details.js";

describe("AlertDetails", () => {
  it("has an entry for every alert kind", () => {
    expectTypeOf<keyof AlertDetails>().toEqualTypeOf<(typeof ALERT_KINDS)[number]>();
  });
});

describe("OpenAlertInput", () => {
  it("accepts the lots count and the window in days, with the branch, for a lots-expiring alert", () => {
    expectTypeOf<{
      kind: "lots_expiring";
      scope: string;
      locationId: string;
      detail: { lotCount: number; windowDays: number };
    }>().toExtend<OpenAlertInput>();
  });

  it("refuses a lots-expiring alert without the window in days", () => {
    expectTypeOf<{
      kind: "lots_expiring";
      scope: string;
      locationId: string;
      detail: { lotCount: number };
    }>().not.toExtend<OpenAlertInput>();
  });

  it("accepts the night and the reason it is unverified for an unverified-dump alert", () => {
    expectTypeOf<{
      kind: "offsite_dump_unverified";
      scope: string;
      detail: { night: string; reason: "not_reported" | "hash_mismatch" };
    }>().toExtend<OpenAlertInput>();
  });

  it("accepts the threshold the dump fell below for an unverified-dump alert of a shrank dump", () => {
    expectTypeOf<{
      kind: "offsite_dump_unverified";
      scope: string;
      detail: { night: string; reason: "shrank"; shrinkThresholdPercent: number };
    }>().toExtend<OpenAlertInput>();
  });

  it("refuses an unverified-dump alert of a shrank dump without the threshold it fell below", () => {
    expectTypeOf<{
      kind: "offsite_dump_unverified";
      scope: string;
      detail: { night: string; reason: "shrank" };
    }>().not.toExtend<OpenAlertInput>();
  });

  it("refuses an unverified-dump alert with a reason the check cannot give", () => {
    expectTypeOf<{
      kind: "offsite_dump_unverified";
      scope: string;
      detail: { night: string; reason: "disk_full" };
    }>().not.toExtend<OpenAlertInput>();
  });

  it("accepts the expiry of the certificate for an expiring-certificate alert", () => {
    expectTypeOf<{
      kind: "arca_certificate_expiring";
      scope: string;
      detail: { notAfter: string };
    }>().toExtend<OpenAlertInput>();
  });

  it("accepts the interval the cloud asks for a ticket again for a held-ticket alert", () => {
    expectTypeOf<{
      kind: "arca_wsaa_ticket_held";
      scope: string;
      detail: { retryIntervalMinutes: number };
    }>().toExtend<OpenAlertInput>();
  });

  it("accepts the device for an outbox-chain-broken alert", () => {
    expectTypeOf<{
      kind: "outbox_chain_broken";
      scope: string;
      detail: { deviceId: string };
    }>().toExtend<OpenAlertInput>();
  });

  it("accepts the device and the version that is no longer accepted for an update-required alert", () => {
    expectTypeOf<{
      kind: "update_required";
      scope: string;
      detail: { deviceId: string; appVersion: string };
    }>().toExtend<OpenAlertInput>();
  });

  it("accepts the device and when it last had a push accepted for a silent-register alert", () => {
    expectTypeOf<{
      kind: "register_silent";
      scope: string;
      locationId: string;
      detail: { deviceId: string; lastAcceptedPushAt: string };
    }>().toExtend<OpenAlertInput>();
  });

  it("accepts the device and the reason it can't sell for a sales-denied alert", () => {
    expectTypeOf<{
      kind: "sales_denied";
      scope: string;
      locationId: string;
      detail: { deviceId: string; reason: "event_history_broken" };
    }>().toExtend<OpenAlertInput>();
  });

  it("refuses a sales-denied alert with a reason the register does not report", () => {
    expectTypeOf<{
      kind: "sales_denied";
      scope: string;
      locationId: string;
      detail: { deviceId: string; reason: "installation_revoked" };
    }>().not.toExtend<OpenAlertInput>();
  });

  it("accepts the device and the failed check's reason for a fiscal-emission-stopped alert", () => {
    expectTypeOf<{
      kind: "fiscal_emission_stopped";
      scope: string;
      locationId: string;
      detail: { deviceId: string; reason: "legal_name_missing" };
    }>().toExtend<OpenAlertInput>();
  });

  it("accepts the device for a clock-drift alert", () => {
    expectTypeOf<{
      kind: "clock_drift";
      scope: string;
      locationId: string;
      detail: { deviceId: string };
    }>().toExtend<OpenAlertInput>();
  });

  it("refuses a fiscal-emission-stopped alert with a reason the pre-emission check does not fail for", () => {
    expectTypeOf<{
      kind: "fiscal_emission_stopped";
      scope: string;
      locationId: string;
      detail: { deviceId: string; reason: "out_of_paper" };
    }>().not.toExtend<OpenAlertInput>();
  });

  it("accepts the point of sale, document type, class, documents and rejections for a fiscal-rejected alert", () => {
    expectTypeOf<{
      kind: "fiscal_rejected";
      scope: string;
      detail: {
        pointOfSale: number;
        documentType: "factura_c";
        rejectionClass: "content" | "standing";
        fiscalDocumentId: string;
        saleId: string;
        rejections: { code: number; message: string }[];
      };
    }>().toExtend<OpenAlertInput>();
  });

  it("refuses a fiscal-rejected alert with a rejection class the domain does not know", () => {
    expectTypeOf<{
      kind: "fiscal_rejected";
      scope: string;
      detail: {
        pointOfSale: number;
        documentType: "factura_c";
        rejectionClass: "transport";
        fiscalDocumentId: string;
        saleId: string;
        rejections: { code: number; message: string }[];
      };
    }>().not.toExtend<OpenAlertInput>();
  });

  it("refuses a silent-register alert with no last accepted push", () => {
    expectTypeOf<{
      kind: "register_silent";
      scope: string;
      locationId: string;
      detail: { deviceId: string; lastAcceptedPushAt: null };
    }>().not.toExtend<OpenAlertInput>();
  });

  it("accepts the detail of the kind it names", () => {
    expectTypeOf<{
      kind: "user_email_changed";
      scope: string;
      detail: { previousEmail: string; newEmail: string; actorId: string };
    }>().toExtend<OpenAlertInput>();
  });

  it("refuses the detail of another kind", () => {
    expectTypeOf<{
      kind: "user_email_changed";
      scope: string;
      detail: { requestedAt: string; issuedAt: string; expiresAt: string };
    }>().not.toExtend<OpenAlertInput>();
  });

  it("refuses a passkey change that mixes action and route", () => {
    expectTypeOf<{
      kind: "backoffice_passkey_changed";
      scope: string;
      detail: { action: "removed"; passkeyName: string; actorId: string; via: "recovery" };
    }>().not.toExtend<OpenAlertInput>();
  });

  it("refuses an access increase naming a cause without its fields", () => {
    expectTypeOf<{
      kind: "user_access_increased";
      scope: string;
      detail: { cause: "role_assigned"; actorId: string };
    }>().not.toExtend<OpenAlertInput>();
  });
});

describe("OpenAlertInput of a fortnight report", () => {
  it("accepts the point of sale, its register, the fortnight, the deadline, the days left and the reason for a pending alert", () => {
    expectTypeOf<{
      kind: "fortnight_report_pending";
      scope: string;
      detail: {
        pointOfSaleNumber: number;
        registerId: string;
        fortnightStart: string;
        fortnightEnd: string;
        deadline: string;
        daysLeft: number;
        reason: "blocked" | "missing_document" | "refused" | "pending";
      };
    }>().toExtend<OpenAlertInput>();
  });

  it("refuses a pending alert with a reason outside the four it can have", () => {
    expectTypeOf<{
      kind: "fortnight_report_pending";
      scope: string;
      detail: {
        pointOfSaleNumber: number;
        registerId: string;
        fortnightStart: string;
        fortnightEnd: string;
        deadline: string;
        daysLeft: number;
        reason: "unknown";
      };
    }>().not.toExtend<OpenAlertInput>();
  });

  it("accepts the point of sale, its register, the fortnight and the deadline for an overdue alert", () => {
    expectTypeOf<{
      kind: "fortnight_report_overdue";
      scope: string;
      detail: {
        pointOfSaleNumber: number;
        registerId: string;
        fortnightStart: string;
        fortnightEnd: string;
        deadline: string;
      };
    }>().toExtend<OpenAlertInput>();
  });

  it("accepts the point of sale, its register and the fortnight, without a deadline, for an alert that needs regularization", () => {
    expectTypeOf<{
      kind: "fortnight_report_needs_regularization";
      scope: string;
      detail: {
        pointOfSaleNumber: number;
        registerId: string;
        fortnightStart: string;
        fortnightEnd: string;
      };
    }>().toExtend<OpenAlertInput>();
  });

  it("refuses an alert that needs regularization without the fortnight's end", () => {
    expectTypeOf<{
      kind: "fortnight_report_needs_regularization";
      scope: string;
      detail: {
        pointOfSaleNumber: number;
        registerId: string;
        fortnightStart: string;
      };
    }>().not.toExtend<OpenAlertInput>();
  });

  it("refuses an overdue alert without the deadline", () => {
    expectTypeOf<{
      kind: "fortnight_report_overdue";
      scope: string;
      detail: {
        pointOfSaleNumber: number;
        registerId: string;
        fortnightStart: string;
        fortnightEnd: string;
      };
    }>().not.toExtend<OpenAlertInput>();
  });
});

describe("a clock corrected alert", () => {
  it("accepts the point of sale, the document type, both readings and who corrected the clock", () => {
    expectTypeOf<{
      kind: "clock_corrected";
      scope: string;
      detail: {
        pointOfSale: number;
        documentType: "factura_c";
        previousReading: string;
        correctedReading: string;
        actorId: string;
      };
    }>().toExtend<OpenAlertInput>();
  });

  it("refuses one without who corrected the clock", () => {
    expectTypeOf<{
      kind: "clock_corrected";
      scope: string;
      detail: {
        pointOfSale: number;
        documentType: "factura_c";
        previousReading: string;
        correctedReading: string;
      };
    }>().not.toExtend<OpenAlertInput>();
  });
});

describe("an external billing alert", () => {
  it("accepts the point of sale, the document type and the number", () => {
    expectTypeOf<{
      kind: "external_billing";
      scope: string;
      detail: { pointOfSale: number; documentType: "factura_c"; number: number };
    }>().toExtend<OpenAlertInput>();
  });

  it("refuses one without its number", () => {
    expectTypeOf<{
      kind: "external_billing";
      scope: string;
      detail: { pointOfSale: number; documentType: "factura_c" };
    }>().not.toExtend<OpenAlertInput>();
  });
});

describe("an invoice already credited alert", () => {
  it("accepts the point of sale and number of the invoice and the sale that was voided", () => {
    expectTypeOf<{
      kind: "invoice_already_credited";
      scope: string;
      detail: { pointOfSale: number; number: number; saleId: string };
    }>().toExtend<OpenAlertInput>();
  });

  it("refuses one without its sale", () => {
    expectTypeOf<{
      kind: "invoice_already_credited";
      scope: string;
      detail: { pointOfSale: number; number: number };
    }>().not.toExtend<OpenAlertInput>();
  });
});
