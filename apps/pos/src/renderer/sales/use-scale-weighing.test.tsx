import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "vitest-browser-react";
import { deferred } from "./test-support/sale-screen";
import type { ScaleWeighing } from "./use-scale-weighing";
import { useScaleWeighing } from "./use-scale-weighing";

const WEIGHING: ScaleWeighing = { kind: "weighing" };
const TAKEN: ScaleWeighing = { kind: "taken", weightThousandths: 1250, amount: 1_562_500 };
const PAUSE_MS = 250;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});

afterEach(() => {
  vi.useRealTimers();
});

async function weighingWith(weigh: () => Promise<ScaleWeighing>) {
  const asking = vi.fn(weigh);
  const rendered = await renderHook(() => useScaleWeighing(asking));
  return { ...rendered, asking };
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
    expect(result.current.phase).toEqual({ kind: "weighing" });
  });

  it("takes the stable reading and stops asking", async () => {
    const { result, asking } = await weighingWith(async () => TAKEN);

    await expect.poll(() => result.current.phase).toEqual(TAKEN);
    await vi.advanceTimersByTimeAsync(PAUSE_MS * 4);
    expect(asking).toHaveBeenCalledOnce();
  });

  it("says the scale is unavailable and stops asking", async () => {
    const { result, asking } = await weighingWith(async () => ({ kind: "scale_unavailable" }));

    await expect.poll(() => result.current.phase).toEqual({ kind: "scale_unavailable" });
    await vi.advanceTimersByTimeAsync(PAUSE_MS * 4);
    expect(asking).toHaveBeenCalledOnce();
  });

  it("stops asking once the cashier chooses to type the weight", async () => {
    const { result, asking, act } = await weighingWith(async () => WEIGHING);
    await expect.poll(() => asking.mock.calls.length).toBe(1);

    await act(() => result.current.typeInstead());
    await vi.advanceTimersByTimeAsync(PAUSE_MS * 4);

    expect(result.current.phase).toEqual({ kind: "typing" });
    expect(asking).toHaveBeenCalledOnce();
  });

  it("stops asking once it is no longer shown", async () => {
    const { asking, unmount } = await weighingWith(async () => WEIGHING);
    await expect.poll(() => asking.mock.calls.length).toBe(1);

    await unmount();
    await vi.advanceTimersByTimeAsync(PAUSE_MS * 4);

    expect(asking).toHaveBeenCalledOnce();
  });

  it("takes a stable reading already on its way when the cashier chose to type", async () => {
    const answer = deferred<ScaleWeighing>();
    const { result, act } = await weighingWith(() => answer.promise);

    await act(() => result.current.typeInstead());
    answer.resolve(TAKEN);

    await expect.poll(() => result.current.phase).toEqual(TAKEN);
  });

  it("does the work once the answer on its way was not a reading", async () => {
    const answer = deferred<ScaleWeighing>();
    const { result, act } = await weighingWith(() => answer.promise);
    await act(() => result.current.typeInstead());
    const work = vi.fn(async () => "done" as const);

    const doing = result.current.ifNotTaken(work);
    expect(work).not.toHaveBeenCalled();
    answer.resolve(WEIGHING);

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
});
