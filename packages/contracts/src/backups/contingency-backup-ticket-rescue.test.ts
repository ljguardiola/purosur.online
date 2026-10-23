import { describe, expect, it } from "vitest";
import {
  contingencyBackupTicketRescueRequestSchema,
  contingencyBackupTicketRescueResponseSchema,
} from "./contingency-backup-ticket-rescue.js";

const REGISTER_ID = "6f1c1c5e-5b0a-4d6e-9d58-0c2f6f0d3a11";

const rescued = {
  outcome: "rescued",
  register_id: REGISTER_ID,
  register_name: "Caja 1",
  received: 2,
  already_received: 1,
  summary: {
    operation: "sale",
    occurred_at: "2026-10-01T10:00:00.000Z",
    vouchers: [{ point_of_sale: 3, document_type: "factura_c", number: 88 }],
    sale_total: 2500,
  },
};

describe("contingencyBackupTicketRescueRequestSchema", () => {
  it("accepts the codes of one ticket", () => {
    const body = { qr_codes: ["ABC", "DEF"] };

    expect(contingencyBackupTicketRescueRequestSchema.parse(body)).toEqual(body);
  });

  it("refuses a request without codes", () => {
    expect(contingencyBackupTicketRescueRequestSchema.safeParse({ qr_codes: [] }).success).toBe(
      false,
    );
  });

  it("refuses an empty code", () => {
    expect(
      contingencyBackupTicketRescueRequestSchema.safeParse({ qr_codes: ["ABC", ""] }).success,
    ).toBe(false);
  });

  it("accepts as many codes as a ticket can be numbered with and no more", () => {
    const codes = (count: number) => ({ qr_codes: Array.from({ length: count }, () => "A") });

    expect(contingencyBackupTicketRescueRequestSchema.safeParse(codes(255)).success).toBe(true);
    expect(contingencyBackupTicketRescueRequestSchema.safeParse(codes(256)).success).toBe(false);
  });

  it("accepts a code as long as a full QR frame and no longer", () => {
    const code = (length: number) => ({ qr_codes: ["A".repeat(length)] });

    expect(contingencyBackupTicketRescueRequestSchema.safeParse(code(1000)).success).toBe(true);
    expect(contingencyBackupTicketRescueRequestSchema.safeParse(code(1001)).success).toBe(false);
  });
});

describe("contingencyBackupTicketRescueResponseSchema", () => {
  it("accepts a rescued ticket with its summary", () => {
    expect(contingencyBackupTicketRescueResponseSchema.parse(rescued)).toEqual(rescued);
  });

  it("accepts a summary of a ticket that names no operation, moment, voucher or sale", () => {
    const body = {
      ...rescued,
      summary: { operation: null, occurred_at: null, vouchers: [], sale_total: null },
    };

    expect(contingencyBackupTicketRescueResponseSchema.parse(body)).toEqual(body);
  });

  it.each([
    "unreadable",
    "incomplete",
    "unknown_key",
    "not_authentic",
    "foreign_installation",
    "conflicting",
  ])("accepts the %s outcome on its own", (outcome) => {
    expect(contingencyBackupTicketRescueResponseSchema.parse({ outcome })).toEqual({ outcome });
  });

  it("refuses an outcome it does not know", () => {
    expect(contingencyBackupTicketRescueResponseSchema.safeParse({ outcome: "lost" }).success).toBe(
      false,
    );
  });

  it("refuses a rescued ticket whose operation is not one a ticket is printed for", () => {
    const body = { ...rescued, summary: { ...rescued.summary, operation: "refund" } };

    expect(contingencyBackupTicketRescueResponseSchema.safeParse(body).success).toBe(false);
  });

  it("refuses a rescued ticket whose register is not a record id", () => {
    expect(
      contingencyBackupTicketRescueResponseSchema.safeParse({ ...rescued, register_id: "1" })
        .success,
    ).toBe(false);
  });

  it("refuses a negative count of received events", () => {
    expect(
      contingencyBackupTicketRescueResponseSchema.safeParse({ ...rescued, received: -1 }).success,
    ).toBe(false);
  });

  it("refuses a voucher of a type the offline series does not have", () => {
    const body = {
      ...rescued,
      summary: {
        ...rescued.summary,
        vouchers: [{ point_of_sale: 3, document_type: "ticket", number: 1 }],
      },
    };

    expect(contingencyBackupTicketRescueResponseSchema.safeParse(body).success).toBe(false);
  });
});
