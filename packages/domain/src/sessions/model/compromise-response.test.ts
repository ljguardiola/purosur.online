import { describe, expect, it } from "vitest";
import {
  actionStepRefusal,
  COMPROMISE_RESPONSE_ACTION_STEPS,
  COMPROMISE_RESPONSE_ITEMS,
  COMPROMISE_RESPONSE_STEPS,
  type CompromiseResponseCompletion,
  EXTERNAL_SECRET_ITEMS,
  isResponseCompleted,
  itemRefusal,
  itemStates,
  passkeyRemovalSettlesAccount,
  stepOfItem,
  stepStates,
} from "./compromise-response.js";

const T1 = new Date("2026-10-01T10:00:00.000Z");
const T2 = new Date("2026-10-01T10:05:00.000Z");
const T3 = new Date("2026-10-01T10:10:00.000Z");
const T4 = new Date("2026-10-01T10:15:00.000Z");
const T5 = new Date("2026-10-01T10:20:00.000Z");

function done(...keys: CompromiseResponseCompletion["key"][]): CompromiseResponseCompletion[] {
  return keys.map((key, index) => ({ key, at: new Date(T1.getTime() + index * 60_000) }));
}

const ACTION_STEPS_DONE = done(
  "revoke_every_installation",
  "end_sessions_and_remove_passkeys",
  "force_pin_resets",
);

const EXTERNAL_SECRETS_DONE = done(...EXTERNAL_SECRET_ITEMS);

describe("the compromise-response runbook", () => {
  it("has six steps in the order that leaves the least window open", () => {
    expect(COMPROMISE_RESPONSE_STEPS).toEqual([
      "revoke_every_installation",
      "end_sessions_and_remove_passkeys",
      "force_pin_resets",
      "rotate_external_secrets",
      "notify",
      "re_enroll_registers",
    ]);
  });

  it("runs the first three steps through actions of the product", () => {
    expect(COMPROMISE_RESPONSE_ACTION_STEPS).toEqual(COMPROMISE_RESPONSE_STEPS.slice(0, 3));
  });

  it("rotates each external secret as its own checklist item and notifies with one more", () => {
    expect(EXTERNAL_SECRET_ITEMS).toEqual([
      "mercado_pago_webhook_secret",
      "whatsapp_webhook_token",
      "whatsapp_webhook_secret",
      "claude_api_key",
      "postgres_credentials",
      "ci_deployment_credentials",
      "storage_bucket_credentials",
      "arca_certificate_and_private_key",
    ]);
    expect(COMPROMISE_RESPONSE_ITEMS).toEqual([...EXTERNAL_SECRET_ITEMS, "notify"]);
  });
});

describe("stepOfItem", () => {
  it("places each external secret in the rotation step and the notification in the notify step", () => {
    for (const item of EXTERNAL_SECRET_ITEMS) {
      expect(stepOfItem(item)).toBe("rotate_external_secrets");
    }
    expect(stepOfItem("notify")).toBe("notify");
  });
});

describe("actionStepRefusal", () => {
  it("lets the first step run on a fresh runbook", () => {
    expect(actionStepRefusal([], "revoke_every_installation")).toBeNull();
  });

  it("refuses a step while an earlier one is not done", () => {
    expect(actionStepRefusal([], "end_sessions_and_remove_passkeys")).toBe("out_of_order");
    expect(actionStepRefusal([], "force_pin_resets")).toBe("out_of_order");
    expect(actionStepRefusal(done("revoke_every_installation"), "force_pin_resets")).toBe(
      "out_of_order",
    );
    expect(actionStepRefusal(done("end_sessions_and_remove_passkeys"), "force_pin_resets")).toBe(
      "out_of_order",
    );
  });

  it("lets a step run once every earlier step is done", () => {
    expect(
      actionStepRefusal(done("revoke_every_installation"), "end_sessions_and_remove_passkeys"),
    ).toBeNull();
    expect(
      actionStepRefusal(
        done("revoke_every_installation", "end_sessions_and_remove_passkeys"),
        "force_pin_resets",
      ),
    ).toBeNull();
  });

  it("refuses a step already done, whether or not the later ones are", () => {
    expect(actionStepRefusal(done("revoke_every_installation"), "revoke_every_installation")).toBe(
      "already_done",
    );
    expect(actionStepRefusal(ACTION_STEPS_DONE, "end_sessions_and_remove_passkeys")).toBe(
      "already_done",
    );
  });
});

describe("itemRefusal", () => {
  it("refuses an item of the rotation step until the three actions are done", () => {
    expect(itemRefusal([], "claude_api_key")).toBe("out_of_order");
    expect(
      itemRefusal(
        done("revoke_every_installation", "end_sessions_and_remove_passkeys"),
        "claude_api_key",
      ),
    ).toBe("out_of_order");
    expect(itemRefusal(ACTION_STEPS_DONE, "claude_api_key")).toBeNull();
  });

  it("lets the secrets be rotated in any order", () => {
    expect(
      itemRefusal(
        done(...ACTION_STEPS_DONE.map(({ key }) => key), "postgres_credentials"),
        "claude_api_key",
      ),
    ).toBeNull();
  });

  it("refuses the notification until every secret is rotated", () => {
    expect(itemRefusal(ACTION_STEPS_DONE, "notify")).toBe("out_of_order");
    expect(itemRefusal([...ACTION_STEPS_DONE, ...EXTERNAL_SECRETS_DONE.slice(1)], "notify")).toBe(
      "out_of_order",
    );
    expect(itemRefusal([...ACTION_STEPS_DONE, ...EXTERNAL_SECRETS_DONE], "notify")).toBeNull();
  });

  it("refuses an item already done", () => {
    expect(itemRefusal([...ACTION_STEPS_DONE, ...done("claude_api_key")], "claude_api_key")).toBe(
      "already_done",
    );
    expect(
      itemRefusal([...ACTION_STEPS_DONE, ...EXTERNAL_SECRETS_DONE, ...done("notify")], "notify"),
    ).toBe("already_done");
  });

  it("reports an item done before its step was reachable as already done", () => {
    expect(itemRefusal(done("claude_api_key"), "claude_api_key")).toBe("already_done");
  });
});

