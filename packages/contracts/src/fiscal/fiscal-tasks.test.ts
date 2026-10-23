import { ARGENTINA_TIME_ZONE, FISCAL_TASK_KINDS } from "@purosur/domain";
import { describe, expect, expectTypeOf, it } from "vitest";
import { type FiscalTaskItem, fiscalTaskItemSchema, fiscalTasksSchema } from "./fiscal-tasks.js";

const common = {
  id: "5b9e2f4a-7c1d-4e83-a6f0-3d8c1b7e9a42",
  register_id: "3f0d1a52-0f7e-4a53-9f4c-2a7d2f1c9b10",
  register_name: "Caja 1",
  created_at: "2026-10-16T03:05:00.000Z",
  open_for_seconds: 86400,
  alert: null,
};

const externalInvoicing = {
  ...common,
  kind: "external_invoicing",
  point_of_sale: 4,
  document_type: "factura_c",
  number: 41,
  voucher: { issued_on: "2026-10-10", total: 125000, authorization_code: "74123456789012" },
};

const creditNoteRejected = {
  ...common,
  kind: "credit_note_rejected",
  point_of_sale: 4,
  number: 12,
  credit_note_id: "c7b3e5d2-18a4-4f90-b6d1-2e9f0a8c3d03",
  rejections: [{ code: 10016, message: "Fecha de comprobante fuera de rango" }],
};

const deferredSaleExpired = {
  ...common,
  kind: "deferred_sale_expired",
  sale_occurred_at: "2026-10-10T15:00:00.000Z",
  total: 1234500,
  short_code: "ABCD2345",
};

const tasks = [externalInvoicing, creditNoteRejected, deferredSaleExpired];

describe("fiscalTasksSchema", () => {
  it("reads the open tasks of every kind", () => {
    expect(fiscalTasksSchema.parse({ tasks })).toEqual({ tasks });
  });

  it("reads a task's id as a record id, lowercased like the stored one", () => {
    const task = { ...deferredSaleExpired, id: "5B9E2F4A-7C1D-4E83-A6F0-3D8C1B7E9A42" };

    expect(fiscalTaskItemSchema.parse(task).id).toBe("5b9e2f4a-7c1d-4e83-a6f0-3d8c1b7e9a42");
  });

  it("reads a list with no task", () => {
    expect(fiscalTasksSchema.parse({ tasks: [] })).toEqual({ tasks: [] });
  });

  it("names every kind of fiscal task", () => {
    expect(tasks.map((task) => task.kind)).toEqual([...FISCAL_TASK_KINDS]);
    expectTypeOf<FiscalTaskItem["kind"]>().toEqualTypeOf<(typeof FISCAL_TASK_KINDS)[number]>();
  });

  it("refuses a kind of task it does not know", () => {
    expect(fiscalTasksSchema.safeParse({ tasks: [{ ...common, kind: "other" }] }).success).toBe(
      false,
    );
  });
});

describe("fiscalTaskItemSchema", () => {
  it("marks the instants of a task as written in Argentina's time zone", () => {
    expect(fiscalTaskItemSchema.options[2].shape.created_at.meta()).toEqual({
      timeZone: ARGENTINA_TIME_ZONE,
    });
    expect(fiscalTaskItemSchema.options[2].shape.sale_occurred_at.meta()).toEqual({
      timeZone: ARGENTINA_TIME_ZONE,
    });
  });

  it.each([
    ["an id that is not a UUID", { id: "task-1" }],
    ["a negative time open", { open_for_seconds: -1 }],
    ["a fractional time open", { open_for_seconds: 1.5 }],
    ["a creation that is not an instant", { created_at: "yesterday" }],
    ["no register name", { register_name: undefined }],
  ])("refuses a deferred sale task with %s", (_case, change) => {
    expect(fiscalTaskItemSchema.safeParse({ ...deferredSaleExpired, ...change }).success).toBe(
      false,
    );
  });

  it("reads the alert a task carries, escalated or not", () => {
    const alerts = [
      { level: "warning", escalated_at: null },
      { level: "critical", escalated_at: "2026-10-17T03:05:00.000Z" },
    ];

    for (const alert of alerts) {
      expect(fiscalTaskItemSchema.parse({ ...deferredSaleExpired, alert }).alert).toEqual(alert);
    }
  });

  it("refuses an alert of a level that does not exist", () => {
    expect(
      fiscalTaskItemSchema.safeParse({
        ...deferredSaleExpired,
        alert: { level: "severe", escalated_at: null },
      }).success,
    ).toBe(false);
  });

  it.each([
    ["a sale date that is not an instant", { sale_occurred_at: "2026-10-10" }],
    ["a fractional total", { total: 10.5 }],
    ["a negative total", { total: -1 }],
    ["a short code outside the alphabet", { short_code: "abcd2345" }],
    ["a short code of the wrong length", { short_code: "ABCD234" }],
  ])("refuses an expired deferred sale with %s", (_case, change) => {
    expect(fiscalTaskItemSchema.safeParse({ ...deferredSaleExpired, ...change }).success).toBe(
      false,
    );
  });

  it.each([
    [
      "a voucher day that is not a calendar day",
      { voucher: { ...externalInvoicing.voucher, issued_on: "2026-02-30" } },
    ],
    ["a fractional voucher total", { voucher: { ...externalInvoicing.voucher, total: 1.5 } }],
    ["a document type of no fiscal task", { document_type: "factura_a" }],
    ["a fractional number", { number: 1.5 }],
  ])("refuses an external invoicing task with %s", (_case, change) => {
    expect(fiscalTaskItemSchema.safeParse({ ...externalInvoicing, ...change }).success).toBe(false);
  });

  it("reads an external invoicing task of a credit note", () => {
    const task = { ...externalInvoicing, document_type: "credit_note_c" };

    expect(fiscalTaskItemSchema.parse(task)).toEqual(task);
  });

  it.each([
    ["a rejection without its code", { rejections: [{ message: "m" }] }],
    ["a credit note that is not text", { credit_note_id: 7 }],
  ])("refuses a rejected credit note task with %s", (_case, change) => {
    expect(fiscalTaskItemSchema.safeParse({ ...creditNoteRejected, ...change }).success).toBe(
      false,
    );
  });
});
