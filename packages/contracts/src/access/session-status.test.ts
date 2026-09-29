import { describe, expect, it } from "vitest";
import { sessionStatusSchema } from "./session-status.js";

const status = { expires_at: "2026-09-23T12:30:00.000Z" };

describe("sessionStatusSchema", () => {
  it("accepts the body the cloud sends", () => {
    expect(sessionStatusSchema.safeParse(status).data).toEqual(status);
  });

  it("strips keys it does not define", () => {
    expect(sessionStatusSchema.safeParse({ ...status, user_id: "user-1" }).data).toEqual(status);
  });

  it("requires expires_at", () => {
    expect(sessionStatusSchema.safeParse({}).success).toBe(false);
  });

  it.each([1, null])("refuses expires_at as %j", (value) => {
    expect(sessionStatusSchema.safeParse({ expires_at: value }).success).toBe(false);
  });

  it.each([undefined, null, "status", 1, []])("refuses %j as a body", (value) => {
    expect(sessionStatusSchema.safeParse(value).success).toBe(false);
  });
});
