import { describe, expect, it } from "vitest";
import { openSessionSchema } from "./open-session.js";

const session = {
  user_id: "user-1",
  display_name: "Lucas",
  expires_at: "2026-09-23T12:30:00.000Z",
  is_administrator: false,
  capabilities: ["stock_area", "branch_area"],
  stock_movement_kinds: ["loss", "adjustment"],
};

describe("openSessionSchema", () => {
  it("accepts the body the cloud sends, with capabilities or empty lists", () => {
    expect(openSessionSchema.safeParse(session).data).toEqual(session);
    const empty = { ...session, capabilities: [], stock_movement_kinds: [] };

    expect(openSessionSchema.safeParse(empty).data).toEqual(empty);
  });

  it.each([
    ["email", "a@b.c"],
    ["permissions", ["void_sale"]],
  ])("strips %s, which it does not define", (field, value) => {
    expect(openSessionSchema.safeParse({ ...session, [field]: value }).data).toEqual(session);
  });

  it.each([
    "user_id",
    "display_name",
    "expires_at",
    "is_administrator",
    "capabilities",
    "stock_movement_kinds",
  ])("requires %s", (field) => {
    const { [field as keyof typeof session]: _omitted, ...rest } = session;

    expect(openSessionSchema.safeParse(rest).success).toBe(false);
  });

  it.each([
    ["user_id", 1],
    ["user_id", null],
    ["display_name", 1],
    ["display_name", null],
    ["expires_at", 1],
    ["expires_at", null],
    ["is_administrator", "false"],
    ["is_administrator", null],
    ["capabilities", "stock_area"],
    ["capabilities", ["not_a_capability"]],
    ["capabilities", [1]],
    ["capabilities", null],
    ["stock_movement_kinds", "loss"],
    ["stock_movement_kinds", ["count"]],
    ["stock_movement_kinds", [1]],
    ["stock_movement_kinds", null],
  ])("refuses %s as %j", (field, value) => {
    expect(openSessionSchema.safeParse({ ...session, [field]: value }).success).toBe(false);
  });

  it.each([undefined, null, "session", 1, []])("refuses %j as a body", (value) => {
    expect(openSessionSchema.safeParse(value).success).toBe(false);
  });
});
