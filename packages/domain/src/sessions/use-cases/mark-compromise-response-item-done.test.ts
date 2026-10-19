import { describe, expect, it } from "vitest";
import { markCompromiseResponseItemDone } from "./mark-compromise-response-item-done.js";
import {
  ACTION_COMPLETIONS,
  AT,
  EARLIER,
  EVERY_ITEM_COMPLETION,
  response,
  SECRET_COMPLETIONS,
} from "./test-support/compromise-response-fixtures.js";
import { FakeCompromiseResponseStore } from "./test-support/fake-compromise-response-store.js";

function storeWith(completions: Parameters<typeof response>[0]) {
  const store = new FakeCompromiseResponseStore();
  store.seedResponse(response(completions));
  return store;
}

function mark(store: FakeCompromiseResponseStore, item: "claude_api_key" | "notify") {
  return markCompromiseResponseItemDone({ store }, { item, actorId: "admin-1", at: AT });
}

describe("markCompromiseResponseItemDone", () => {
  it("refuses with no running response when no runbook was started", async () => {
    const outcome = await mark(new FakeCompromiseResponseStore(), "claude_api_key");

    expect(outcome).toEqual({ kind: "no_running_response" });
  });

  it("refuses with no running response when the latest runbook is completed", async () => {
    const store = storeWith([...ACTION_COMPLETIONS, ...EVERY_ITEM_COMPLETION]);

    expect(await mark(store, "claude_api_key")).toEqual({ kind: "no_running_response" });
  });

  it("refuses a secret before the three actions are done, recording nothing", async () => {
    const store = storeWith(ACTION_COMPLETIONS.slice(0, 2));

    const outcome = await mark(store, "claude_api_key");

    expect(outcome).toEqual({ kind: "out_of_order" });
    expect(store.current.audits).toEqual([]);
  });

  it("refuses the notification before every secret is rotated", async () => {
    const store = storeWith([...ACTION_COMPLETIONS, ...SECRET_COMPLETIONS.slice(1)]);

    expect(await mark(store, "notify")).toEqual({ kind: "out_of_order" });
  });

  it("refuses an item already done", async () => {
    const store = storeWith([...ACTION_COMPLETIONS, { key: "claude_api_key", at: EARLIER }]);

    const outcome = await mark(store, "claude_api_key");

    expect(outcome).toEqual({ kind: "already_done" });
    expect(store.current.audits).toEqual([]);
  });

  it("records a secret as rotated with who and when, and audits it", async () => {
    const store = storeWith(ACTION_COMPLETIONS);

    const outcome = await mark(store, "claude_api_key");

    expect(outcome).toEqual({ kind: "done", doneAt: AT });
    expect(store.current.responses[0]?.completions.at(-1)).toEqual({
      key: "claude_api_key",
      at: AT,
    });
    expect(store.current.audits).toEqual([
      {
        kind: "item_done",
        responseId: "response-1",
        item: "claude_api_key",
        actorId: "admin-1",
        at: AT,
      },
    ]);
  });

  it("records the notification once every secret is rotated, completing the runbook", async () => {
    const store = storeWith([...ACTION_COMPLETIONS, ...SECRET_COMPLETIONS]);

    const outcome = await mark(store, "notify");

    expect(outcome).toEqual({ kind: "done", doneAt: AT });
    expect(await mark(store, "claude_api_key")).toEqual({ kind: "no_running_response" });
  });

  it("records nothing when the item cannot be recorded", async () => {
    const store = storeWith(ACTION_COMPLETIONS);
    const before = store.snapshot();
    store.failingWrites.add("recordItemDone");

    await expect(mark(store, "claude_api_key")).rejects.toThrow("recordItemDone failed");

    expect(store.current).toEqual(before);
  });
});
