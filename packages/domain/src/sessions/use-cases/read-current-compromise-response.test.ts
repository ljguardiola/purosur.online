import { describe, expect, it } from "vitest";
import { readCurrentCompromiseResponse } from "./read-current-compromise-response.js";
import {
  ACTION_COMPLETIONS,
  EARLIER,
  EVERY_ITEM_COMPLETION,
  response,
  STARTED_AT,
} from "./test-support/compromise-response-fixtures.js";
import { FakeCompromiseResponseStore } from "./test-support/fake-compromise-response-store.js";

describe("readCurrentCompromiseResponse", () => {
  it("answers none when no runbook was ever started", async () => {
    const outcome = await readCurrentCompromiseResponse({ responses: new FakeCompromiseResponseStore() });

    expect(outcome).toEqual({ kind: "none" });
  });

  it("shows the six steps in order with when each action step was done", async () => {
    const store = new FakeCompromiseResponseStore();
    store.seedResponse(response(ACTION_COMPLETIONS.slice(0, 2)));

    const outcome = await readCurrentCompromiseResponse({ responses: store });

    if (outcome.kind !== "found") {
      throw new Error("expected a runbook");
    }
    expect(outcome.response).toMatchObject({
      id: "response-1",
      startedAt: STARTED_AT,
      startedBy: "admin-1",
      completed: false,
    });
    expect(outcome.response.steps.map(({ step, done, doneAt, available }) => ({
      step,
      done,
      doneAt,
      available,
    }))).toEqual([
      { step: "revoke_every_installation", done: true, doneAt: EARLIER, available: false },
      { step: "end_sessions_and_remove_passkeys", done: true, doneAt: EARLIER, available: false },
      { step: "force_pin_resets", done: false, doneAt: null, available: true },
      { step: "rotate_external_secrets", done: false, doneAt: null, available: false },
      { step: "notify", done: false, doneAt: null, available: false },
      { step: "re_enroll_registers", done: false, doneAt: null, available: false },
    ]);
  });

  it("lists the checklist items with when each was done", async () => {
    const store = new FakeCompromiseResponseStore();
    store.seedResponse(response([...ACTION_COMPLETIONS, { key: "claude_api_key", at: EARLIER }]));

    const outcome = await readCurrentCompromiseResponse({ responses: store });

    if (outcome.kind !== "found") {
      throw new Error("expected a runbook");
    }
    expect(outcome.response.items.map(({ item }) => item)).toEqual([
      "mercado_pago_webhook_secret",
      "whatsapp_webhook_token",
      "whatsapp_webhook_secret",
      "claude_api_key",
      "postgres_credentials",
      "ci_deployment_credentials",
      "storage_bucket_credentials",
      "arca_certificate_and_private_key",
      "notify",
    ]);
    expect(outcome.response.items.filter(({ done }) => done)).toEqual([
      { item: "claude_api_key", step: "rotate_external_secrets", done: true, doneAt: EARLIER },
    ]);
  });

  it("shows the latest runbook as completed, with the re-enrollment pointer available", async () => {
    const store = new FakeCompromiseResponseStore();
    store.seedResponse(response([...ACTION_COMPLETIONS, ...EVERY_ITEM_COMPLETION]));

    const outcome = await readCurrentCompromiseResponse({ responses: store });

    if (outcome.kind !== "found") {
      throw new Error("expected a runbook");
    }
    expect(outcome.response.completed).toBe(true);
    expect(outcome.response.steps[5]).toEqual({
      step: "re_enroll_registers",
      done: false,
      doneAt: null,
      available: true,
    });
  });

  it("shows the latest of several runbooks", async () => {
    const store = new FakeCompromiseResponseStore();
    store.seedResponse(response([...ACTION_COMPLETIONS, ...EVERY_ITEM_COMPLETION], "response-1"));
    store.seedResponse(response([], "response-2"));

    const outcome = await readCurrentCompromiseResponse({ responses: store });

    expect(outcome).toMatchObject({ kind: "found", response: { id: "response-2", completed: false } });
  });
});
