import type {
  CorrectRegisterClockOutcome,
  FiscalRendererToCoreMessage,
  ReadClockGuardOutcome,
} from "@purosur/contracts";
import { describe, expect, it } from "vitest";
import { answerClockGuardRequest, type ClockGuardRequests } from "./clock-guard-answers";

const REQUEST_ID = "7d1c1e1e-5b1a-4a53-9c1c-3a7c6f0b2d10";

const READ: ReadClockGuardOutcome = {
  kind: "read",
  reading: "2026-10-01T15:00:00.000Z",
  blocks: [],
  may_correct: true,
  correction_available: false,
};
const CORRECTED: CorrectRegisterClockOutcome = { kind: "not_behind" };

function requests() {
  const calls: string[] = [];
  const answering: ClockGuardRequests = {
    read: async () => {
      calls.push("read");
      return READ;
    },
    correct: async () => {
      calls.push("correct");
      return CORRECTED;
    },
  };
  return { answering, calls };
}

const MESSAGES: [FiscalRendererToCoreMessage, string, unknown][] = [
  [{ type: "read-clock-guard", request_id: REQUEST_ID }, "read", READ],
  [{ type: "correct-register-clock", request_id: REQUEST_ID }, "correct", CORRECTED],
];

describe("answering a request about the register's clock guard", () => {
  it.each(MESSAGES)(
    "answers %j with the outcome of its request",
    async (message, call, outcome) => {
      const { answering, calls } = requests();

      const answer = await answerClockGuardRequest(
        { clockGuard: answering, reportFailure: () => {} },
        message,
      );

      expect(answer).toEqual({ type: `${message.type}-result`, request_id: REQUEST_ID, outcome });
      expect(calls).toEqual([call]);
    },
  );

  it.each(MESSAGES)(
    "answers unavailable to %j when the register has no database",
    async (message) => {
      const answer = await answerClockGuardRequest(
        { clockGuard: undefined, reportFailure: () => {} },
        message,
      );

      expect(answer).toEqual({
        type: `${message.type}-result`,
        request_id: REQUEST_ID,
        outcome: { kind: "unavailable" },
      });
    },
  );

  it.each(MESSAGES)("answers unavailable to %j when it fails, and reports why", async (message) => {
    const error = new Error("database is locked");
    const failing = async () => {
      throw error;
    };
    const failures: { context: string; error: unknown }[] = [];

    const answer = await answerClockGuardRequest(
      {
        clockGuard: { read: failing, correct: failing },
        reportFailure: (context, reported) => failures.push({ context, error: reported }),
      },
      message,
    );

    expect(answer).toEqual({
      type: `${message.type}-result`,
      request_id: REQUEST_ID,
      outcome: { kind: "unavailable" },
    });
    expect(failures).toHaveLength(1);
    expect(failures[0]?.error).toBe(error);
  });
});
