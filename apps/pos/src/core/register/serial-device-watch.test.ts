import type { DetectedSerialDevice, RegisteredSerialDevices } from "@purosur/domain";
import { describe, expect, it, vi } from "vitest";
import { createSerialDeviceWatch, type SerialDeviceWatch } from "./serial-device-watch";

const SCALE = { vendorId: "1a86", productId: "7523" };
const READER = { vendorId: "26f1", productId: "8802" };
const STRANGER = { vendorId: "0403", productId: "6001" };
const INTERVAL_MS = 3000;

function standingsOf(watch: SerialDeviceWatch) {
  const reading = watch.reading();
  if (reading.kind !== "listed") {
    throw new Error(`the watch has no current listing: ${JSON.stringify(reading)}`);
  }
  return reading.standings;
}

function setup(initial: {
  registered?: RegisteredSerialDevices;
  detected?: DetectedSerialDevice[];
}) {
  const world = {
    registered: initial.registered ?? { scale: SCALE, reader: READER },
    detected: initial.detected ?? [],
    enumerationFailure: undefined as Error | undefined,
    registrationsFailure: undefined as Error | undefined,
  };
  const pending: { run: () => Promise<void>; delayMs: number; cancelled: boolean }[] = [];
  const onChange = vi.fn();
  const onFailure = vi.fn();
  const watch = createSerialDeviceWatch({
    registrations: {
      registeredSerialDevices: () => {
        if (world.registrationsFailure !== undefined) {
          throw world.registrationsFailure;
        }
        return world.registered;
      },
    },
    enumeration: {
      detectedSerialDevices: async () => {
        if (world.enumerationFailure !== undefined) {
          throw world.enumerationFailure;
        }
        return world.detected;
      },
    },
    intervalMs: INTERVAL_MS,
    scheduleNext: (run, delayMs) => {
      const entry = { run, delayMs, cancelled: false };
      pending.push(entry);
      return () => {
        entry.cancelled = true;
      };
    },
    onChange,
    onFailure,
  });
  const nextCheck = () => pending.filter((entry) => !entry.cancelled).at(-1);
  async function runNextCheck(): Promise<void> {
    const entry = nextCheck();
    if (entry === undefined) {
      throw new Error("no check is scheduled");
    }
    entry.cancelled = true;
    await entry.run();
  }
  return { world, watch, onChange, onFailure, nextCheck, runNextCheck };
}

