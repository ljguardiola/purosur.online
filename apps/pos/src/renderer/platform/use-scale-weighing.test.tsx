import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "vitest-browser-react";
import { deferred } from "./test-support/deferred";
import type { ScaleWeighing } from "./use-scale-weighing";
import { useScaleWeighing } from "./use-scale-weighing";

const WEIGHING: ScaleWeighing = { kind: "weighing" };
const STABLE_120: ScaleWeighing = {
  kind: "stable",
  reading: { weightThousandths: 120, amount: 150_000 },
};
const STABLE_250: ScaleWeighing = {
  kind: "stable",
  reading: { weightThousandths: 250, amount: 312_500 },
};
const ZERO: ScaleWeighing = { kind: "stable", reading: { weightThousandths: 0, amount: 0 } };
const TAKEN: ScaleWeighing = {
  kind: "taken",
  reading: { weightThousandths: 1250, amount: 1_562_500 },
};
const PAUSE_MS = 250;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});

afterEach(() => {
  vi.useRealTimers();
});

async function weighingWith(weigh: (take: boolean) => Promise<ScaleWeighing>) {
  const asking = vi.fn(weigh);
  const rendered = await renderHook(() => useScaleWeighing(asking));
  return { ...rendered, asking };
}

function answering(...answers: ScaleWeighing[]) {
  const pending = [...answers];
  return async (): Promise<ScaleWeighing> => pending.shift() ?? WEIGHING;
}

