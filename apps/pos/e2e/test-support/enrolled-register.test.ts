import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CORE_READY } from "./core-start-outcomes";
import { enrolledRegister } from "./enrolled-register";
import type { StandInCloud } from "./stand-in-cloud";

const BOUND_MS = 60_000;

const kills: (NodeJS.Signals | number | undefined)[] = [];

interface StandInElectron {
  readonly app: {
    getPath(name: string): string;
    getAppMetrics(): { pid: number }[];
  };
  readonly safeStorage: { setUsePlainTextEncryption(usePlainText: boolean): void };
}

function registerThatNeverListsItsProcesses() {
  let listingAsked = false;
  const electron: StandInElectron = {
    app: {
      getPath: () => "/purosur-pos-e2e-stand-in/user-data",
      getAppMetrics: () => {
        listingAsked = true;
        return [];
      },
    },
    safeStorage: { setUsePlainTextEncryption: () => undefined },
  };
  return {
    evaluate: (inMain: (electron: StandInElectron) => unknown) => {
      listingAsked = false;
      const value = inMain(electron);
      return listingAsked ? new Promise<never>(() => {}) : Promise.resolve(value);
    },
    firstWindow: () => Promise.resolve({ reload: () => Promise.resolve() }),
    close: () => new Promise<void>(() => {}),
    process: () => ({
      exitCode: null,
      signalCode: null,
      once: () => undefined,
      off: () => undefined,
      kill: (signal?: NodeJS.Signals | number) => {
        kills.push(signal);
        return true;
      },
    }),
  };
}

vi.mock("../launch-app", () => ({
  writeChannelFile: () => "/purosur-pos-e2e-stand-in/channel.json",
  launchApp: () =>
    Promise.resolve({ app: registerThatNeverListsItsProcesses(), logs: [`${CORE_READY}\n`] }),
}));

const cloud: StandInCloud = {
  url: "http://127.0.0.1:1",
  enrollmentCode: "ABCD2345EFGH6723",
  feedStored: Promise.resolve(),
  requests: [],
  authorizationRequests: [],
  eventPushes: [],
  dropEveryConnection: () => Promise.resolve(),
  stop: () => Promise.resolve(),
};

describe("an enrolled register whose main process never lists its processes", () => {
  beforeEach(() => {
    kills.length = 0;
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("kills the register and fails naming the listing it waited for when restarted", async () => {
    const register = enrolledRegister(cloud);
    await register.restart();

    const restarting = expect(register.restart()).rejects.toThrow(
      `timed out after ${BOUND_MS} ms waiting for the register to list its processes`,
    );
    await vi.advanceTimersByTimeAsync(2 * BOUND_MS);

    await restarting;
    expect(kills).toEqual(["SIGKILL"]);
  });

  it("restarts without asking again the register it already killed", async () => {
    const register = enrolledRegister(cloud);
    await register.restart();
    const failedRestart = expect(register.restart()).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(2 * BOUND_MS);
    await failedRestart;

    const restarting = register.restart();
    await vi.advanceTimersByTimeAsync(2 * BOUND_MS);

    await expect(restarting).resolves.toBeUndefined();
    expect(kills).toEqual(["SIGKILL"]);
  });
});
