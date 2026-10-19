import { COMPROMISE_RESPONSE_ITEMS, COMPROMISE_RESPONSE_STEPS } from "@purosur/domain";
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  type CompromiseResponseBody,
  type CompromiseResponseSessionsAndPasskeysBody,
  compromiseResponseItemSchema,
  compromiseResponseSchema,
  compromiseResponseSessionsAndPasskeysBodySchema,
} from "./compromise-response.js";

const ACCOUNT_ID = "3f2b8c1e-9a4d-4e7b-8c55-0d1e2f3a4b5c";

const runbook = {
  id: "5a9d2c1e-1b3c-4d5e-8f60-718293a4b5c6",
  started_at: "2026-10-01T09:00:00.000Z",
  started_by: ACCOUNT_ID,
  completed: false,
  steps: [
    {
      step: "revoke_every_installation",
      done: true,
      done_at: "2026-10-01T09:05:00.000Z",
      available: false,
    },
    { step: "end_sessions_and_remove_passkeys", done: false, done_at: null, available: true },
  ],
  items: [
    {
      item: "claude_api_key",
      step: "rotate_external_secrets",
      done: false,
      done_at: null,
    },
  ],
};

describe("compromiseResponseSchema", () => {
  it("accepts the runbook the cloud sends, with its steps and items", () => {
    expect(compromiseResponseSchema.safeParse(runbook).data).toEqual(runbook);
  });

  it("strips keys it does not define", () => {
    expect(compromiseResponseSchema.safeParse({ ...runbook, secret: "x" }).data).toEqual(runbook);
  });

  it.each(["id", "started_at", "started_by", "completed", "steps", "items"])(
    "requires %s",
    (key) => {
      const { [key as keyof typeof runbook]: _removed, ...rest } = runbook;
      expect(compromiseResponseSchema.safeParse(rest).success).toBe(false);
    },
  );

  it("accepts every step and every item the domain names", () => {
    const body = {
      ...runbook,
      steps: COMPROMISE_RESPONSE_STEPS.map((step) => ({
        step,
        done: false,
        done_at: null,
        available: false,
      })),
      items: COMPROMISE_RESPONSE_ITEMS.map((item) => ({
        item,
        step: "notify",
        done: false,
        done_at: null,
      })),
    };

    expect(compromiseResponseSchema.safeParse(body).success).toBe(true);
  });

  it("refuses a step or an item the domain does not name", () => {
    const step = { step: "reboot", done: false, done_at: null, available: false };
    const item = { item: "wifi_password", step: "notify", done: false, done_at: null };

    expect(compromiseResponseSchema.safeParse({ ...runbook, steps: [step] }).success).toBe(false);
    expect(compromiseResponseSchema.safeParse({ ...runbook, items: [item] }).success).toBe(false);
  });

  it("refuses an item placed in a step the domain does not name", () => {
    const item = { item: "notify", step: "reboot", done: false, done_at: null };

    expect(compromiseResponseSchema.safeParse({ ...runbook, items: [item] }).success).toBe(false);
  });

  it.each([1, true])("refuses done_at as %j", (done_at) => {
    const steps = [{ ...runbook.steps[1], done_at }];

    expect(compromiseResponseSchema.safeParse({ ...runbook, steps }).success).toBe(false);
  });

  it.each(["done", "available"])("requires a step's %s flag", (flag) => {
    const { [flag as "done"]: _removed, ...step } = runbook.steps[1] as (typeof runbook.steps)[1] & {
      done: boolean;
    };

    expect(compromiseResponseSchema.safeParse({ ...runbook, steps: [step] }).success).toBe(false);
  });

  it("types its output as the wire shape", () => {
    expectTypeOf<CompromiseResponseBody["completed"]>().toEqualTypeOf<boolean>();
    expectTypeOf<CompromiseResponseBody["steps"][number]["done_at"]>().toEqualTypeOf<
      string | null
    >();
  });
});

describe("compromiseResponseSessionsAndPasskeysBodySchema", () => {
  it("accepts the id of the account under suspicion", () => {
    expect(
      compromiseResponseSessionsAndPasskeysBodySchema.safeParse({ account_id: ACCOUNT_ID }).data,
    ).toEqual({ account_id: ACCOUNT_ID });
  });

  it("strips keys it does not define", () => {
    expect(
      compromiseResponseSessionsAndPasskeysBodySchema.safeParse({
        account_id: ACCOUNT_ID,
        email: "x@example.test",
      }).data,
    ).toEqual({ account_id: ACCOUNT_ID });
  });

  it.each([undefined, "", "not-an-id", 42, null])("refuses account_id as %j", (account_id) => {
    const result = compromiseResponseSessionsAndPasskeysBodySchema.safeParse({ account_id });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("account_id must be a user's id");
  });

  it("types its output as the wire shape", () => {
    expectTypeOf<CompromiseResponseSessionsAndPasskeysBody>().toEqualTypeOf<{
      account_id: string;
    }>();
  });
});

describe("compromiseResponseItemSchema", () => {
  it.each(COMPROMISE_RESPONSE_ITEMS)("accepts the item %s", (item) => {
    expect(compromiseResponseItemSchema.safeParse(item).data).toBe(item);
  });

  it.each(["", "wifi_password", 1, null, undefined])("refuses %j", (value) => {
    expect(compromiseResponseItemSchema.safeParse(value).success).toBe(false);
  });
});
