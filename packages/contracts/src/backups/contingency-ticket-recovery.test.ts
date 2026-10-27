import { describe, expect, it } from "vitest";
import {
  contingencyTicketRecoveriesResponseSchema,
  contingencyTicketRecoveryAnswerSchema,
  contingencyTicketRecoveryFinishResponseSchema,
  contingencyTicketRecoveryRequestSchema,
} from "./contingency-ticket-recovery.js";

const DEVICE_ID = "6f1c1c5e-5b0a-4d6e-9d58-0c2f6f0d3a11";
const REGISTER_ID = "7a2d2d6f-6c1b-4e7f-8e69-1d3a7a1e4b22";
const RECOVERY_ID = "8b3e3e70-7d2c-4f80-9f7a-2e4b8b2f5c33";

describe("contingencyTicketRecoveryRequestSchema", () => {
  it("accepts the predecessor installation", () => {
    const body = { predecessor_device_id: DEVICE_ID };

    expect(contingencyTicketRecoveryRequestSchema.parse(body)).toEqual(body);
  });

  it("refuses a request without a predecessor or with one that is not an id", () => {
    expect(contingencyTicketRecoveryRequestSchema.safeParse({}).success).toBe(false);
    expect(
      contingencyTicketRecoveryRequestSchema.safeParse({ predecessor_device_id: "device" }).success,
    ).toBe(false);
  });
});

describe("contingencyTicketRecoveryAnswerSchema", () => {
  it("accepts a recovery that awaits and one that is finished", () => {
    for (const status of ["awaiting", "finished"]) {
      expect(contingencyTicketRecoveryAnswerSchema.parse({ status })).toEqual({ status });
    }
  });

  it("refuses any other status", () => {
    expect(contingencyTicketRecoveryAnswerSchema.safeParse({ status: "open" }).success).toBe(false);
  });
});

describe("contingencyTicketRecoveriesResponseSchema", () => {
  const recovery = {
    recovery_id: RECOVERY_ID,
    register_id: REGISTER_ID,
    register_name: "Caja 1",
    opened_at: "2026-10-20T12:00:00.000Z",
  };

  it("accepts the recoveries that await", () => {
    const body = { recoveries: [recovery] };

    expect(contingencyTicketRecoveriesResponseSchema.parse(body)).toEqual(body);
  });

  it("accepts no recovery awaiting", () => {
    expect(contingencyTicketRecoveriesResponseSchema.parse({ recoveries: [] })).toEqual({
      recoveries: [],
    });
  });

  it("refuses a recovery without a register name or with an opening that is not a date", () => {
    expect(
      contingencyTicketRecoveriesResponseSchema.safeParse({
        recoveries: [{ ...recovery, register_name: "" }],
      }).success,
    ).toBe(false);
    expect(
      contingencyTicketRecoveriesResponseSchema.safeParse({
        recoveries: [{ ...recovery, opened_at: "yesterday" }],
      }).success,
    ).toBe(false);
  });
});

describe("contingencyTicketRecoveryFinishResponseSchema", () => {
  it("accepts every way finishing can end", () => {
    for (const outcome of ["finished", "already_finished", "not_found"]) {
      expect(contingencyTicketRecoveryFinishResponseSchema.parse({ outcome })).toEqual({ outcome });
    }
  });

  it("refuses any other outcome", () => {
    expect(
      contingencyTicketRecoveryFinishResponseSchema.safeParse({ outcome: "done" }).success,
    ).toBe(false);
  });
});