describe("useScaleWeighing", () => {
  it("asks the scale again after a pause each time it is not stable", async () => {
    const { result, asking } = await weighingWith(async () => WEIGHING);
    await expect.poll(() => asking.mock.calls.length).toBe(1);

    await vi.advanceTimersByTimeAsync(PAUSE_MS - 1);
    expect(asking).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(asking).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(PAUSE_MS);
    expect(asking).toHaveBeenCalledTimes(3);
    expect(result.current.phase).toEqual({ kind: "weighing", last: undefined });
    expect(asking.mock.calls).toEqual([[false], [false], [false]]);
  });

  it("shows each stable reading and keeps asking without taking it", async () => {
    const { result, asking } = await weighingWith(answering(STABLE_120, STABLE_250));

    await expect
      .poll(() => result.current.phase)
      .toEqual({ kind: "stable", reading: { weightThousandths: 120, amount: 150_000 } });
    await vi.advanceTimersByTimeAsync(PAUSE_MS);
    await expect
      .poll(() => result.current.phase)
      .toEqual({ kind: "stable", reading: { weightThousandths: 250, amount: 312_500 } });
    expect(asking.mock.calls).toEqual([[false], [false]]);
  });

  it("keeps the last stable reading while the plate moves", async () => {
    const { result } = await weighingWith(answering(STABLE_120, WEIGHING));

    await vi.advanceTimersByTimeAsync(PAUSE_MS);

    await expect
      .poll(() => result.current.phase)
      .toEqual({ kind: "weighing", last: { weightThousandths: 120, amount: 150_000 } });
  });

  it("keeps the last stable reading across several movement answers", async () => {
    const { result } = await weighingWith(answering(STABLE_120, WEIGHING, WEIGHING));

    await vi.advanceTimersByTimeAsync(PAUSE_MS * 2);

    await expect
      .poll(() => result.current.phase)
      .toEqual({ kind: "weighing", last: { weightThousandths: 120, amount: 150_000 } });
  });

  it("asks to take the weight right away when confirming, then keeps asking to take until it is taken", async () => {
    const { result, asking, act } = await weighingWith(answering(STABLE_250));
    await expect.poll(() => result.current.phase.kind).toBe("stable");

    await act(() => result.current.confirm());

    await expect.poll(() => asking.mock.calls.length).toBe(2);
    expect(asking).toHaveBeenLastCalledWith(true);
    expect(result.current.confirming).toBe(true);
    await vi.advanceTimersByTimeAsync(PAUSE_MS);
    expect(asking).toHaveBeenCalledTimes(3);
    expect(asking).toHaveBeenLastCalledWith(true);
  });

  it("takes the reading the confirmation got and stops asking", async () => {
    const { result, asking, act } = await weighingWith(async (take) => (take ? TAKEN : STABLE_250));
    await expect.poll(() => result.current.phase.kind).toBe("stable");

    await act(() => result.current.confirm());

    await expect.poll(() => result.current.phase).toEqual(TAKEN);
    expect(result.current.confirming).toBe(false);
    const calls = asking.mock.calls.length;
    await vi.advanceTimersByTimeAsync(PAUSE_MS * 4);
    expect(asking).toHaveBeenCalledTimes(calls);
  });

  it("waits for the answer on its way before asking to take", async () => {
    const answer = deferred<ScaleWeighing>();
    const { result, asking, act } = await weighingWith(() => answer.promise);

    await act(() => result.current.confirm());
    expect(asking).toHaveBeenCalledOnce();
    expect(asking).toHaveBeenLastCalledWith(false);
    answer.resolve(STABLE_250);
    await vi.advanceTimersByTimeAsync(PAUSE_MS);

    expect(asking).toHaveBeenCalledTimes(2);
    expect(asking).toHaveBeenLastCalledWith(true);
  });

  it("ignores a second confirmation while confirming", async () => {
    const { result, asking, act } = await weighingWith(answering(STABLE_250));
    await expect.poll(() => result.current.phase.kind).toBe("stable");

    await act(() => result.current.confirm());
    await act(() => result.current.confirm());

    await expect.poll(() => asking.mock.calls.length).toBe(2);
  });

  it("refuses a weight of zero, goes back to asking without taking and says so until a weight shows", async () => {
    const { result, asking, act } = await weighingWith(
      answering(ZERO, { kind: "zero_weight" }, ZERO, STABLE_250),
    );
    await expect.poll(() => result.current.phase.kind).toBe("stable");

    await act(() => result.current.confirm());

    await expect.poll(() => result.current.zeroRefused).toBe(true);
    expect(result.current.confirming).toBe(false);
    await vi.advanceTimersByTimeAsync(PAUSE_MS);
    expect(asking).toHaveBeenLastCalledWith(false);
    expect(result.current.zeroRefused).toBe(true);
    await vi.advanceTimersByTimeAsync(PAUSE_MS);
    await expect.poll(() => result.current.zeroRefused).toBe(false);
  });

  it("does not say a zero was refused before the cashier confirmed", async () => {
    const { result } = await weighingWith(answering(ZERO));

    await expect.poll(() => result.current.phase.kind).toBe("stable");
    expect(result.current.zeroRefused).toBe(false);
  });

  it("forgets the refusal of a zero when confirming again", async () => {
    const { result, act } = await weighingWith(answering(ZERO, { kind: "zero_weight" }));
    await act(() => result.current.confirm());
    await expect.poll(() => result.current.zeroRefused).toBe(true);

    await act(() => result.current.confirm());

    expect(result.current.zeroRefused).toBe(false);
    expect(result.current.confirming).toBe(true);
  });

  it("says the scale is unavailable and stops asking", async () => {
    const { result, asking } = await weighingWith(async () => ({ kind: "scale_unavailable" }));

    await expect.poll(() => result.current.phase).toEqual({ kind: "scale_unavailable" });
    await vi.advanceTimersByTimeAsync(PAUSE_MS * 4);
    expect(asking).toHaveBeenCalledOnce();
  });

  it("says the scale is unavailable when it stops answering after a stable reading", async () => {
    const { result } = await weighingWith(answering(STABLE_250, { kind: "scale_unavailable" }));

    await vi.advanceTimersByTimeAsync(PAUSE_MS);

    await expect.poll(() => result.current.phase).toEqual({ kind: "scale_unavailable" });
  });

  it("stops asking once the cashier chooses to type the weight", async () => {
    const { result, asking, act } = await weighingWith(async () => WEIGHING);
    await expect.poll(() => asking.mock.calls.length).toBe(1);

    await act(() => result.current.typeInstead());
    await vi.advanceTimersByTimeAsync(PAUSE_MS * 4);

    expect(result.current.phase).toEqual({ kind: "typing" });
    expect(asking).toHaveBeenCalledOnce();
  });

  it("starts typing from a stable reading too", async () => {
    const { result, act } = await weighingWith(answering(STABLE_250));
    await expect.poll(() => result.current.phase.kind).toBe("stable");

    await act(() => result.current.typeInstead());

    expect(result.current.phase).toEqual({ kind: "typing" });
  });

  it("keeps typing when a stable reading that is not taken arrives", async () => {
    const answer = deferred<ScaleWeighing>();
    const { result, act } = await weighingWith(() => answer.promise);

    await act(() => result.current.typeInstead());
    answer.resolve(STABLE_250);
    await vi.advanceTimersByTimeAsync(PAUSE_MS * 2);

    expect(result.current.phase).toEqual({ kind: "typing" });
  });

  it("stops asking once it is no longer shown", async () => {
    const { asking, unmount } = await weighingWith(async () => WEIGHING);
    await expect.poll(() => asking.mock.calls.length).toBe(1);

    await unmount();
    await vi.advanceTimersByTimeAsync(PAUSE_MS * 4);

    expect(asking).toHaveBeenCalledOnce();
  });

  it("takes a reading already on its way when the cashier chose to type", async () => {
    const answer = deferred<ScaleWeighing>();
    const { result, act } = await weighingWith(() => answer.promise);

    await act(() => result.current.typeInstead());
    answer.resolve(TAKEN);

    await expect.poll(() => result.current.phase).toEqual(TAKEN);
  });

  it("does the work once the answer on its way was not a taken reading", async () => {
    const answer = deferred<ScaleWeighing>();
    const { result, act } = await weighingWith(() => answer.promise);
    await act(() => result.current.typeInstead());
    const work = vi.fn(async () => "done" as const);

    const doing = result.current.ifNotTaken(work);
    expect(work).not.toHaveBeenCalled();
    answer.resolve(STABLE_250);

    expect(await doing).toBe("done");
    expect(work).toHaveBeenCalledOnce();
  });

  it("does not do the work once the answer on its way took the reading", async () => {
    const answer = deferred<ScaleWeighing>();
    const { result, act } = await weighingWith(() => answer.promise);
    await act(() => result.current.typeInstead());
    const work = vi.fn(async () => "done" as const);

    const doing = result.current.ifNotTaken(work);
    answer.resolve(TAKEN);

    expect(await doing).toBe("taken_by_the_scale");
    expect(work).not.toHaveBeenCalled();
  });

  it("takes a reading that carries only the weight", async () => {
    const reading = { kind: "taken", reading: { weightThousandths: 4400 } } as const;
    const { result } = await renderHook(() => useScaleWeighing(async () => reading));

    await expect.poll(() => result.current.phase).toEqual(reading);
  });

  it("stops asking when the answer says the weighing is closed", async () => {
    const { asking } = await weighingWith(async () => ({ kind: "closed" }));

    await vi.advanceTimersByTimeAsync(PAUSE_MS * 4);

    expect(asking).toHaveBeenCalledOnce();
  });
});
