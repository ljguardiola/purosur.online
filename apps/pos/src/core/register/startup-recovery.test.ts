import { describe, expect, it } from "vitest";
import { recoverAtStartup } from "./startup-recovery";

function deferred() {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function recovery(overrides: Partial<Parameters<typeof recoverAtStartup>[0]> = {}) {
  const events: string[] = [];
  const failures: [string, unknown][] = [];
  const deps = {
    settleInterruptedAuthorizations: async () => {
      events.push("authorizations settled");
    },
    followInterruptedCharges: async () => {
      events.push("charges followed");
    },
    startSync: () => {
      events.push("sync started");
    },
    reportFailure: (activity: string, error: unknown) => {
      failures.push([activity, error]);
    },
    ...overrides,
  };
  return { events, failures, started: recoverAtStartup(deps) };
}

describe("recovering at startup", () => {
  it("starts sync only after the interrupted authorizations and charges were settled", async () => {
    const authorizations = deferred();
    const charges = deferred();
    const { events, started } = recovery({
      settleInterruptedAuthorizations: async () => {
        await authorizations.promise;
        events.push("authorizations settled");
      },
      followInterruptedCharges: async () => {
        await charges.promise;
        events.push("charges followed");
      },
    });

    await Promise.resolve();
    expect(events).toEqual([]);
    authorizations.resolve();
    await started.authorizationsSettled;
    expect(events).toEqual(["authorizations settled"]);
    charges.resolve();
    await started.finished;
    expect(events).toEqual(["authorizations settled", "charges followed", "sync started"]);
  });

  it("answers that the authorizations are settled without waiting for the charges", async () => {
    const charges = deferred();
    const { events, started } = recovery({
      followInterruptedCharges: async () => {
        await charges.promise;
      },
    });

    await started.authorizationsSettled;

    expect(events).toEqual(["authorizations settled"]);
    charges.resolve();
    await started.finished;
  });

  it("reports a failure to settle the authorizations and still follows the charges and starts sync", async () => {
    const broken = new Error("the authorizations could not be settled");
    const { events, failures, started } = recovery({
      settleInterruptedAuthorizations: async () => {
        throw broken;
      },
    });

    await started.finished;

    expect(failures).toEqual([["settling the interrupted real-time authorizations", broken]]);
    expect(events).toEqual(["charges followed", "sync started"]);
  });
});
