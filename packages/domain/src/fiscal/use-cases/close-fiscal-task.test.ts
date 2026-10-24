import { describe, expect, it } from "vitest";
import { closeFiscalTask } from "./close-fiscal-task.js";
import {
  DEFAULT_LOCATION_ID,
  FakeCloseFiscalTaskStore,
} from "./test-support/fake-close-fiscal-task.js";
import { FixedClock } from "./test-support/fixed-clock.js";

const NOW = new Date("2026-10-20T15:00:00.000Z");
const NOTE = "Regularized with the accountant";

function setup() {
  const store = new FakeCloseFiscalTaskStore();
  const ports = { store, clock: new FixedClock(NOW) };
  return { store, ports };
}

function input(overrides: Partial<Parameters<typeof closeFiscalTask>[1]> = {}) {
  return {
    taskId: "task-1",
    locationId: DEFAULT_LOCATION_ID,
    closedBy: "user-1",
    note: NOTE,
    ...overrides,
  };
}

describe("closeFiscalTask", () => {
  it("closes an open task recording who closed it, when and how it was regularized", async () => {
    const { store, ports } = setup();
    store.seedTask("task-1", "open");

    const outcome = await closeFiscalTask(ports, input());

    expect(outcome).toEqual({ kind: "closed", closedAt: NOW });
    expect(store.stateOf("task-1")).toBe("closed");
    expect(store.snapshot().closings).toEqual([
      { taskId: "task-1", closedBy: "user-1", closedAt: NOW, note: NOTE },
    ]);
  });

  it("audits the closing with the person, the moment and the note", async () => {
    const { store, ports } = setup();
    store.seedTask("task-1", "open");

    await closeFiscalTask(ports, input());

    expect(store.snapshot().audits).toEqual([
      { taskId: "task-1", actorId: "user-1", at: NOW, note: NOTE },
    ]);
  });

  it("locks the task of the branch before writing anything", async () => {
    const { store, ports } = setup();
    store.seedTask("task-1", "open");

    await closeFiscalTask(ports, input());

    expect(store.operationOrder).toEqual([
      "lockFiscalTaskOfBranch",
      "recordClosing",
      "recordClosingAudit",
    ]);
  });

  it("answers not found for a task that does not exist, writing nothing", async () => {
    const { store, ports } = setup();

    const outcome = await closeFiscalTask(ports, input({ taskId: "unknown" }));

    expect(outcome).toEqual({ kind: "not_found" });
    expect(store.operationOrder).toEqual(["lockFiscalTaskOfBranch"]);
    expect(store.snapshot()).toEqual({ closings: [], audits: [] });
  });

  it("answers not found for a task of another branch, leaving it open", async () => {
    const { store, ports } = setup();
    store.seedTask("task-1", "open", "location-2");

    const outcome = await closeFiscalTask(ports, input());

    expect(outcome).toEqual({ kind: "not_found" });
    expect(store.stateOf("task-1")).toBe("open");
    expect(store.snapshot()).toEqual({ closings: [], audits: [] });
  });

  it("says a closed task is already closed, writing nothing", async () => {
    const { store, ports } = setup();
    store.seedTask("task-1", "closed");

    const outcome = await closeFiscalTask(ports, input());

    expect(outcome).toEqual({ kind: "already_closed" });
    expect(store.operationOrder).toEqual(["lockFiscalTaskOfBranch"]);
    expect(store.snapshot()).toEqual({ closings: [], audits: [] });
  });

  it("does not close a task twice", async () => {
    const { store, ports } = setup();
    store.seedTask("task-1", "open");

    await closeFiscalTask(ports, input());
    const second = await closeFiscalTask(ports, input({ closedBy: "user-2", note: "Again" }));

    expect(second).toEqual({ kind: "already_closed" });
    expect(store.snapshot().closings).toHaveLength(1);
    expect(store.snapshot().audits).toHaveLength(1);
  });

  it.each(["recordClosing", "recordClosingAudit"] as const)(
    "leaves the task open and nothing recorded when %s fails",
    async (operation) => {
      const { store, ports } = setup();
      store.seedTask("task-1", "open");
      store.failingWrites.add(operation);

      await expect(closeFiscalTask(ports, input())).rejects.toThrow(`${operation} failed`);

      expect(store.stateOf("task-1")).toBe("open");
      expect(store.snapshot()).toEqual({ closings: [], audits: [] });
    },
  );
});
