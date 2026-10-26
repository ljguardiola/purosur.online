import { describe, expect, it } from "vitest";
import { createDeferredBacklogSerializer } from "./deferred-backlog-serializer";

function gate() {
  let open: () => void = () => undefined;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { opened, open };
}

describe("the serializer of the deferred backlog's runs", () => {
  it("starts a run only once the one before it has ended", async () => {
    const serialize = createDeferredBacklogSerializer();
    const first = gate();
    const events: string[] = [];

    const running = serialize(async () => {
      events.push("first starts");
      await first.opened;
      events.push("first ends");
    });
    const waiting = serialize(async () => {
      events.push("second starts");
    });
    await new Promise((resolve) => setImmediate(resolve));
    expect(events).toEqual(["first starts"]);

    first.open();
    await Promise.all([running, waiting]);

    expect(events).toEqual(["first starts", "first ends", "second starts"]);
  });

  it("answers each run with its own result", async () => {
    const serialize = createDeferredBacklogSerializer();

    const answers = await Promise.all([serialize(async () => 1), serialize(async () => "two")]);

    expect(answers).toEqual([1, "two"]);
  });

  it("runs the next one after a run fails, handing the failure to its own caller only", async () => {
    const serialize = createDeferredBacklogSerializer();
    const failure = new Error("the run failed");

    const failed = serialize(async () => {
      throw failure;
    });
    const next = serialize(async () => "ran");

    await expect(failed).rejects.toBe(failure);
    await expect(next).resolves.toBe("ran");
  });
});
