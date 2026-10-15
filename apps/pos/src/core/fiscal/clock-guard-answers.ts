import type {
  CorrectRegisterClockOutcome,
  FiscalCoreToRendererMessage,
  FiscalRendererToCoreMessage,
  ReadClockGuardOutcome,
} from "@purosur/contracts";
import {
  type ClockCorrectionRequestDeps,
  correctRegisterClockFor,
  readClockGuardFor,
} from "./clock-correction-requests";

export interface ClockGuardRequests {
  read: () => Promise<ReadClockGuardOutcome>;
  correct: () => Promise<CorrectRegisterClockOutcome>;
}

export function createClockGuardRequests(deps: ClockCorrectionRequestDeps): ClockGuardRequests {
  return {
    read: async () => readClockGuardFor(deps),
    correct: () => correctRegisterClockFor(deps),
  };
}

const UNAVAILABLE = { kind: "unavailable" } as const;

async function attempt<Outcome>(
  reportFailure: (context: string, error: unknown) => void,
  context: string,
  work: (() => Promise<Outcome>) | undefined,
): Promise<Outcome | typeof UNAVAILABLE> {
  try {
    return (await work?.()) ?? UNAVAILABLE;
  } catch (error) {
    reportFailure(context, error);
    return UNAVAILABLE;
  }
}

export async function answerClockGuardRequest(
  {
    clockGuard,
    reportFailure,
  }: {
    clockGuard: ClockGuardRequests | undefined;
    reportFailure: (context: string, error: unknown) => void;
  },
  message: FiscalRendererToCoreMessage,
): Promise<FiscalCoreToRendererMessage> {
  const request_id = message.request_id;
  switch (message.type) {
    case "read-clock-guard":
      return {
        type: "read-clock-guard-result",
        request_id,
        outcome: await attempt(
          reportFailure,
          "reading the register's clock guard",
          clockGuard && (() => clockGuard.read()),
        ),
      };
    case "correct-register-clock":
      return {
        type: "correct-register-clock-result",
        request_id,
        outcome: await attempt(
          reportFailure,
          "correcting the register's clock",
          clockGuard && (() => clockGuard.correct()),
        ),
      };
  }
}
