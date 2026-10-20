import { describe, expect, it } from "vitest";
import {
  type CompromiseResponseStepRequest,
  runCompromiseResponseStep,
} from "./run-compromise-response-step.js";
import {
  ACTION_COMPLETIONS,
  AT,
  EARLIER,
  EVERY_ITEM_COMPLETION,
  response,
} from "./test-support/compromise-response-fixtures.js";
import { FakeCompromiseResponseStore } from "./test-support/fake-compromise-response-store.js";

const AUTHORIZED_AT = new Date("2026-10-01T11:58:00.000Z");
const FIRST_STEP = { step: "revoke_every_installation" } as const;
const SECOND_STEP = { step: "end_sessions_and_remove_passkeys", accountId: "suspect-1" } as const;
const THIRD_STEP = { step: "force_pin_resets" } as const;

function run(
  store: FakeCompromiseResponseStore,
  step: CompromiseResponseStepRequest,
  actorId = "admin-1",
) {
  return runCompromiseResponseStep(
    { store },
    { ...step, actorId, locationId: "branch-1", passkeyAuthorizedAt: AUTHORIZED_AT, at: AT },
  );
}

function storeWith(completions: Parameters<typeof response>[0] = []) {
  const store = new FakeCompromiseResponseStore();
  store.seedResponse(response(completions));
  store.seedAccountWithPasskeys("suspect-1");
  store.seedAccountWithPasskeys("suspect-2");
  return store;
}

const STEP_ONE_DONE = [{ key: "revoke_every_installation" as const, at: EARLIER }];

