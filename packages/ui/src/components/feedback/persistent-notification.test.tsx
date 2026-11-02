import { Info } from "lucide-react";
import { expect, expectTypeOf, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { FloatingNotification } from "./floating-notification";
import {
  PersistentNotification,
  type PersistentNotificationProps,
} from "./persistent-notification";

function notification(onPress: () => void = () => {}) {
  return (
    <PersistentNotification
      tone="info"
      icon={<Info />}
      title="New version"
      description="Reload to use it"
      action={{ label: "Reload", onPress }}
    />
  );
}

test("does not accept a notification without an action", () => {
  expectTypeOf<{
    tone: "info";
    icon: PersistentNotificationProps["icon"];
    title: string;
    description: string;
  }>().not.toExtend<PersistentNotificationProps>();
});

test("shows its text and floats at the top centre of the page in a portal on the page body", async () => {
  const screen = await render(notification());
  const card = screen.getByText("New version").element();
  const floating = Array.from(document.body.children).find((child) => child.contains(card));
  const rect = (floating as HTMLElement).getBoundingClientRect();

  await expect.element(screen.getByText("Reload to use it")).toBeVisible();
  expect(screen.container.contains(card)).toBe(false);
  expect(getComputedStyle(floating as HTMLElement).position).toBe("fixed");
  expect(rect.top).toBeCloseTo(24, 0);
  expect(rect.left + rect.width / 2).toBeCloseTo(window.innerWidth / 2, 0);
});

test("stays reachable while a notification that never expires is shown", async () => {
  const onPress = vi.fn();
  const screen = await render(
    <>
      {notification(onPress)}
      <FloatingNotification
        tone="error"
        icon={<Info />}
        title="Could not save"
        description="Try again"
        whatToDo="Check the connection"
        onDismiss={() => {}}
      />
    </>,
  );
  const reload = screen.getByRole("button", { name: "Reload" }).element();
  const rect = reload.getBoundingClientRect();

  const reached = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);

  expect(reload.contains(reached)).toBe(true);
});

test("shows only its title and action when it has no description", async () => {
  const screen = await render(
    <PersistentNotification
      tone="info"
      icon={<Info />}
      title="New version"
      action={{ label: "Reload", onPress: () => {} }}
    />,
  );

  await expect.element(screen.getByRole("button", { name: "Reload" })).toBeVisible();
  const action = screen.getByRole("button", { name: "Reload" }).element();
  const floating = Array.from(document.body.children).find((child) => child.contains(action));
  expect(floating?.querySelectorAll("p")).toHaveLength(1);
});

test("runs its action when the action button is pressed", async () => {
  const onPress = vi.fn();
  const screen = await render(notification(onPress));

  await userEvent.click(screen.getByRole("button", { name: "Reload" }));

  expect(onPress).toHaveBeenCalledTimes(1);
});

test("offers no way to close it", async () => {
  const screen = await render(notification());

  await expect.element(screen.getByRole("button", { name: "Reload" })).toBeVisible();
  expect(screen.getByRole("button").elements()).toHaveLength(1);
});

test("stays on the page however long it is left", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  try {
    const screen = await render(notification());

    vi.advanceTimersByTime(24 * 60 * 60 * 1000);

    await expect.element(screen.getByText("New version")).toBeVisible();
  } finally {
    vi.runAllTimers();
    vi.useRealTimers();
  }
});

test("has no accessibility violations", async () => {
  await render(notification());

  await expectNoAccessibilityViolations(document.body);
});
