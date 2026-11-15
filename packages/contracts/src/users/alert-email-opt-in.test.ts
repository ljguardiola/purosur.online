import { ARGENTINA_TIME_ZONE } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { alertEmailOptInSchema } from "./alert-email-opt-in.js";

describe("alertEmailOptInSchema", () => {
  it("accepts the moment since when alerts are received by email", () => {
    const body = { opted_in_at: "2026-10-01T12:00:00.000Z" };

    expect(alertEmailOptInSchema.safeParse(body).data).toEqual(body);
  });

  it("accepts no moment for a user who does not receive them", () => {
    expect(alertEmailOptInSchema.safeParse({ opted_in_at: null }).data).toEqual({
      opted_in_at: null,
    });
  });

  it("shows the moment in Argentina's time zone", () => {
    expect(alertEmailOptInSchema.shape.opted_in_at.meta()).toEqual({
      timeZone: ARGENTINA_TIME_ZONE,
    });
  });

  it("strips keys it does not define", () => {
    expect(alertEmailOptInSchema.safeParse({ opted_in_at: null, user_id: "user-1" }).data).toEqual({
      opted_in_at: null,
    });
  });

  it.each([undefined, 1, "2026-10-01", "not a date", {}, []])(
    "refuses %j as the moment",
    (value) => {
      expect(alertEmailOptInSchema.safeParse({ opted_in_at: value }).success).toBe(false);
    },
  );

  it.each([undefined, null, "body"])("refuses %j as a body", (body) => {
    expect(alertEmailOptInSchema.safeParse(body).success).toBe(false);
  });
});
