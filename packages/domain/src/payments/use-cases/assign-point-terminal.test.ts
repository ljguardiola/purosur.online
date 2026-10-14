import { describe, expect, it } from "vitest";
import { assignPointTerminal } from "./assign-point-terminal.js";
import { FakePointTerminalAssignmentStore } from "./test-support/fake-point-terminal-assignment-store.js";

const BRANCH = "branch-1";
const ACTOR = "user-1";
const TERMINAL = "PAX_A910__SMARTPOS1234567890";
const OTHER_TERMINAL = "PAX_A910__SMARTPOS0987654321";

function storeWithRegisters(): FakePointTerminalAssignmentStore {
  const store = new FakePointTerminalAssignmentStore();
  store.seedRegister({ id: "register-1", locationId: BRANCH });
  store.seedRegister({ id: "register-2", locationId: BRANCH });
  store.seedRegister({ id: "register-3", locationId: "branch-2" });
  return store;
}

function assign(store: FakePointTerminalAssignmentStore, overrides: Record<string, unknown> = {}) {
  return assignPointTerminal(store, {
    locationId: BRANCH,
    registerId: "register-1",
    terminalId: TERMINAL,
    version: 0,
    actorId: ACTOR,
    ...overrides,
  });
}

describe("assignPointTerminal", () => {
  it("gives a register that never had a terminal its terminal at version 1, recording who did it", async () => {
    const store = storeWithRegisters();

    const outcome = await assign(store);

    expect(outcome).toEqual({
      kind: "assigned",
      assignment: { terminalId: TERMINAL, version: 1 },
    });
    expect(store.snapshot().registerPointTerminals).toEqual([
      { registerId: "register-1", terminalId: TERMINAL, version: 1, recordedBy: ACTOR },
    ]);
  });

  it("locks the register, its assignment and the terminal's holder, in that order, before it writes, in one transaction", async () => {
    const store = storeWithRegisters();

    await assign(store);

    expect(store.operationOrder).toEqual([
      "lockBranchRegister",
      "lockRegisterPointTerminal",
      "lockPointTerminalHolder",
      "recordPointTerminalAssignment",
    ]);
    expect(store.transactionCount).toBe(1);
  });

  it("keeps the terminal id without the whitespace around it", async () => {
    const store = storeWithRegisters();

    const outcome = await assign(store, { terminalId: `  ${TERMINAL}\n` });

    expect(outcome).toEqual({
      kind: "assigned",
      assignment: { terminalId: TERMINAL, version: 1 },
    });
  });

  it.each(["", "   ", "PAX A910"])(
    "refuses the terminal id %j, touching no storage",
    async (terminalId) => {
      const store = storeWithRegisters();

      const outcome = await assign(store, { terminalId });

      expect(outcome).toEqual({ kind: "invalid_terminal_id" });
      expect(store.operationOrder).toEqual([]);
      expect(store.transactionCount).toBe(0);
    },
  );

  it.each([
    ["does not exist", "missing"],
    ["belongs to another branch", "register-3"],
  ])("refuses a register that %s, writing nothing", async (_case, registerId) => {
    const store = storeWithRegisters();
    const before = store.snapshot();

    const outcome = await assign(store, { registerId });

    expect(outcome).toEqual({ kind: "register_not_found" });
    expect(store.snapshot()).toEqual(before);
    expect(store.operationOrder).toEqual(["lockBranchRegister"]);
  });

  it("refuses an assignment made from a version other than the register's current one", async () => {
    const store = storeWithRegisters();
    store.seedAssignment({ registerId: "register-1", terminalId: TERMINAL, version: 2 });
    const before = store.snapshot();

    const outcome = await assign(store, { terminalId: OTHER_TERMINAL, version: 1 });

    expect(outcome).toEqual({ kind: "stale_version" });
    expect(store.snapshot()).toEqual(before);
    expect(store.operationOrder).toEqual(["lockBranchRegister", "lockRegisterPointTerminal"]);
  });

  it("refuses a first assignment made from any version but 0", async () => {
    const store = storeWithRegisters();

    expect(await assign(store, { version: 1 })).toEqual({ kind: "stale_version" });
  });

  it("refuses a terminal another register holds, writing nothing", async () => {
    const store = storeWithRegisters();
    store.seedAssignment({ registerId: "register-2", terminalId: TERMINAL, version: 1 });
    const before = store.snapshot();

    const outcome = await assign(store);

    expect(outcome).toEqual({ kind: "terminal_taken" });
    expect(store.snapshot()).toEqual(before);
    expect(store.operationOrder).toEqual([
      "lockBranchRegister",
      "lockRegisterPointTerminal",
      "lockPointTerminalHolder",
    ]);
  });

  it("answers terminal_taken when it loses the terminal to a concurrent assignment, leaving nothing behind", async () => {
    const store = storeWithRegisters();
    store.terminalsLostToRace.add(TERMINAL);
    const before = store.snapshot();

    const outcome = await assign(store);

    expect(outcome).toEqual({ kind: "terminal_taken" });
    expect(store.snapshot()).toEqual(before);
  });

  it("changes the terminal of a register that had another one, bumping the version", async () => {
    const store = storeWithRegisters();
    store.seedAssignment({ registerId: "register-1", terminalId: TERMINAL, version: 2 });

    const outcome = await assign(store, { terminalId: OTHER_TERMINAL, version: 2 });

    expect(outcome).toEqual({
      kind: "assigned",
      assignment: { terminalId: OTHER_TERMINAL, version: 3 },
    });
  });

  it("lets a register take back a terminal it held before another one", async () => {
    const store = storeWithRegisters();
    store.seedAssignment({ registerId: "register-1", terminalId: null, version: 3 });

    const outcome = await assign(store, { version: 3 });

    expect(outcome).toEqual({
      kind: "assigned",
      assignment: { terminalId: TERMINAL, version: 4 },
    });
  });

  it("clears the terminal of a register, bumping the version, without asking who holds one", async () => {
    const store = storeWithRegisters();
    store.seedAssignment({ registerId: "register-1", terminalId: TERMINAL, version: 1 });

    const outcome = await assign(store, { terminalId: null, version: 1 });

    expect(outcome).toEqual({ kind: "assigned", assignment: { terminalId: null, version: 2 } });
    expect(store.operationOrder).toEqual([
      "lockBranchRegister",
      "lockRegisterPointTerminal",
      "recordPointTerminalAssignment",
    ]);
    expect(store.snapshot().registerPointTerminals).toEqual([
      { registerId: "register-1", terminalId: null, version: 2, recordedBy: ACTOR },
    ]);
  });

  it("frees a cleared terminal for another register", async () => {
    const store = storeWithRegisters();
    store.seedAssignment({ registerId: "register-1", terminalId: TERMINAL, version: 1 });
    await assign(store, { terminalId: null, version: 1 });

    const outcome = await assign(store, { registerId: "register-2" });

    expect(outcome.kind).toBe("assigned");
  });

  it("records nothing when the register already has that terminal", async () => {
    const store = storeWithRegisters();
    store.seedAssignment({ registerId: "register-1", terminalId: TERMINAL, version: 1 });
    const before = store.snapshot();

    const outcome = await assign(store, { version: 1 });

    expect(outcome).toEqual({
      kind: "unchanged",
      assignment: { terminalId: TERMINAL, version: 1 },
    });
    expect(store.snapshot()).toEqual(before);
    expect(store.operationOrder).toEqual(["lockBranchRegister", "lockRegisterPointTerminal"]);
  });

  it("records nothing when a register with no terminal is cleared", async () => {
    const store = storeWithRegisters();

    const outcome = await assign(store, { terminalId: null });

    expect(outcome).toEqual({ kind: "unchanged", assignment: { terminalId: null, version: 0 } });
    expect(store.snapshot().registerPointTerminals).toEqual([]);
  });

  it("leaves nothing behind when recording fails, and lets the error through", async () => {
    const store = storeWithRegisters();
    store.failingWrites = true;
    const before = store.snapshot();

    await expect(assign(store)).rejects.toThrow("recordPointTerminalAssignment failed");

    expect(store.snapshot()).toEqual(before);
  });
});
