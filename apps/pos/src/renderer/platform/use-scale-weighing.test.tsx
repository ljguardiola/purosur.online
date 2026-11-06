import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "vitest-browser-react";
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
const UNSTEADY_80: ScaleWeighing = {
  kind: "unsteady",
  reading: { weightThousandths: 80, amount: 100_000 },
};
const UNSTEADY_140: ScaleWeighing = {
  kind: "unsteady",
  reading: { weightThousandths: 140, amount: 175_000 },
};
const UNSTEADY_ZERO: ScaleWeighing = {
  kind: "unsteady",
  reading: { weightThousandths: 0, amount: 0 },
};
const OUT_OF_RANGE: ScaleWeighing = { kind: "unsteady_out_of_range" };
const TAKEN: ScaleWeighing = {
  kind: "taken",
  reading: { weightThousandths: 1250, amount: 1_562_500 },
};
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});

afterEach(() => {
  vi.useRealTimers();
});

function bench() {
  const pending: ((answer: ScaleWeighing) => void)[] = [];
  const asked: (number | null)[] = [];
  const weigh = vi.fn((confirmed: number | null) => {
    asked.push(confirmed);
    return new Promise<ScaleWeighing>((resolve) => pending.push(resolve));
  });
  async function answer(...answers: ScaleWeighing[]) {
    for (const each of answers) {
      await expect.poll(() => pending.length).toBeGreaterThan(0);
      (pending.shift() as (answer: ScaleWeighing) => void)(each);
      await vi.advanceTimersByTimeAsync(0);
    }
  }
  return { weigh, asked, answer, outstanding: () => pending.length };
}

async function weighing() {
  const scale = bench();
  const rendered = await renderHook(() => useScaleWeighing(scale.weigh));
  return { ...rendered, ...scale };
}

