import { describe, expect, it } from "vitest";
import { openSessionSchema } from "./open-session.js";

const session = {
  user_id: "user-1",
  display_name: "Lucas",
  expires_at: "2026-09-23T12:30:00.000Z",
  is_administrator: false,
  permissions: ["void_sale", "sell_and_charge"],
};

describe("openSessionSchema", () => {
  it("accepts the body the cloud sends, with or without permissions", () => {
    expect(openSessionSchema.safeParse(session).data).toEqual(session);
    expect(openSessionSchema.safeParse({ ...session, permissions: [] }).data).toEqual({
      ...session,
      permissions: [],
    });
  });

  it("strips keys it does not define", () => {
    expect(openSessionSchema.safeParse({ ...session, email: "a@b.c" }).data).toEqual(session);
  });

  it.each(["user_id", "display_name", "expires_at", "is_administrator", "permissions"])(
    "requires %s",
    (field) => {
      const { [field as keyof typeof session]: _omitted, ...rest } = session;

      expect(openSessionSchema.safeParse(rest).success).toBe(false);
    },
  );

  it.each([
    ["user_id", 1],
    ["user_id", null],
    ["display_name", 1],
    ["display_name", null],
    ["expires_at", 1],
    ["expires_at", null],
    ["is_administrator", "false"],
    ["is_administrator", null],
    ["permissions", "void_sale"],
    ["permissions", [1]],
    ["permissions", null],
  ])("refuses %s as %j", (field, value) => {
    expect(openSessionSchema.safeParse({ ...session, [field]: value }).success).toBe(false);
  });

  it.each([undefined, null, "session", 1, []])("refuses %j as a body", (value) => {
    expect(openSessionSchema.safeParse(value).success).toBe(false);
  });
});
