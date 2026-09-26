import { expect, test } from "vitest";
import { renderHook } from "vitest-browser-react";
import { useLatestRef } from "./useLatestRef";

test("keeps the same ref across renders, holding the latest value", async () => {
  const hook = await renderHook((value?: string) => useLatestRef(value ?? "first"));
  const firstRef = hook.result.current;

  await hook.rerender("second");

  expect(hook.result.current).toBe(firstRef);
  expect(firstRef.current).toBe("second");
});
