import type { FiscalEmissionMode } from "@purosur/domain";
import type { RecordContingencyBackupTicketInput } from "@purosur/domain/backups/use-cases";
import { describe, expect, it } from "vitest";
import { createTicketedOperations } from "./ticketed-operation";

const REAL_TIME: FiscalEmissionMode = { kind: "real_time" };
const OFFLINE: FiscalEmissionMode = { kind: "offline_code", cause: "no_connectivity" };

function setup({
  seqs = [10, 12],
  modes = [REAL_TIME, OFFLINE],
}: {
  seqs?: number[];
  modes?: FiscalEmissionMode[];
} = {}) {
  const log: string[] = [];
  const recorded: RecordContingencyBackupTicketInput[] = [];
  const reported: { context: string; error: unknown }[] = [];
  const state = { recordFails: false, readFails: false };
  const remainingSeqs = [...seqs];
  const remainingModes = [...modes];
  const ticketing = createTicketedOperations({
    readLastDeviceSeq: () => {
      if (state.readFails) throw new Error("the database is locked");
      log.push("read seq");
      return remainingSeqs.shift() ?? 0;
    },
    readEmissionMode: () => {
      log.push("read mode");
      return remainingModes.shift() ?? REAL_TIME;
    },
    record: async (input) => {
      log.push("record");
      if (state.recordFails) throw new Error("the ticket cannot be recorded");
      recorded.push(input);
    },
    afterRecorded: () => log.push("kick"),
    reportFailure: (context, error) => reported.push({ context, error }),
  });
  return { ticketing, log, recorded, reported, state };
}

describe("an operation that leaves a ticket in a connectivity gap", () => {
  it("records the events it appended, with the modes around it and its subject, then kicks the printing", async () => {
    const { ticketing, recorded, log } = setup();
    const operation = ticketing.ticketed(
      "sale",
      async (request: { saleId: string }) => ({ kind: "completed", sale_id: request.saleId }),
      (_request, outcome) => outcome.sale_id,
    );

    const outcome = await operation?.({ saleId: "sale-1" });

    expect(outcome).toEqual({ kind: "completed", sale_id: "sale-1" });
    expect(recorded).toEqual([
      {
        operation: "sale",
        subjectId: "sale-1",
        modesAround: [REAL_TIME, OFFLINE],
        range: { firstDeviceSeq: 11, lastDeviceSeq: 12 },
      },
    ]);
    expect(log.at(-2)).toBe("record");
    expect(log.at(-1)).toBe("kick");
  });

  it("reads the last sequence number and the mode before the operation and again after it", async () => {
    const { ticketing, log } = setup();
    const operation = ticketing.ticketed("cash_movement", async () => {
      log.push("operation");
      return { kind: "recorded" };
    });

    await operation?.();

    expect(log.slice(0, 5)).toEqual([
      "read seq",
      "read mode",
      "operation",
      "read seq",
      "read mode",
    ]);
  });

  it("passes every argument of the operation on and takes its subject from them", async () => {
    const { ticketing, recorded } = setup();
    const operation = ticketing.ticketed(
      "cash_session_closing",
      async (sessionId: string, countedCash: number) => ({
        kind: "closed",
        sessionId,
        countedCash,
      }),
      ([sessionId]) => sessionId,
    );

    expect(await operation?.("session-1", 500)).toEqual({
      kind: "closed",
      sessionId: "session-1",
      countedCash: 500,
    });
    expect(recorded[0]?.subjectId).toBe("session-1");
  });

  it("records no subject when the operation names none", async () => {
    const { ticketing, recorded } = setup();

    await ticketing.ticketed("initial_count", async () => ({ kind: "recorded" }))?.();

    expect(recorded[0]?.subjectId).toBeNull();
  });

  it("returns the outcome of the operation whatever the recording does, and reports the failure", async () => {
    const { ticketing, reported, state, log } = setup();
    state.recordFails = true;

    const outcome = await ticketing.ticketed("sale", async () => ({ kind: "completed" }))?.();

    expect(outcome).toEqual({ kind: "completed" });
    expect(reported.map(({ context }) => context)).toEqual([
      "recording a contingency backup ticket",
    ]);
    expect(log).not.toContain("kick");
  });

  it("still runs the operation when the register cannot be read before it", async () => {
    const { ticketing, reported, recorded, state } = setup();
    state.readFails = true;

    const outcome = await ticketing.ticketed("sale", async () => ({ kind: "completed" }))?.();

    expect(outcome).toEqual({ kind: "completed" });
    expect(reported).toHaveLength(1);
    expect(recorded).toEqual([]);
  });

  it("rethrows what the operation throws, recording nothing", async () => {
    const { ticketing, recorded, reported } = setup();
    const operation = ticketing.ticketed("sale", async () => {
      throw new Error("the operation failed");
    });

    await expect(operation?.()).rejects.toThrow("the operation failed");
    expect(recorded).toEqual([]);
    expect(reported).toEqual([]);
  });

  it("leaves an operation that is not wired as it is", () => {
    const { ticketing } = setup();

    expect(ticketing.ticketed("sale", undefined)).toBeUndefined();
  });
});