describe("runCompromiseResponseStep", () => {
  it("refuses with no running response, running nothing, when no runbook was started", async () => {
    const empty = new FakeCompromiseResponseStore();

    const outcome = await run(empty, FIRST_STEP);

    expect(outcome).toEqual({ kind: "no_running_response" });
    expect(empty.current.effects).toEqual([]);
  });

  it("refuses with no running response, running nothing, when the latest runbook is completed", async () => {
    const completed = storeWith([...ACTION_COMPLETIONS, ...EVERY_ITEM_COMPLETION]);

    const outcome = await run(completed, FIRST_STEP);

    expect(outcome).toEqual({ kind: "no_running_response" });
    expect(completed.current.effects).toEqual([]);
  });

  it("refuses a step whose earlier steps are not done, running nothing", async () => {
    const fresh = storeWith();

    expect(await run(fresh, SECOND_STEP)).toEqual({ kind: "out_of_order" });
    expect(await run(fresh, THIRD_STEP)).toEqual({ kind: "out_of_order" });

    expect(fresh.current.effects).toEqual([]);
    expect(fresh.current.audits).toEqual([]);
  });

  it("refuses a step already done, running nothing and recording nothing more", async () => {
    const started = storeWith(STEP_ONE_DONE);

    const outcome = await run(started, FIRST_STEP);

    expect(outcome).toEqual({ kind: "already_done" });
    expect(started.current.effects).toEqual([]);
    expect(started.current.audits).toEqual([]);
  });

  it("completes step 1 when the installations were revoked, recording who and when", async () => {
    const fresh = storeWith();

    const outcome = await run(fresh, FIRST_STEP);

    expect(outcome).toEqual({ kind: "done", doneAt: AT });
    expect(fresh.current.effects).toEqual([`revokeEveryInstallation:admin-1:${AT.toISOString()}`]);
    expect(fresh.current.responses[0]?.completions).toEqual([
      { key: "revoke_every_installation", at: AT },
    ]);
    expect(fresh.current.audits).toEqual([
      {
        kind: "step_done",
        responseId: "response-1",
        step: "revoke_every_installation",
        actorId: "admin-1",
        at: AT,
      },
    ]);
  });

  it("completes step 1 as well when no installation was left to revoke", async () => {
    const fresh = storeWith();
    fresh.installationRevocation = "nothing_to_revoke";

    const outcome = await run(fresh, FIRST_STEP);

    expect(outcome).toEqual({ kind: "done", doneAt: AT });
  });

  it("completes step 2 by removing the chosen account's passkeys and then ending every session", async () => {
    const started = storeWith(STEP_ONE_DONE);

    const outcome = await run(started, SECOND_STEP);

    expect(outcome).toEqual({ kind: "done", doneAt: AT });
    expect(started.current.effects).toEqual([
      "removeEveryPasskeyOf:suspect-1:admin-1",
      `endEveryBackofficeSession:admin-1:${AT.toISOString()}`,
    ]);
    expect(started.current.accountsWithPasskeys).toEqual(["suspect-2"]);
    expect(started.current.audits).toEqual([
      {
        kind: "step_done",
        responseId: "response-1",
        step: "end_sessions_and_remove_passkeys",
        actorId: "admin-1",
        at: AT,
      },
    ]);
  });

  it("asks to remove the passkeys with the caller's branch, authorization and time", async () => {
    const started = storeWith(STEP_ONE_DONE);

    await run(started, SECOND_STEP);

    expect(started.passkeyRemovalRequests).toEqual([
      {
        accountId: "suspect-1",
        administratorId: "admin-1",
        locationId: "branch-1",
        passkeyAuthorizedAt: AUTHORIZED_AT,
        at: AT,
      },
    ]);
  });

  it("completes step 2 when the chosen account had no passkeys left, still ending every session", async () => {
    const started = storeWith(STEP_ONE_DONE);

    const outcome = await run(started, {
      step: "end_sessions_and_remove_passkeys",
      accountId: "suspect-9",
    });

    expect(outcome).toEqual({ kind: "done", doneAt: AT });
    expect(started.current.effects).toEqual([
      `endEveryBackofficeSession:admin-1:${AT.toISOString()}`,
    ]);
  });

  it.each(["authorization_required", "user_not_found", "own_account"] as const)(
    "leaves step 2 undone and every session open when the passkey removal is refused as %s",
    async (refusal) => {
      const started = storeWith(STEP_ONE_DONE);
      started.passkeyRemovalRefusal = refusal;

      const outcome = await run(started, SECOND_STEP);

      expect(outcome).toEqual({ kind: "action_refused", refusal });
      expect(started.current.effects).toEqual([]);
      expect(started.current.audits).toEqual([]);
      expect(started.current.responses[0]?.completions).toEqual(STEP_ONE_DONE);
    },
  );

  it("completes step 3 when the PIN resets were required", async () => {
    const started = storeWith(ACTION_COMPLETIONS.slice(0, 2));

    const outcome = await run(started, THIRD_STEP);

    expect(outcome).toEqual({ kind: "done", doneAt: AT });
    expect(started.current.effects).toEqual([
      `requirePinResetOfEveryUser:admin-1:${AT.toISOString()}`,
    ]);
    expect(started.current.audits).toEqual([
      {
        kind: "step_done",
        responseId: "response-1",
        step: "force_pin_resets",
        actorId: "admin-1",
        at: AT,
      },
    ]);
  });

  it("runs step 2 once when two administrators run it at once, the other removing no passkey", async () => {
    const started = storeWith(STEP_ONE_DONE);

    const outcomes = await Promise.all([
      run(started, SECOND_STEP, "admin-1"),
      run(started, { step: "end_sessions_and_remove_passkeys", accountId: "suspect-2" }, "admin-2"),
    ]);

    expect(outcomes).toEqual([{ kind: "done", doneAt: AT }, { kind: "already_done" }]);
    expect(started.current.accountsWithPasskeys).toEqual(["suspect-2"]);
    expect(started.current.effects).toEqual([
      "removeEveryPasskeyOf:suspect-1:admin-1",
      `endEveryBackofficeSession:admin-1:${AT.toISOString()}`,
    ]);
    expect(started.current.audits).toHaveLength(1);
  });

  it.each(["revokeEveryInstallation", "recordStepDone"] as const)(
    "leaves step 1 undone and nothing revoked when %s fails",
    async (write) => {
      const fresh = storeWith();
      const before = fresh.snapshot();
      fresh.failingWrites.add(write);

      await expect(run(fresh, FIRST_STEP)).rejects.toThrow(`${write} failed`);

      expect(fresh.current).toEqual(before);
    },
  );

  it.each(["removeEveryPasskeyOf", "endEveryBackofficeSession", "recordStepDone"] as const)(
    "keeps every passkey and session when %s fails during step 2",
    async (write) => {
      const started = storeWith(STEP_ONE_DONE);
      const before = started.snapshot();
      started.failingWrites.add(write);

      await expect(run(started, SECOND_STEP)).rejects.toThrow(`${write} failed`);

      expect(started.current).toEqual(before);
    },
  );

  it.each(["requirePinResetOfEveryUser", "recordStepDone"] as const)(
    "leaves every PIN in place when %s fails during step 3",
    async (write) => {
      const started = storeWith(ACTION_COMPLETIONS.slice(0, 2));
      const before = started.snapshot();
      started.failingWrites.add(write);

      await expect(run(started, THIRD_STEP)).rejects.toThrow(`${write} failed`);

      expect(started.current).toEqual(before);
    },
  );
});
