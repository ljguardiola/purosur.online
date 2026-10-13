import { describe, expect, it } from "vitest";
import { createSafeMomentAsker } from "./update-safe-moment-asker";

function setup(options: { core?: boolean } = {}) {
  const sent: unknown[] = [];
  const timeouts: (() => void)[] = [];
  let nextId = 0;
  const asker = createSafeMomentAsker({
    sendToCore: (message) => {
      if (options.core === false) {
        return false;
      }
      sent.push(message);
      return true;
    },
    newRequestId: () => `r${++nextId}`,
    startTimeout: (run) => {
      timeouts.push(run);
    },
  });
  return { asker, sent, timeouts };
}

describe("createSafeMomentAsker", () => {
  it("sends the request and resolves with the core's answer", async () => {
    const { asker, sent } = setup();

    const answer = asker.ask();
    asker.handleCoreMessage({ type: "update-safe-moment", request_id: "r1", safe: true });

    expect(sent).toEqual([{ type: "update-safe-moment-request", request_id: "r1" }]);
    expect(await answer).toBe(true);
  });

  it("resolves not safe when the core says so", async () => {
    const { asker } = setup();

    const answer = asker.ask();
    asker.handleCoreMessage({ type: "update-safe-moment", request_id: "r1", safe: false });

    expect(await answer).toBe(false);
  });

  it("ignores an answer to another request and messages that are not answers", async () => {
    const { asker, timeouts } = setup();

    const answer = asker.ask();
    asker.handleCoreMessage({ type: "update-safe-moment", request_id: "other", safe: true });
    asker.handleCoreMessage({ type: "core-ready" });
    timeouts[0]?.();

    expect(await answer).toBe(false);
  });

  it("treats no answer in time as not safe", async () => {
    const { asker, timeouts } = setup();

    const answer = asker.ask();
    timeouts[0]?.();

    expect(await answer).toBe(false);
  });

  it("treats a core that can not be reached as not safe", async () => {
    const { asker } = setup({ core: false });

    expect(await asker.ask()).toBe(false);
  });

  it("does not take a late answer for the next question", async () => {
    const { asker, timeouts } = setup();
    const first = asker.ask();
    timeouts[0]?.();
    await first;

    const second = asker.ask();
    asker.handleCoreMessage({ type: "update-safe-moment", request_id: "r1", safe: true });
    timeouts[1]?.();

    expect(await second).toBe(false);
  });

  it("releases the core's hold once it stops waiting for an answer", async () => {
    const { asker, sent, timeouts } = setup();

    const answer = asker.ask();
    timeouts[0]?.();
    await answer;

    expect(sent).toEqual([
      { type: "update-safe-moment-request", request_id: "r1" },
      { type: "update-hold-release" },
    ]);
  });

  it("releases the core's hold again when a safe answer arrives after it stopped waiting", async () => {
    const { asker, sent, timeouts } = setup();
    const answer = asker.ask();
    timeouts[0]?.();
    await answer;

    asker.handleCoreMessage({ type: "update-safe-moment", request_id: "r1", safe: true });

    expect(sent.slice(2)).toEqual([{ type: "update-hold-release" }]);
  });

  it("releases nothing for a late answer that is not safe or for a question it never asked", async () => {
    const { asker, sent, timeouts } = setup();
    const answer = asker.ask();
    timeouts[0]?.();
    await answer;

    asker.handleCoreMessage({ type: "update-safe-moment", request_id: "r1", safe: false });
    asker.handleCoreMessage({ type: "update-safe-moment", request_id: "other", safe: true });

    expect(sent).toHaveLength(2);
  });

  it("releases nothing when the core answered in time", async () => {
    const { asker, sent, timeouts } = setup();

    const answer = asker.ask();
    asker.handleCoreMessage({ type: "update-safe-moment", request_id: "r1", safe: true });
    timeouts[0]?.();
    await answer;

    expect(sent).toEqual([{ type: "update-safe-moment-request", request_id: "r1" }]);
  });
});
