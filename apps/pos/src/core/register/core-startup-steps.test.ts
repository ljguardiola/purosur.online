import type { CoreStartupStep, CoreStartupStepMessage } from "@purosur/contracts";
import { describe, expect, it } from "vitest";
import { prepareLocalDataFolder, startupStepReporter } from "./core-startup-steps";

describe("startupStepReporter", () => {
  it("posts the notice of the step the core is at", () => {
    const posted: CoreStartupStepMessage[] = [];

    startupStepReporter((message) => posted.push(message))("check_free_disk_space");

    expect(posted).toEqual([{ type: "core-startup-step", step: "check_free_disk_space" }]);
  });
});

describe("prepareLocalDataFolder", () => {
  function preparing(
    overrides: Partial<{
      setAsideStaleDatabase: () => Promise<unknown>;
      adoptStagedSnapshot: () => Promise<unknown>;
    }> = {},
  ) {
    const events: string[] = [];
    const failures: unknown[] = [];
    const prepared = prepareLocalDataFolder({
      setAsideStaleDatabase: async () => {
        events.push("set aside");
      },
      adoptStagedSnapshot: async () => {
        events.push("adopted");
      },
      reportStep: (step: CoreStartupStep) => events.push(`reported ${step}`),
      onFailure: (error) => failures.push(error),
      ...overrides,
    });
    return { events, failures, prepared };
  }

  it("reports setting aside the stale database, then adopting the staged snapshot, each before taking it", async () => {
    const { events, failures, prepared } = preparing();

    await prepared;

    expect(events).toEqual([
      "reported set_aside_stale_database",
      "set aside",
      "reported adopt_staged_snapshot",
      "adopted",
    ]);
    expect(failures).toEqual([]);
  });

  it("reports the adoption only once the stale database was set aside", async () => {
    let finishSettingAside: () => void = () => {};
    const { events, prepared } = preparing({
      setAsideStaleDatabase: () =>
        new Promise<void>((resolve) => {
          finishSettingAside = resolve;
        }),
    });

    await Promise.resolve();
    expect(events).toEqual(["reported set_aside_stale_database"]);
    finishSettingAside();
    await prepared;
    expect(events).toEqual([
      "reported set_aside_stale_database",
      "reported adopt_staged_snapshot",
      "adopted",
    ]);
  });

  it("neither adopts nor reports the adoption when setting aside fails, and hands over the failure", async () => {
    const failure = new Error("the folder could not be read");
    const { events, failures, prepared } = preparing({
      setAsideStaleDatabase: () => Promise.reject(failure),
    });

    await prepared;

    expect(events).toEqual(["reported set_aside_stale_database"]);
    expect(failures).toEqual([failure]);
  });

  it("hands over a failed adoption", async () => {
    const failure = new Error("the snapshot could not be adopted");
    const { failures, prepared } = preparing({
      adoptStagedSnapshot: () => Promise.reject(failure),
    });

    await prepared;

    expect(failures).toEqual([failure]);
  });
});
