import { Info } from "lucide-react";
import { type ReactElement, useState } from "react";
import { expect, expectTypeOf, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import type { NoticeTone } from "../shared/tone";
import { FloatingNotification, type FloatingNotificationProps } from "./floating-notification";

const DEFAULT_LIFETIME_MS = 5000;

function notification(
  overrides: Partial<FloatingNotificationProps> & Pick<FloatingNotificationProps, "onDismiss">,
): ReactElement {
  return (
    <FloatingNotification
      tone="success"
      icon={<Info />}
      title="Price saved"
      description="The new price is in force"
      {...overrides}
    />
  );
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

function floatingElement(): HTMLElement {
  const wrapper = Array.from(document.body.children).find((child) =>
    child.querySelector('[role="status"], [role="alert"]'),
  );
  return wrapper as HTMLElement;
}

test("does not accept a notification without a way to dismiss it", () => {
  expectTypeOf<{
    tone: "success";
    icon: FloatingNotificationProps["icon"];
    title: string;
    description: string;
  }>().not.toExtend<FloatingNotificationProps>();
});

test("floats at the bottom-right corner of the page, in a portal on the page body", async () => {
  const screen = await render(notification({ onDismiss: () => {} }));
  const element = floatingElement();
  const style = getComputedStyle(element);
  const rect = element.getBoundingClientRect();

  expect(screen.container.contains(element)).toBe(false);
  expect(element.parentElement).toBe(document.body);
  expect(style.position).toBe("fixed");
  expect(window.innerWidth - rect.right).toBeCloseTo(24, 0);
  expect(window.innerHeight - rect.bottom).toBeCloseTo(24, 0);
});

test("floats above the rest of the page, on the overlay layer", async () => {
  await render(notification({ onDismiss: () => {} }));
  const overlayLayer = getComputedStyle(document.documentElement)
    .getPropertyValue("--z-index-overlay")
    .trim();

  expect(overlayLayer).not.toBe("");
  expect(getComputedStyle(floatingElement()).zIndex).toBe(overlayLayer);
});

test("is 388px wide and lifted off the page by the ink-at-12%-opacity shadow", async () => {
  await render(notification({ onDismiss: () => {} }));
  const element = floatingElement();
  const rect = element.getBoundingClientRect();
  const boxShadow = getComputedStyle(element).boxShadow;
  const inkLayer = boxShadow.split(/,(?![^(]*\))/).find((layer) => layer.includes("26, 26, 26"));

  expect(rect.width).toBeCloseTo(388, 0);
  expect(inkLayer, `no ink shadow layer in: ${boxShadow}`).toBeDefined();
  expect(inkLayer).toMatch(/0px 6px 20px/);
});

test.each(["success", "info", "warning"] as const satisfies readonly NoticeTone[])(
  "dismisses a %s notification after 5 seconds",
  async (tone) => {
    const onDismiss = vi.fn();
    await whileTimersFrozen(async () => {
      await render(notification({ tone, onDismiss }));

      vi.advanceTimersByTime(DEFAULT_LIFETIME_MS - 1);
      expect(onDismiss, "dismissed early").not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });
  },
);

test("never dismisses an error notification by itself", async () => {
  const onDismiss = vi.fn();
  await whileTimersFrozen(async () => {
    await render(notification({ tone: "error", onDismiss }));

    vi.advanceTimersByTime(10 * 60 * 1000);
    expect(onDismiss).not.toHaveBeenCalled();
  });
});

test("dismisses after the seconds it is given, whatever its tone", async () => {
  const onDismiss = vi.fn();
  await whileTimersFrozen(async () => {
    await render(notification({ tone: "error", expiresAfterSeconds: 12, onDismiss }));

    vi.advanceTimersByTime(12_000 - 1);
    expect(onDismiss, "dismissed early").not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

test("its lifetime is the seconds it is given, not the default, for a tone that has one", async () => {
  const onDismiss = vi.fn();
  await whileTimersFrozen(async () => {
    await render(notification({ tone: "success", expiresAfterSeconds: 20, onDismiss }));

    vi.advanceTimersByTime(DEFAULT_LIFETIME_MS);
    expect(onDismiss).not.toHaveBeenCalled();

    vi.advanceTimersByTime(20_000 - DEFAULT_LIFETIME_MS);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

test("keeps counting when its owner re-renders, and dismisses through the latest onDismiss", async () => {
  const first = vi.fn();
  const latest = vi.fn();
  await whileTimersFrozen(async () => {
    const screen = await render(notification({ onDismiss: first }));

    vi.advanceTimersByTime(DEFAULT_LIFETIME_MS - 1000);
    await screen.rerender(notification({ onDismiss: latest }));
    vi.advanceTimersByTime(1000);

    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledTimes(1);
  });
});

test("stays while the pointer is over it, and restarts its full lifetime once the pointer leaves", async () => {
  const onDismiss = vi.fn();
  await whileTimersFrozen(async () => {
    await render(notification({ onDismiss }));
    const element = floatingElement();
    vi.advanceTimersByTime(DEFAULT_LIFETIME_MS - 1000);

    await userEvent.hover(element);
    vi.advanceTimersByTime(60_000);
    expect(onDismiss, "dismissed while hovered").not.toHaveBeenCalled();

    await userEvent.unhover(element);
    vi.advanceTimersByTime(DEFAULT_LIFETIME_MS - 1);
    expect(onDismiss, "did not restart the full lifetime").not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

test("stays while focus is inside it, and restarts its full lifetime once focus leaves", async () => {
  const onDismiss = vi.fn();
  await whileTimersFrozen(async () => {
    await render(
      <>
        <button type="button">Elsewhere</button>
        {notification({ onDismiss })}
      </>,
    );

    await userEvent.tab();
    await userEvent.tab();
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Cerrar");
    vi.advanceTimersByTime(60_000);
    expect(onDismiss, "dismissed while focused").not.toHaveBeenCalled();

    await userEvent.tab({ shift: true });
    vi.advanceTimersByTime(DEFAULT_LIFETIME_MS - 1);
    expect(onDismiss, "did not restart the full lifetime").not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

test("dismisses after the seconds it is given even while the pointer is over it", async () => {
  const onDismiss = vi.fn();
  await whileTimersFrozen(async () => {
    await render(notification({ expiresAfterSeconds: 12, onDismiss }));
    vi.advanceTimersByTime(6000);

    await userEvent.hover(floatingElement());
    vi.advanceTimersByTime(6000 - 1);
    expect(onDismiss, "dismissed early").not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

test("dismisses after the seconds it is given even while focus is inside it", async () => {
  const onDismiss = vi.fn();
  await whileTimersFrozen(async () => {
    await render(
      <>
        <button type="button">Elsewhere</button>
        {notification({ expiresAfterSeconds: 12, onDismiss })}
      </>,
    );
    vi.advanceTimersByTime(6000);

    await userEvent.tab();
    await userEvent.tab();
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Cerrar");
    vi.advanceTimersByTime(6000 - 1);
    expect(onDismiss, "dismissed early").not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

test("dismisses through its close button", async () => {
  const onDismiss = vi.fn();
  const screen = await render(notification({ onDismiss }));

  await screen.getByRole("button", { name: "Cerrar" }).click();

  expect(onDismiss).toHaveBeenCalledTimes(1);
});

function DismissedByItsOwner({
  onDismiss,
  expiresAfterSeconds,
}: {
  onDismiss: () => void;
  expiresAfterSeconds?: number;
}) {
  const [shown, setShown] = useState(true);
  return (
    <>
      <button type="button">Elsewhere</button>
      {shown
        ? notification({
            ...(expiresAfterSeconds === undefined ? {} : { expiresAfterSeconds }),
            onDismiss: () => {
              onDismiss();
              setShown(false);
            },
          })
        : null}
    </>
  );
}

test("closed from the keyboard, gives focus back to where it was before focus entered it", async () => {
  const onDismiss = vi.fn();
  const screen = await render(<DismissedByItsOwner onDismiss={onDismiss} />);
  const elsewhere = screen.getByRole("button", { name: "Elsewhere" }).element();

  await userEvent.tab();
  expect(document.activeElement).toBe(elsewhere);
  await userEvent.tab();
  expect(document.activeElement?.getAttribute("aria-label")).toBe("Cerrar");
  await userEvent.keyboard("{Enter}");

  expect(onDismiss).toHaveBeenCalledTimes(1);
  expect(document.activeElement).toBe(elsewhere);
});

test("leaving on its own while focus is inside, gives focus back to where it was before focus entered it", async () => {
  const onDismiss = vi.fn();
  await whileTimersFrozen(async () => {
    const screen = await render(
      <DismissedByItsOwner expiresAfterSeconds={12} onDismiss={onDismiss} />,
    );
    const elsewhere = screen.getByRole("button", { name: "Elsewhere" }).element();

    await userEvent.tab();
    await userEvent.tab();
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Cerrar");
    vi.advanceTimersByTime(12_000);

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(elsewhere);
  });
});

test("adds no container of its own to what assistive tech reads", async () => {
  await render(notification({ onDismiss: () => {} }));

  expect(floatingElement().getAttribute("role")).toBe("presentation");
});

test("does not take focus when it appears", async () => {
  const screen = await render(<button type="button">Elsewhere</button>);
  const elsewhere = screen.getByRole("button", { name: "Elsewhere" }).element() as HTMLElement;
  elsewhere.focus();

  await screen.rerender(
    <>
      <button type="button">Elsewhere</button>
      {notification({ onDismiss: () => {} })}
    </>,
  );

  expect(floatingElement()).toBeDefined();
  expect(document.activeElement).toBe(elsewhere);
});

test("announces a success notice politely, as a status", async () => {
  const screen = await render(notification({ onDismiss: () => {} }));
  const region = screen.getByRole("status").element();

  await expect.poll(() => region.textContent).toContain("Price saved");
  expect(screen.getByRole("alert").elements()).toEqual([]);
});

test("announces an error notice right away, as an alert", async () => {
  const screen = await render(
    notification({ tone: "error", title: "Could not save", onDismiss: () => {} }),
  );
  const region = screen.getByRole("alert").element();

  await expect.poll(() => region.textContent).toContain("Could not save");
});

test("has no accessibility violations", async () => {
  await render(notification({ onDismiss: () => {} }));

  await expectNoAccessibilityViolations(document.body);
});
