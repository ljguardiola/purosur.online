import { TriangleAlert, Undo2 } from "lucide-react";
import { type ReactElement, useState } from "react";
import { expect, expectTypeOf, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import type { NoticeTone } from "../shared/tone";
import { Toast, type ToastProps } from "./toast";

const DEFAULT_LIFETIME_MS = 5000;

function toast(overrides: Partial<ToastProps> & Pick<ToastProps, "onDismiss">): ReactElement {
  return (
    <Toast
      tone="success"
      icon={<Undo2 />}
      title="Payment turned into a refund"
      description="It is confirmed later in the back office."
      {...overrides}
    />
  );
}

function ToastUntilDismissed() {
  const [shown, setShown] = useState(true);
  return shown ? toast({ onDismiss: () => setShown(false) }) : <p>Nothing left</p>;
}

async function whileTimersFrozen(steps: () => Promise<void>): Promise<void> {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  try {
    await steps();
  } finally {
    vi.runAllTimers();
    vi.useRealTimers();
  }
}

test("does not accept a toast without a way to dismiss it", () => {
  expectTypeOf<{
    tone: "success";
    icon: ToastProps["icon"];
    title: string;
    description: string;
  }>().not.toExtend<ToastProps>();
});

test("shows its title and its description", async () => {
  const screen = await render(toast({ onDismiss: () => {} }));

  await expect.element(screen.getByText("Payment turned into a refund")).toBeVisible();
  await expect.element(screen.getByText("It is confirmed later in the back office.")).toBeVisible();
});

test("offers no button of its own, so it never takes a key from the screen", async () => {
  const screen = await render(toast({ onDismiss: () => {} }));

  expect(screen.getByRole("button").elements()).toEqual([]);
});

test("renders where its screen places it, not in a portal of its own", async () => {
  const screen = await render(toast({ onDismiss: () => {} }));

  expect(screen.container.textContent).toContain("Payment turned into a refund");
});

test.each(["success", "info", "warning"] as const satisfies readonly NoticeTone[])(
  "dismisses a %s toast by itself after five seconds",
  async (tone) => {
    await whileTimersFrozen(async () => {
      const onDismiss = vi.fn();
      await render(toast({ tone, onDismiss }));

      vi.advanceTimersByTime(DEFAULT_LIFETIME_MS - 1);
      expect(onDismiss).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(onDismiss).toHaveBeenCalledOnce();
    });
  },
);

test("never dismisses an error toast by itself", async () => {
  await whileTimersFrozen(async () => {
    const onDismiss = vi.fn();
    await render(toast({ tone: "error", icon: <TriangleAlert />, onDismiss }));

    vi.advanceTimersByTime(DEFAULT_LIFETIME_MS * 10);
    expect(onDismiss).not.toHaveBeenCalled();
  });
});

test("keeps counting when its owner re-renders, and dismisses through the latest onDismiss", async () => {
  await whileTimersFrozen(async () => {
    const first = vi.fn();
    const latest = vi.fn();
    const screen = await render(toast({ onDismiss: first }));

    vi.advanceTimersByTime(DEFAULT_LIFETIME_MS / 2);
    await screen.rerender(toast({ onDismiss: latest }));
    vi.advanceTimersByTime(DEFAULT_LIFETIME_MS / 2);

    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledOnce();
  });
});

test("announces a success toast politely, as a status", async () => {
  const screen = await render(toast({ onDismiss: () => {} }));

  await expect
    .element(screen.getByRole("status"))
    .toHaveTextContent("Payment turned into a refund It is confirmed later in the back office.");
  expect(screen.getByRole("alert").elements()).toEqual([]);
});

test("announces an error toast right away, as an alert", async () => {
  const screen = await render(
    toast({ tone: "error", icon: <TriangleAlert />, onDismiss: () => {} }),
  );

  await expect
    .element(screen.getByRole("alert"))
    .toHaveTextContent("Payment turned into a refund It is confirmed later in the back office.");
});

test("is gone once its screen stops showing it", async () => {
  await whileTimersFrozen(async () => {
    const screen = await render(<ToastUntilDismissed />);

    vi.advanceTimersByTime(DEFAULT_LIFETIME_MS);

    await expect.element(screen.getByText("Nothing left")).toBeVisible();
    expect(screen.getByText("Payment turned into a refund").elements()).toEqual([]);
  });
});

test("has no accessibility violations", async () => {
  const screen = await render(toast({ onDismiss: () => {} }));

  await expectNoAccessibilityViolations(screen.container);
});
