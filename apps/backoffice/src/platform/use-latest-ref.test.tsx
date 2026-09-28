import { useEffect, useLayoutEffect } from "react";
import { expect, test } from "vitest";
import { render, renderHook } from "vitest-browser-react";
import { useLatestRef } from "./use-latest-ref";

test("keeps the same ref across renders, holding the latest value", async () => {
  const hook = await renderHook((value?: string) => useLatestRef(value ?? "first"));
  const firstRef = hook.result.current;

  await hook.rerender("second");

  expect(hook.result.current).toBe(firstRef);
  expect(firstRef.current).toBe("second");
});

function Child({
  latestRef,
  renderCount,
  onLayoutEffect,
  onEffect,
}: {
  latestRef: { current: string };
  renderCount: number;
  onLayoutEffect: (value: string) => void;
  onEffect: (value: string) => void;
}) {
  useLayoutEffect(() => {
    onLayoutEffect(latestRef.current);
  });
  useEffect(() => {
    onEffect(latestRef.current);
  });
  return <span>{renderCount}</span>;
}

function Harness(props: {
  value: string;
  renderCount: number;
  onLayoutEffect: (value: string) => void;
  onEffect: (value: string) => void;
}) {
  const latestRef = useLatestRef(props.value);
  return (
    <Child
      latestRef={latestRef}
      renderCount={props.renderCount}
      onLayoutEffect={props.onLayoutEffect}
      onEffect={props.onEffect}
    />
  );
}

// A child's layout effect runs before its parent's, so if the parent wrote the latest value with
// its own useLayoutEffect the child would still observe the previous render's value there. This
// pins the ordering useLatestRef must keep regardless of how it schedules the write.
test("a child's layout and passive effects read the latest value after the parent re-renders", async () => {
  const layoutValues: string[] = [];
  const effectValues: string[] = [];
  const props = {
    onLayoutEffect: (value: string) => layoutValues.push(value),
    onEffect: (value: string) => effectValues.push(value),
  };

  const screen = await render(<Harness value="first" renderCount={0} {...props} />);
  await screen.rerender(<Harness value="second" renderCount={1} {...props} />);

  expect(layoutValues.at(-1)).toBe("second");
  expect(effectValues.at(-1)).toBe("second");
});
