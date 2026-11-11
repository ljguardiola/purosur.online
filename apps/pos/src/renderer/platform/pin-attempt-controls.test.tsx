import { expectNoAccessibilityViolations, insetBoundary } from "@purosur/ui/test";
import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { PinAttemptControls } from "./pin-attempt-controls";
import { usePinAttempt } from "./use-pin-attempt";

function Controls({ submitLabel }: { submitLabel?: string }) {
  const attempt = usePinAttempt({
    id: "u1",
    firstName: "Ada",
    attempt: async () => ({ kind: "wrong_pin", retry_after_seconds: 0, attempts_left: 7 }),
  });
  return (
    <form noValidate onSubmit={attempt.submit}>
      <PinAttemptControls
        attempt={attempt}
        pinInput={attempt.pinInput}
        {...(submitLabel === undefined ? {} : { submitLabel })}
      />
    </form>
  );
}

describe("PinAttemptControls", () => {
  it("shows the PIN as six dots with the digits key, and the submit button with Enter", async () => {
    const screen = await render(<Controls />);

    await expect.element(screen.getByLabelText("PIN")).toBeVisible();
    await expect.element(screen.getByText("0-9", { exact: true })).toBeVisible();
    expect(screen.container.querySelectorAll("[data-pin-slot]")).toHaveLength(6);
    await expect.element(screen.getByRole("button", { name: "Entrar" })).toBeVisible();
    await expect.element(screen.getByText("Enter", { exact: true })).toBeVisible();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("names the submit button as the screen says, with Enter", async () => {
    const screen = await render(<Controls submitLabel="Retomar" />);

    await expect.element(screen.getByRole("button", { name: "Retomar" })).toBeVisible();
    await expect.element(screen.getByText("Enter", { exact: true })).toBeVisible();
  });

  it("marks the PIN as refused and shows the two-line notice after a wrong PIN", async () => {
    const screen = await render(<Controls />);

    await userEvent.type(screen.getByLabelText("PIN"), "1234{Enter}");

    await expect.element(screen.getByText("PIN incorrecto")).toBeVisible();
    await expect.element(screen.getByLabelText("PIN")).toHaveAttribute("aria-invalid", "true");
  });

  it("keeps the error ring on the focused PIN box after a wrong PIN", async () => {
    const screen = await render(<Controls />);

    await userEvent.type(screen.getByLabelText("PIN"), "1234{Enter}");

    const pin = screen.getByLabelText("PIN");
    await expect.element(pin).toHaveAttribute("aria-invalid", "true");
    await expect.element(pin).toHaveFocus();
    const box = pin.element().parentElement as HTMLElement;
    expect(getComputedStyle(box).boxShadow).toContain(insetBoundary("error", "2px"));
  });
});
