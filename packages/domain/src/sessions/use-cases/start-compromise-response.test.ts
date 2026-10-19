import { describe, expect, it } from "vitest";
import { startCompromiseResponse } from "./start-compromise-response.js";
import {
  AT,
  ACTION_COMPLETIONS,
  EVERY_ITEM_COMPLETION,
  response,
} from "./test-support/compromise-response-fixtures.js";
import { FakeCompromiseResponseStore } from "./test-support/fake-compromise-response-store.js";

describe("startCompromiseResponse", () => {
  it("starts a runbook with every step still to do, only the first available", async () => {
    const store = new FakeCompromiseResponseStore();

    const outcome = await startCompromiseResponse({ store }, { actorId: "admin-1", at: AT });

    expect(outcome.kind).toBe("started");
    expect(outcome.response).toMatchObject({
      id: "response-1",
      startedAt: AT,
      startedBy: "admin-1",
      completed: false,
    });
    expect(outcome.response.steps.map(({ step, available }) => ({ step, available }))).toEqual([
      { step: "revoke_every_installation", available: true },
      { step: "end_sessions_and_remove_passkeys", available: false },
      { step: "force_pin_resets", available: false },
      { step: "rotate_external_secrets", available: false },
      { step: "notify", available: false },
      { step: "re_enroll_registers", available: false },
    ]);
    expect(outcome.response.items.every(({ done }) => !done)).toBe(true);
  });

  it("audits the start with the administrator's id", async () => {
    const store = new FakeCompromiseResponseStore();

    await startCompromiseResponse({ store }, { actorId: "admin-1", at: AT });

    expect(store.current.audits).toEqual([
      { kind: "started", responseId: "response-1", actorId: "admin-1", at: AT },
    ]);
  });

  it("returns the runbook already running instead of starting another", async () => {
    const store = new FakeCompromiseResponseStore();
    store.seedResponse(response(ACTION_COMPLETIONS));

    const outcome = await startCompromiseResponse({ store }, { actorId: "admin-2", at: AT });

    expect(outcome.kind).toBe("already_running");
    expect(outcome.response.id).toBe("response-1");
    expect(outcome.response.steps[0]?.done).toBe(true);
    expect(store.current.responses).toHaveLength(1);
    expect(store.current.audits).toEqual([]);
  });

  it("starts a new runbook once the latest one is completed", async () => {
    const store = new FakeCompromiseResponseStore();
    store.seedResponse(response([...ACTION_COMPLETIONS, ...EVERY_ITEM_COMPLETION]));

    const outcome = await startCompromiseResponse({ store }, { actorId: "admin-2", at: AT });

    expect(outcome.kind).toBe("started");
    expect(outcome.response.id).toBe("response-2");
    expect(store.current.responses).toHaveLength(2);
  });

  it("starts nothing when the audit record cannot be written", async () => {
    const store = new FakeCompromiseResponseStore();
    store.failingWrites.add("startResponse");

    await expect(
      startCompromiseResponse({ store }, { actorId: "admin-1", at: AT }),
    ).rejects.toThrow("startResponse failed");

    expect(store.current.responses).toEqual([]);
  });
});