describe("watching the registered serial devices", () => {
  it("checks as soon as it starts and finds each registered device by its identity", async () => {
    const { watch } = setup({
      detected: [
        { path: "COM4", identity: READER },
        { path: "COM3", identity: SCALE },
      ],
    });

    await watch.start();

    expect(standingsOf(watch)).toEqual({
      scale: { kind: "matching", path: "COM3" },
      reader: { kind: "matching", path: "COM4" },
    });
  });

  it("checks again after the interval", async () => {
    const { watch, nextCheck, world, runNextCheck } = setup({});
    await watch.start();
    expect(nextCheck()?.delayMs).toBe(INTERVAL_MS);

    world.detected = [{ path: "COM3", identity: SCALE }];
    await runNextCheck();

    expect(standingsOf(watch).scale).toEqual({ kind: "matching", path: "COM3" });
    expect(nextCheck()?.delayMs).toBe(INTERVAL_MS);
  });

  it("finds a device again on another path after it was unplugged and plugged back in", async () => {
    const { watch, world, runNextCheck } = setup({
      detected: [{ path: "COM3", identity: SCALE }],
    });
    await watch.start();

    world.detected = [];
    await runNextCheck();
    expect(standingsOf(watch).scale).toEqual({ kind: "not_detected" });

    world.detected = [{ path: "COM9", identity: SCALE }];
    await runNextCheck();
    expect(standingsOf(watch).scale).toEqual({ kind: "matching", path: "COM9" });
  });

  it("tells a registered device apart from an unregistered one that took its place", async () => {
    const { watch, world, runNextCheck } = setup({
      detected: [{ path: "COM3", identity: SCALE }],
    });
    await watch.start();

    world.detected = [{ path: "COM3", identity: STRANGER }];
    await runNextCheck();

    expect(standingsOf(watch).scale).toEqual({ kind: "mismatched" });
  });

  it("knows a role with no registered device is not registered", async () => {
    const { watch } = setup({ registered: { reader: READER } });

    await watch.start();

    expect(standingsOf(watch).scale).toEqual({ kind: "not_registered" });
  });

  it("says something changed only when a standing or a path changes", async () => {
    const { watch, world, onChange, runNextCheck } = setup({
      detected: [{ path: "COM3", identity: SCALE }],
    });
    await watch.start();
    onChange.mockClear();

    await runNextCheck();
    await runNextCheck();
    expect(onChange).not.toHaveBeenCalled();

    world.detected = [{ path: "COM5", identity: SCALE }];
    await runNextCheck();
    expect(onChange).toHaveBeenCalledTimes(1);

    await runNextCheck();
    expect(onChange).toHaveBeenCalledTimes(1);

    world.detected = [];
    await runNextCheck();
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("does not say something changed when its first check finds what was already shown", async () => {
    const { watch, onChange } = setup({ registered: {} });

    await watch.start();

    expect(onChange).not.toHaveBeenCalled();
  });

  it("says something changed when its first check finds a device", async () => {
    const { watch, onChange } = setup({ detected: [{ path: "COM3", identity: SCALE }] });

    await watch.start();

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("says something changed when its first check does not find a registered device", async () => {
    const { watch, onChange } = setup({});

    await watch.start();

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("takes a new registration into account as soon as it is asked to check", async () => {
    const { watch, world, onChange } = setup({
      registered: {},
      detected: [{ path: "COM3", identity: SCALE }],
    });
    await watch.start();
    expect(standingsOf(watch).scale).toEqual({ kind: "not_registered" });
    onChange.mockClear();

    world.registered = { scale: SCALE };
    await watch.checkNow();

    expect(standingsOf(watch).scale).toEqual({ kind: "matching", path: "COM3" });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("replaces the check it had planned when it is asked to check now", async () => {
    const { watch, nextCheck } = setup({});
    await watch.start();
    const planned = nextCheck();

    await watch.checkNow();

    expect(nextCheck()).not.toBe(planned);
    expect(planned).toMatchObject({ cancelled: true });
  });

  it("checks again once the check it is in the middle of ends when asked meanwhile", async () => {
    const world = { detected: [] as DetectedSerialDevice[] };
    const release: (() => void)[] = [];
    let listings = 0;
    const watch = createSerialDeviceWatch({
      registrations: { registeredSerialDevices: () => ({ scale: SCALE }) },
      enumeration: {
        detectedSerialDevices: () => {
          listings += 1;
          const snapshot = world.detected;
          return new Promise((resolve) => release.push(() => resolve(snapshot)));
        },
      },
      intervalMs: INTERVAL_MS,
      scheduleNext: () => () => undefined,
      onChange: () => undefined,
      onFailure: () => undefined,
    });

    const first = watch.start();
    const second = watch.checkNow();
    expect(listings).toBe(1);

    world.detected = [{ path: "COM3", identity: SCALE }];
    release[0]?.();
    await vi.waitFor(() => expect(listings).toBe(2));
    release[1]?.();
    await Promise.all([first, second]);

    expect(standingsOf(watch).scale).toEqual({ kind: "matching", path: "COM3" });
  });

  it("reads the registered devices as unknown, without waiting, while its first listing has not ended", async () => {
    const watch = createSerialDeviceWatch({
      registrations: { registeredSerialDevices: () => ({ scale: SCALE }) },
      enumeration: { detectedSerialDevices: () => new Promise(() => undefined) },
      intervalMs: INTERVAL_MS,
      scheduleNext: () => () => undefined,
      onChange: () => undefined,
      onFailure: () => undefined,
    });

    void watch.start();

    expect(watch.reading()).toEqual({ kind: "unknown", registered: { scale: SCALE } });
  });

  it("reads the registered devices as unknown when its first listing fails", async () => {
    const { watch, world, onFailure } = setup({});
    const failure = new Error("the ports could not be listed");
    world.enumerationFailure = failure;

    await watch.start();

    expect(onFailure).toHaveBeenCalledExactlyOnceWith(failure);
    expect(watch.reading()).toEqual({
      kind: "unknown",
      registered: { scale: SCALE, reader: READER },
    });
  });

  it("reads the devices as unknown while its last listing failed, says so, and goes on checking", async () => {
    const { watch, world, onFailure, onChange, nextCheck, runNextCheck } = setup({
      detected: [{ path: "COM3", identity: SCALE }],
    });
    await watch.start();
    onChange.mockClear();
    const failure = new Error("the ports could not be listed");

    world.enumerationFailure = failure;
    await runNextCheck();
    expect(onFailure).toHaveBeenCalledWith(failure);
    expect(watch.reading()).toEqual({
      kind: "unknown",
      registered: { scale: SCALE, reader: READER },
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(nextCheck()?.delayMs).toBe(INTERVAL_MS);

    world.enumerationFailure = undefined;
    world.detected = [{ path: "COM8", identity: SCALE }];
    await runNextCheck();
    expect(standingsOf(watch).scale).toEqual({ kind: "matching", path: "COM8" });
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("does not say something changed when a listing fails while nothing is registered", async () => {
    const { watch, world, onChange, runNextCheck } = setup({ registered: {} });
    await watch.start();

    world.enumerationFailure = new Error("the ports could not be listed");
    await runNextCheck();

    expect(onChange).not.toHaveBeenCalled();
  });

  it("reports a failure that goes on only once, and reports it again after a check works", async () => {
    const { watch, world, onFailure, runNextCheck } = setup({});
    await watch.start();

    world.enumerationFailure = new Error("the ports could not be listed");
    await runNextCheck();
    await runNextCheck();
    expect(onFailure).toHaveBeenCalledTimes(1);

    world.enumerationFailure = undefined;
    await runNextCheck();
    world.enumerationFailure = new Error("the ports could not be listed again");
    await runNextCheck();
    expect(onFailure).toHaveBeenCalledTimes(2);
  });

  it("reports a registrations read that fails once, reads every role as unknown, and goes on checking", async () => {
    const { watch, world, onFailure, onChange, nextCheck, runNextCheck } = setup({
      detected: [{ path: "COM3", identity: SCALE }],
    });
    await watch.start();
    onChange.mockClear();
    const failure = new Error("the registrations could not be read");

    world.registrationsFailure = failure;
    await runNextCheck();
    await runNextCheck();
    expect(onFailure).toHaveBeenCalledExactlyOnceWith(failure);
    expect(watch.reading()).toEqual({ kind: "unreadable" });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(nextCheck()?.delayMs).toBe(INTERVAL_MS);

    world.registrationsFailure = undefined;
    world.detected = [{ path: "COM8", identity: SCALE }];
    await watch.checkNow();
    expect(standingsOf(watch).scale).toEqual({ kind: "matching", path: "COM8" });
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("reads every role as unknown, without throwing, while neither a listing nor the registrations could be read", async () => {
    const { watch, world, onFailure } = setup({});
    world.registrationsFailure = new Error("the registrations could not be read");
    world.enumerationFailure = new Error("the ports could not be listed");

    await watch.start();

    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(watch.reading()).toEqual({ kind: "unreadable" });
  });
});