describe("useScaleWeighing", () => {
  it("asks again right after each answer, with no pause", async () => {
    const { result, asked, answer } = await weighing();
    await expect.poll(() => asked.length).toBe(1);

    await answer(WEIGHING);
    await expect.poll(() => asked.length).toBe(2);
    await answer(WEIGHING);
    await expect.poll(() => asked.length).toBe(3);

    expect(result.current.phase).toEqual({ kind: "weighing", last: undefined });
    expect(asked).toEqual([null, null, null]);
  });

  it("yields to the event loop between answers instead of asking in one burst", async () => {
    let calls = 0;
    const weigh = vi.fn(async (): Promise<ScaleWeighing> => {
      calls += 1;
      return calls > 20 ? new Promise<ScaleWeighing>(() => {}) : WEIGHING;
    });
    await renderHook(() => useScaleWeighing(weigh));

    await new Promise<void>((resolve) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = () => resolve();
      channel.port2.postMessage(null);
    });

    expect(weigh).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(weigh).toHaveBeenCalledTimes(2);
  });

  it("shows each stable reading and keeps asking without taking it", async () => {
    const { result, asked, answer } = await weighing();

    await answer(STABLE_120);
    await expect.poll(() => result.current.phase).toEqual(STABLE_120);
    await answer(STABLE_250);
    await expect.poll(() => result.current.phase).toEqual(STABLE_250);

    await expect.poll(() => asked.length).toBe(3);
    expect(asked).toEqual([null, null, null]);
  });

  it("keeps the last stable reading while the plate moves", async () => {
    const { result, answer } = await weighing();

    await answer(STABLE_120, WEIGHING, WEIGHING);

    await expect
      .poll(() => result.current.phase)
      .toEqual({ kind: "weighing", last: { weightThousandths: 120, amount: 150_000 } });
  });

  it("shows each unsteady reading, moving on to the stable one", async () => {
    const { result, asked, answer } = await weighing();

    await answer(UNSTEADY_80);
    await expect.poll(() => result.current.phase).toEqual(UNSTEADY_80);
    await answer(UNSTEADY_140);
    await expect.poll(() => result.current.phase).toEqual(UNSTEADY_140);
    await answer(STABLE_250);
    await expect.poll(() => result.current.phase).toEqual(STABLE_250);

    await expect.poll(() => asked.length).toBe(4);
    expect(asked).toEqual([null, null, null, null]);
  });

  it("shows an unsteady reading in place of a stable one", async () => {
    const { result, answer } = await weighing();

    await answer(STABLE_250, UNSTEADY_80);

    await expect.poll(() => result.current.phase).toEqual(UNSTEADY_80);
  });

  it("shows weighing with no weight for an unsteady reading out of range", async () => {
    const { result, answer } = await weighing();

    await answer(UNSTEADY_80, OUT_OF_RANGE);
    await expect.poll(() => result.current.phase).toEqual({ kind: "weighing", last: undefined });
    await answer(STABLE_250, OUT_OF_RANGE);

    await expect.poll(() => result.current.phase).toEqual({ kind: "weighing", last: undefined });
  });

  it("confirms no weight while an unsteady reading out of range is shown", async () => {
    const { result, asked, answer, act } = await weighing();
    await answer(STABLE_250, OUT_OF_RANGE);
    await expect.poll(() => result.current.phase).toEqual({ kind: "weighing", last: undefined });

    await act(() => result.current.confirm());
    await answer(OUT_OF_RANGE);

    await expect.poll(() => asked.length).toBe(4);
    expect(asked.at(-1)).toBe(null);
  });

  it("confirms the weight shown right away, then keeps confirming it until it is taken", async () => {
    const { result, asked, answer, act } = await weighing();
    await answer(STABLE_250);
    await expect.poll(() => result.current.phase.kind).toBe("stable");

    await act(() => result.current.confirm());
    await answer(STABLE_250);

    await expect.poll(() => asked.length).toBe(3);
    expect(asked).toEqual([null, null, 250]);
    expect(result.current.confirming).toBe(true);
    await answer(WEIGHING);
    await expect.poll(() => asked.length).toBe(4);
    expect(asked.at(-1)).toBe(250);
  });

  it("confirms the last stable weight shown while the plate moves", async () => {
    const { result, asked, answer, act } = await weighing();
    await answer(STABLE_120, WEIGHING);
    await expect.poll(() => result.current.phase.kind).toBe("weighing");

    await act(() => result.current.confirm());
    await answer(WEIGHING);

    await expect.poll(() => asked.length).toBe(4);
    expect(asked.at(-1)).toBe(120);
  });

  it("keeps confirming the stable weight, never taking an unsteady one, until a stable reading is shown and taken", async () => {
    const { result, asked, answer, act } = await weighing();
    await answer(STABLE_120);
    await expect.poll(() => result.current.phase).toEqual(STABLE_120);
    await act(() => result.current.confirm());

    await answer(UNSTEADY_140);
    await expect.poll(() => result.current.phase).toEqual(UNSTEADY_140);
    expect(result.current.confirming).toBe(true);
    await answer(STABLE_250);
    await expect.poll(() => result.current.phase).toEqual(STABLE_250);
    await answer(TAKEN);

    await expect.poll(() => result.current.phase).toEqual(TAKEN);
    expect(asked.slice(1)).toEqual([null, null, 250]);
    expect(result.current.confirming).toBe(false);
  });

  it("confirms no weight while an unsteady reading is shown, confirming the next stable one once it shows", async () => {
    const { result, asked, answer, act } = await weighing();
    await answer(STABLE_120, UNSTEADY_140);
    await expect.poll(() => result.current.phase).toEqual(UNSTEADY_140);

    await act(() => result.current.confirm());
    await answer(UNSTEADY_140);
    await expect.poll(() => asked.length).toBe(4);
    expect(asked.at(-1)).toBe(null);
    await answer(STABLE_120);

    await expect.poll(() => result.current.phase).toEqual(STABLE_120);
    await expect.poll(() => asked.length).toBe(5);
    expect(asked.at(-1)).toBe(120);
    expect(result.current.confirming).toBe(true);
  });

  it("confirms nothing before a weight is shown, and confirms the first stable weight once it shows", async () => {
    const { result, asked, answer, act } = await weighing();
    await answer(WEIGHING);
    await expect.poll(() => asked.length).toBe(2);

    await act(() => result.current.confirm());
    await answer(STABLE_250);
    await expect.poll(() => result.current.phase).toEqual(STABLE_250);

    await expect.poll(() => asked.length).toBe(3);
    expect(asked).toEqual([null, null, 250]);
    expect(result.current.confirming).toBe(true);
  });

  it("takes the reading the confirmation got and stops asking", async () => {
    const { result, asked, answer, outstanding, act } = await weighing();
    await answer(STABLE_250);
    await expect.poll(() => result.current.phase.kind).toBe("stable");
    await act(() => result.current.confirm());

    await answer(STABLE_250, TAKEN);

    await expect.poll(() => result.current.phase).toEqual(TAKEN);
    expect(result.current.confirming).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(asked).toHaveLength(3);
    expect(outstanding()).toBe(0);
  });

  it("waits for the answer on its way before asking to take", async () => {
    const { result, asked, answer, act } = await weighing();

    await act(() => result.current.confirm());
    expect(asked).toEqual([null]);
    await answer(STABLE_250);

    await expect.poll(() => asked.length).toBe(2);
    expect(asked).toEqual([null, 250]);
  });

  it("ignores a second confirmation while confirming", async () => {
    const { result, asked, answer, act } = await weighing();
    await answer(STABLE_250);
    await expect.poll(() => result.current.phase.kind).toBe("stable");

    await act(() => result.current.confirm());
    await act(() => result.current.confirm());
    await answer(STABLE_250);

    await expect.poll(() => asked.length).toBe(3);
    expect(asked).toEqual([null, null, 250]);
  });

  it("refuses a weight of zero, goes back to asking without taking and says so until a weight shows", async () => {
    const { result, asked, answer, act } = await weighing();
    await answer(ZERO);
    await expect.poll(() => result.current.phase.kind).toBe("stable");

    await act(() => result.current.confirm());
    await answer({ kind: "zero_weight" });

    await expect.poll(() => result.current.zeroRefused).toBe(true);
    expect(result.current.confirming).toBe(false);
    await expect.poll(() => asked.length).toBe(3);
    expect(asked.at(-1)).toBe(null);
    await answer(ZERO);
    expect(result.current.zeroRefused).toBe(true);
    await answer(STABLE_250);
    await expect.poll(() => result.current.zeroRefused).toBe(false);
  });

  it("says a zero was refused until an unsteady weight above zero shows", async () => {
    const { result, answer, act } = await weighing();
    await answer(ZERO);
    await expect.poll(() => result.current.phase.kind).toBe("stable");
    await act(() => result.current.confirm());
    await answer({ kind: "zero_weight" });
    await expect.poll(() => result.current.zeroRefused).toBe(true);

    await answer(UNSTEADY_ZERO);
    await expect.poll(() => result.current.phase).toEqual(UNSTEADY_ZERO);
    expect(result.current.zeroRefused).toBe(true);
    await answer(UNSTEADY_80);

    await expect.poll(() => result.current.zeroRefused).toBe(false);
  });

  it("does not say a zero was refused before the cashier confirmed", async () => {
    const { result, answer } = await weighing();

    await answer(ZERO);

    await expect.poll(() => result.current.phase.kind).toBe("stable");
    expect(result.current.zeroRefused).toBe(false);
  });

  it("forgets the refusal of a zero when confirming again", async () => {
    const { result, answer, act } = await weighing();
    await answer(ZERO);
    await expect.poll(() => result.current.phase.kind).toBe("stable");
    await act(() => result.current.confirm());
    await answer({ kind: "zero_weight" });
    await expect.poll(() => result.current.zeroRefused).toBe(true);

    await act(() => result.current.confirm());

    expect(result.current.zeroRefused).toBe(false);
    expect(result.current.confirming).toBe(true);
  });

  it("says the scale is unavailable and stops asking, without becoming a busy loop", async () => {
    const { result, asked, answer, outstanding } = await weighing();

    await answer({ kind: "scale_unavailable" });

    await expect.poll(() => result.current.phase).toEqual({ kind: "scale_unavailable" });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(asked).toHaveLength(1);
    expect(outstanding()).toBe(0);
  });

  it("says the scale is unavailable when it stops answering after a stable reading", async () => {
    const { result, answer } = await weighing();

    await answer(STABLE_250, { kind: "scale_unavailable" });

    await expect.poll(() => result.current.phase).toEqual({ kind: "scale_unavailable" });
  });

  it("says the scale is unavailable when it stops answering after an unsteady reading", async () => {
    const { result, answer } = await weighing();

    await answer(UNSTEADY_80, { kind: "scale_unavailable" });

    await expect.poll(() => result.current.phase).toEqual({ kind: "scale_unavailable" });
  });

  it("stops asking once the cashier chooses to type the weight", async () => {
    const { result, asked, answer, outstanding, act } = await weighing();
    await expect.poll(() => asked.length).toBe(1);

    await act(() => result.current.typeInstead());
    await answer(WEIGHING);
    await vi.advanceTimersByTimeAsync(1000);

    expect(result.current.phase).toEqual({ kind: "typing" });
    expect(asked).toHaveLength(1);
    expect(outstanding()).toBe(0);
  });

  it("starts typing from an unsteady reading", async () => {
    const { result, answer, act } = await weighing();
    await answer(UNSTEADY_80);
    await expect.poll(() => result.current.phase.kind).toBe("unsteady");

    await act(() => result.current.typeInstead());

    expect(result.current.phase).toEqual({ kind: "typing" });
  });

  it("starts typing from a stable reading too", async () => {
    const { result, answer, act } = await weighing();
    await answer(STABLE_250);
    await expect.poll(() => result.current.phase.kind).toBe("stable");

    await act(() => result.current.typeInstead());

    expect(result.current.phase).toEqual({ kind: "typing" });
  });

  it("stops confirming once the cashier chooses to type the weight", async () => {
    const { result, act } = await weighing();
    await act(() => result.current.confirm());
    expect(result.current.confirming).toBe(true);

    await act(() => result.current.typeInstead());

    expect(result.current.confirming).toBe(false);
  });

  it("keeps typing when a stable reading that is not taken arrives", async () => {
    const { result, answer, act } = await weighing();

    await act(() => result.current.typeInstead());
    await answer(STABLE_250);
    await vi.advanceTimersByTimeAsync(1000);

    expect(result.current.phase).toEqual({ kind: "typing" });
  });

  it("stops asking once it is no longer shown", async () => {
    const { asked, answer, unmount } = await weighing();
    await expect.poll(() => asked.length).toBe(1);

    await unmount();
    await answer(WEIGHING);
    await vi.advanceTimersByTimeAsync(1000);

    expect(asked).toHaveLength(1);
  });

  it("takes a reading already on its way when the cashier chose to type", async () => {
    const { result, answer, act } = await weighing();

    await act(() => result.current.typeInstead());
    await answer(TAKEN);

    await expect.poll(() => result.current.phase).toEqual(TAKEN);
  });

  it("does the work once the answer on its way was not a taken reading", async () => {
    const { result, answer, act } = await weighing();
    await act(() => result.current.typeInstead());
    const work = vi.fn(async () => "done" as const);

    const doing = result.current.ifNotTaken(work);
    expect(work).not.toHaveBeenCalled();
    await answer(STABLE_250);

    expect(await doing).toBe("done");
    expect(work).toHaveBeenCalledOnce();
  });

  it("does not do the work once the answer on its way took the reading", async () => {
    const { result, answer, act } = await weighing();
    await act(() => result.current.typeInstead());
    const work = vi.fn(async () => "done" as const);

    const doing = result.current.ifNotTaken(work);
    await answer(TAKEN);

    expect(await doing).toBe("taken_by_the_scale");
    expect(work).not.toHaveBeenCalled();
  });

  it("takes a reading that carries only the weight", async () => {
    const reading = { kind: "taken", reading: { weightThousandths: 4400 } } as const;
    const { result } = await renderHook(() => useScaleWeighing(async () => reading));

    await expect.poll(() => result.current.phase).toEqual(reading);
  });

  it("keeps asking after the first answer when its effect runs twice, as in StrictMode", async () => {
    const scale = bench();
    await renderHook(() => useScaleWeighing(scale.weigh), { wrapper: StrictMode });
    await expect.poll(() => scale.asked.length).toBeGreaterThan(0);

    await scale.answer(WEIGHING, WEIGHING);
    await expect.poll(() => scale.outstanding()).toBeGreaterThan(0);
    const asked = scale.asked.length;
    await scale.answer(WEIGHING);

    await expect.poll(() => scale.asked.length).toBeGreaterThan(asked);
  });

  it("stops asking when the answer says the weighing is closed", async () => {
    const { asked, answer, outstanding } = await weighing();

    await answer({ kind: "closed" });
    await vi.advanceTimersByTimeAsync(1000);

    expect(asked).toHaveLength(1);
    expect(outstanding()).toBe(0);
  });
});