describe("isResponseCompleted", () => {
  it("is completed once the notification is done and not before", () => {
    const everythingButNotify = [...ACTION_STEPS_DONE, ...EXTERNAL_SECRETS_DONE];
    expect(isResponseCompleted([])).toBe(false);
    expect(isResponseCompleted(everythingButNotify)).toBe(false);
    expect(isResponseCompleted([...everythingButNotify, ...done("notify")])).toBe(true);
  });
});

describe("stepStates", () => {
  it("shows only the first step available on a fresh runbook", () => {
    expect(stepStates([])).toEqual([
      { step: "revoke_every_installation", done: false, doneAt: null, available: true },
      { step: "end_sessions_and_remove_passkeys", done: false, doneAt: null, available: false },
      { step: "force_pin_resets", done: false, doneAt: null, available: false },
      { step: "rotate_external_secrets", done: false, doneAt: null, available: false },
      { step: "notify", done: false, doneAt: null, available: false },
      { step: "re_enroll_registers", done: false, doneAt: null, available: false },
    ]);
  });

  it("shows when each action step was done and makes the next one available", () => {
    const completions: CompromiseResponseCompletion[] = [
      { key: "revoke_every_installation", at: T1 },
      { key: "end_sessions_and_remove_passkeys", at: T2 },
    ];

    expect(stepStates(completions).slice(0, 4)).toEqual([
      { step: "revoke_every_installation", done: true, doneAt: T1, available: false },
      { step: "end_sessions_and_remove_passkeys", done: true, doneAt: T2, available: false },
      { step: "force_pin_resets", done: false, doneAt: null, available: true },
      { step: "rotate_external_secrets", done: false, doneAt: null, available: false },
    ]);
  });

  it("keeps the rotation step available and not done until its last item is done", () => {
    const completions: CompromiseResponseCompletion[] = [
      { key: "revoke_every_installation", at: T1 },
      { key: "end_sessions_and_remove_passkeys", at: T1 },
      { key: "force_pin_resets", at: T2 },
      ...EXTERNAL_SECRET_ITEMS.slice(1).map((key) => ({ key, at: T3 })),
    ];

    expect(stepStates(completions)[3]).toEqual({
      step: "rotate_external_secrets",
      done: false,
      doneAt: null,
      available: true,
    });
    expect(stepStates(completions)[4]?.available).toBe(false);
  });

  it("dates the rotation step by the latest of its items once all are done", () => {
    const completions: CompromiseResponseCompletion[] = [
      ...ACTION_STEPS_DONE,
      ...EXTERNAL_SECRET_ITEMS.map((key, index) => ({
        key,
        at: index === 3 ? T5 : index % 2 === 0 ? T3 : T4,
      })),
    ];

    expect(stepStates(completions).slice(3)).toEqual([
      { step: "rotate_external_secrets", done: true, doneAt: T5, available: false },
      { step: "notify", done: false, doneAt: null, available: true },
      { step: "re_enroll_registers", done: false, doneAt: null, available: false },
    ]);
  });

  it("makes the re-enrollment pointer available, never done, once the notification is done", () => {
    const completions = [
      ...ACTION_STEPS_DONE,
      ...EXTERNAL_SECRETS_DONE,
      { key: "notify" as const, at: T5 },
    ];

    expect(stepStates(completions).slice(4)).toEqual([
      { step: "notify", done: true, doneAt: T5, available: false },
      { step: "re_enroll_registers", done: false, doneAt: null, available: true },
    ]);
  });
});

describe("itemStates", () => {
  it("lists every item in order with when it was done", () => {
    const completions: CompromiseResponseCompletion[] = [
      { key: "claude_api_key", at: T2 },
      { key: "notify", at: T3 },
    ];

    expect(itemStates(completions)).toEqual(
      COMPROMISE_RESPONSE_ITEMS.map((item) => ({
        item,
        step: stepOfItem(item),
        done: item === "claude_api_key" || item === "notify",
        doneAt: item === "claude_api_key" ? T2 : item === "notify" ? T3 : null,
      })),
    );
  });
});

describe("passkeyRemovalSettlesAccount", () => {
  it("settles the account when its passkeys were removed or it had none", () => {
    expect(passkeyRemovalSettlesAccount("removed")).toBe(true);
    expect(passkeyRemovalSettlesAccount("no_passkeys")).toBe(true);
  });

  it("does not settle it when the removal was refused", () => {
    expect(passkeyRemovalSettlesAccount("authorization_required")).toBe(false);
    expect(passkeyRemovalSettlesAccount("user_not_found")).toBe(false);
    expect(passkeyRemovalSettlesAccount("own_account")).toBe(false);
  });
});
