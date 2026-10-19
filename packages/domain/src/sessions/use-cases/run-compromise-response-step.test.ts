import { describe, expect, it } from "vitest";
import { type RunCompromiseResponseStepInput, runCompromiseResponseStep } from "./run-compromise-response-step.js";
import {
  ACTION_COMPLETIONS,
  AT,
  EARLIER,
  EVERY_ITEM_COMPLETION,
  response,
} from "./test-support/compromise-response-fixtures.js";
import { FakeCompromiseResponseActions } from "./test-support/fake-compromise-response-actions.js";
import { FakeCompromiseResponseStore } from "./test-support/fake-compromise-response-store.js";

const FIRST_STEP = { step: "revoke_every_installation" } as const;
const SECOND_STEP = { step: "end_sessions_and_remove_passkeys", accountId: "suspect-1" } as const;
const THIRD_STEP = { step: "force_pin_resets" } as const;

function run(
  world: { store: FakeCompromiseResponseStore; actions: FakeCompromiseResponseActions },
  step: Omit<RunCompromiseResponseStepInput, "actorId" | "at">,
) {
  return runCompromiseResponseStep(world, { ...step, actorId: "admin-1", at: AT });
}

function world(completions: Parameters<typeof response>[0] = []) {
  const store = new FakeCompromiseResponseStore();
  store.seedResponse(response(completions));
  return { store, actions: new FakeCompromiseResponseActions() };
}

describe("runCompromiseResponseStep", () => {
  it("refuses with no running response, running nothing, when no runbook was started", async () => {
    const empty = { store: new FakeCompromiseResponseStore(), actions: new FakeCompromiseResponseActions() };

    const outcome = await run(empty, FIRST_STEP);

    expect(outcome).toEqual({ kind: "no_running_response" });
    expect(empty.actions.calls).toEqual([]);
  });

  it("refuses with no running response, running nothing, when the latest runbook is completed", async () => {
    const completed = world([...ACTION_COMPLETIONS, ...EVERY_ITEM_COMPLETION]);

    const outcome = await run(completed, FIRST_STEP);

    expect(outcome).toEqual({ kind: "no_running_response" });
    expect(completed.actions.calls).toEqual([]);
  });

  it("refuses a step whose earlier steps are not done, running nothing", async () => {
    const fresh = world();

    expect(await run(fresh, SECOND_STEP)).toEqual({ kind: "out_of_order" });
    expect(await run(fresh, THIRD_STEP)).toEqual({ kind: "out_of_order" });

    expect(fresh.actions.calls).toEqual([]);
    expect(fresh.store.current.audits).toEqual([]);
  });

  it("refuses a step already done, running nothing and recording nothing more", async () => {
    const started = world([{ key: "revoke_every_installation", at: EARLIER }]);

    const outcome = await run(started, FIRST_STEP);

    expect(outcome).toEqual({ kind: "already_done" });
    expect(started.actions.calls).toEqual([]);
    expect(started.store.current.audits).toEqual([]);
  });

  it("completes step 1 when the installations were revoked, recording who and when", async () => {
    const fresh = world();

    const outcome = await run(fresh, FIRST_STEP);

    expect(outcome).toEqual({ kind: "done", doneAt: AT });
    expect(fresh.actions.calls).toEqual(["revokeEveryInstallation"]);
    expect(fresh.store.current.responses[0]?.completions).toEqual([
      { key: "revoke_every_installation", at: AT },
    ]);
    expect(fresh.store.current.audits).toEqual([
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
    const fresh = world();
    fresh.actions.installationRevocation = "nothing_to_revoke";

    const outcome = await run(fresh, FIRST_STEP);

    expect(outcome).toEqual({ kind: "done", doneAt: AT });
  });

  it("completes step 2 by removing the chosen account's passkeys and then ending every session", async () => {
    const started = world([{ key: "revoke_every_installation", at: EARLIER }]);

    const outcome = await run(started, SECOND_STEP);

    expect(outcome).toEqual({ kind: "done", doneAt: AT });
    expect(started.actions.calls).toEqual([
      "removeAccountPasskeys:suspect-1",
      "endEveryBackofficeSession",
    ]);
    expect(started.store.current.audits).toEqual([
      {
        kind: "step_done",
        responseId: "response-1",
        step: "end_sessions_and_remove_passkeys",
        actorId: "admin-1",
        at: AT,
      },
    ]);
  });

  it("completes step 2 when the chosen account had no passkeys left, still ending every session", async () => {
    const started = world([{ key: "revoke_every_installation", at: EARLIER }]);
    started.actions.passkeyRemoval = "no_passkeys";

    const outcome = await run(started, SECOND_STEP);

    expect(outcome).toEqual({ kind: "done", doneAt: AT });
    expect(started.actions.calls).toEqual([
      "removeAccountPasskeys:suspect-1",
      "endEveryBackofficeSession",
    ]);
  });

  it.each(["authorization_required", "user_not_found", "own_account"] as const)(
    "leaves step 2 undone and every session open when the passkey removal is refused as %s",
    async (refusal) => {
      const started = world([{ key: "revoke_every_installation", at: EARLIER }]);
      started.actions.passkeyRemoval = refusal;

      const outcome = await run(started, SECOND_STEP);

      expect(outcome).toEqual({ kind: "action_refused", refusal });
      expect(started.actions.calls).toEqual(["removeAccountPasskeys:suspect-1"]);
      expect(started.store.current.audits).toEqual([]);
      expect(started.store.current.responses[0]?.completions).toEqual([
        { key: "revoke_every_installation", at: EARLIER },
      ]);
    },
  );

  it("completes step 3 when the PIN resets were required", async () => {
    const started = world(ACTION_COMPLETIONS.slice(0, 2));

    const outcome = await run(started, THIRD_STEP);

    expect(outcome).toEqual({ kind: "done", doneAt: AT });
    expect(started.actions.calls).toEqual(["requirePinResetOfEveryUser"]);
    expect(started.store.current.audits).toEqual([
      {
        kind: "step_done",
        responseId: "response-1",
        step: "force_pin_resets",
        actorId: "admin-1",
        at: AT,
      },
    ]);
  });

  it("reports the step as already done when another administrator completed it meanwhile", async () => {
    const fresh = world();
    fresh.actions.revokeEveryInstallation = async () => {
      fresh.store.responseById("response-1").completions.push({
        key: "revoke_every_installation",
        at: EARLIER,
      });
      return { kind: "revoked" };
    };

    const outcome = await run(fresh, FIRST_STEP);

    expect(outcome).toEqual({ kind: "already_done" });
    expect(fresh.store.current.audits).toEqual([]);
  });

  it("records nothing when the step cannot be recorded", async () => {
    const fresh = world();
    const before = fresh.store.snapshot();
    fresh.store.failingWrites.add("recordStepDone");

    await expect(run(fresh, FIRST_STEP)).rejects.toThrow("recordStepDone failed");

    expect(fresh.store.current).toEqual(before);
  });
});
