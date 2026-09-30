import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { useId, useState } from "react";
import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { PinField } from "./pin-field";

function Harness({
  disabled = false,
  explained = false,
  initial = "",
}: {
  disabled?: boolean;
  explained?: boolean;
  initial?: string;
}) {
  const [value, setValue] = useState(initial);
  const explanationId = useId();
  return (
    <>
      {explained ? <p id={explanationId}>Revisá el PIN</p> : null}
      <PinField
        value={value}
        onChange={setValue}
        disabled={disabled}
        {...(explained ? { errorMessageId: explanationId } : {})}
      />
    </>
  );
}

function dots(screen: Awaited<ReturnType<typeof render>>) {
  const all = [...screen.container.querySelectorAll("[data-pin-slot]")];
  return {
    total: all.length,
    filled: all.filter((dot) => dot.getAttribute("data-pin-slot") === "filled").length,
  };
}

describe("PinField", () => {
  it("shows six empty slots before anything is typed", async () => {
    const screen = await render(<Harness />);

    expect(dots(screen)).toEqual({ total: 6, filled: 0 });
    await expect.element(screen.getByLabelText("PIN")).toBeVisible();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("fills a slot for each digit typed", async () => {
    const screen = await render(<Harness />);

    await userEvent.type(screen.getByLabelText("PIN"), "123");

    expect(dots(screen)).toEqual({ total: 6, filled: 3 });
  });

  it("grows past six slots when more digits are typed", async () => {
    const screen = await render(<Harness />);

    await userEvent.type(screen.getByLabelText("PIN"), "12345678");

    expect(dots(screen)).toEqual({ total: 8, filled: 8 });
  });

  it("goes back to six slots when digits are erased", async () => {
    const screen = await render(<Harness initial="12345678" />);

    await userEvent.type(screen.getByLabelText("PIN"), "{Backspace}{Backspace}{Backspace}");

    expect(dots(screen)).toEqual({ total: 6, filled: 5 });
  });

  it("accepts digits only", async () => {
    const screen = await render(<Harness />);

    await userEvent.type(screen.getByLabelText("PIN"), "1a2 b-3");

    expect(dots(screen)).toEqual({ total: 6, filled: 3 });
    await expect.element(screen.getByLabelText("PIN")).toHaveValue("123");
  });

  it("hides what is typed and asks for the numeric keyboard, without autofill", async () => {
    const screen = await render(<Harness />);

    const input = screen.getByLabelText("PIN");

    await expect.element(input).toHaveAttribute("type", "password");
    await expect.element(input).toHaveAttribute("inputmode", "numeric");
    await expect.element(input).toHaveAttribute("autocomplete", "off");
  });

  it("cannot be typed into while disabled", async () => {
    const screen = await render(<Harness disabled />);

    await expect.element(screen.getByLabelText("PIN")).toBeDisabled();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("is linked to the message that explains why it is invalid", async () => {
    const screen = await render(<Harness explained />);

    const input = screen.getByLabelText("PIN");

    await expect.element(input).toHaveAttribute("aria-invalid", "true");
    await expect.element(input).toHaveAccessibleDescription("Revisá el PIN");
    await expectNoAccessibilityViolations(screen.container);
  });

  it("is not marked invalid without a message", async () => {
    const screen = await render(<Harness />);

    await expect.element(screen.getByLabelText("PIN")).not.toHaveAttribute("aria-invalid", "true");
  });
});
