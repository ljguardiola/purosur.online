import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "vitest-browser-react";
import { useCountdown } from "./use-countdown";

afterEach(() => {
  vi.useRealTimers();
});

describe("useCountdown", () => {
  it("counts down from the seconds it is given, one per second, and stops at zero", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const { result } = await renderHook(useCountdown, { initialProps: { seconds: 3 } });
    await expect.poll(() => result.current).toBe(3);

    await vi.advanceTimersByTimeAsync(1000);
    await expect.poll(() => result.current).toBe(2);

    await vi.advanceTimersByTimeAsync(5000);
    await expect.poll(() => result.current).toBe(0);
  });

  it("is zero when it is given no wait", async () => {
    const { result } = await renderHook(useCountdown, { initialProps: undefined });

    await expect.poll(() => result.current).toBe(0);
  });

  it("starts over when it is given a new wait, even one of the same length", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const { result, rerender } = await renderHook(useCountdown, {
      initialProps: { seconds: 5 } as { seconds: number } | undefined,
    });
    await vi.advanceTimersByTimeAsync(3000);
    await expect.poll(() => result.current).toBe(2);

    await rerender({ seconds: 5 });
    await expect.poll(() => result.current).toBe(5);

    await rerender(undefined);
    await expect.poll(() => result.current).toBe(0);
  });
});
