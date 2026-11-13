import { useId, useState } from "react";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { insetBoundary, tokenRgb } from "../../test/token-colors";
import { PinDotsField, type PinDotsFieldProps } from "./pin-dots-field";

function Harness({
  initial = "",
  onChange = () => {},
  ...rest
}: { initial?: string } & Partial<Omit<PinDotsFieldProps, "value">>) {
  const [value, setValue] = useState(initial);
  return (
    <PinDotsField
      label="PIN"
      {...rest}
      value={value}
      onChange={(digits) => {
        setValue(digits);
        onChange(digits);
      }}
    />
  );
}

function dots(container: Element, state: "filled" | "empty"): Element[] {
  return Array.from(container.querySelectorAll(`[data-pin-slot="${state}"]`));
}

test("names the password input with the label the app passes", async () => {
  const screen = await render(<Harness label="Código" />);

  const input = screen.getByLabelText("Código", { exact: true }).element();
  expect(input).toBeInstanceOf(HTMLInputElement);
  expect((input as HTMLInputElement).type).toBe("password");
  expect((input as HTMLInputElement).inputMode).toBe("numeric");
  expect((input as HTMLInputElement).autocomplete).toBe("off");
});

test("shows the label text and the 0-9 keycap above the box", async () => {
  const screen = await render(<Harness />);

  await expect.element(screen.getByText("PIN", { exact: true })).toBeVisible();
  const keycap = screen.container.querySelector("kbd") as HTMLElement;
  expect(keycap.textContent).toBe("0-9");
  const label = screen.getByText("PIN", { exact: true }).element() as HTMLElement;
  expect(keycap.getBoundingClientRect().left).toBeGreaterThan(label.getBoundingClientRect().right);
});

test("draws six empty dots when nothing is typed", async () => {
  const screen = await render(<Harness />);

  expect(dots(screen.container, "empty")).toHaveLength(6);
  expect(dots(screen.container, "filled")).toHaveLength(0);
});

test("fills one dark dot per typed digit and keeps the rest pale", async () => {
  const screen = await render(<Harness initial="1234" />);

  const filled = dots(screen.container, "filled");
  const empty = dots(screen.container, "empty");
  expect(filled).toHaveLength(4);
  expect(empty).toHaveLength(2);
  expect(getComputedStyle(filled[0] as Element).backgroundColor).toBe(tokenRgb("surface-inverse"));
  expect(getComputedStyle(empty[0] as Element).backgroundColor).toBe(tokenRgb("border"));
});

test("adds a dot for each digit beyond six", async () => {
  const screen = await render(<Harness initial="12345678" />);

  expect(dots(screen.container, "filled")).toHaveLength(8);
  expect(dots(screen.container, "empty")).toHaveLength(0);
});

test("reports only the digits that were typed", async () => {
  const onChange = vi.fn();
  const screen = await render(<Harness onChange={onChange} />);

  await userEvent.type(screen.getByLabelText("PIN", { exact: true }), "1a2-3");

  expect(onChange).toHaveBeenLastCalledWith("123");
  expect(dots(screen.container, "filled")).toHaveLength(3);
});

test("covers the box with the input so a click anywhere in it focuses the input", async () => {
  const screen = await render(<Harness />);
  const input = screen.getByLabelText("PIN", { exact: true }).element() as HTMLElement;
  const box = input.parentElement as HTMLElement;

  expect(input.getBoundingClientRect().width).toBe(box.getBoundingClientRect().width);
  expect(input.getBoundingClientRect().height).toBe(box.getBoundingClientRect().height);
  expect(box.getBoundingClientRect().height).toBe(64);
});

function FieldWithMessageElsewhere({ errorRingWhileFocused }: { errorRingWhileFocused?: boolean }) {
  const messageId = useId();
  return (
    <>
      <Harness errorMessageId={messageId} errorRingWhileFocused={errorRingWhileFocused} />
      <p id={messageId}>PIN incorrecto</p>
    </>
  );
}

test("marks the input invalid and described by the error message", async () => {
  const screen = await render(<FieldWithMessageElsewhere />);

  const input = screen.getByLabelText("PIN", { exact: true });
  expect(input.element().getAttribute("aria-invalid")).toBe("true");
  await expect.element(input).toHaveAccessibleDescription("PIN incorrecto");
  await expectNoAccessibilityViolations(screen.container);
});

test("shows the action ring while an invalid field is focused", async () => {
  const screen = await render(<FieldWithMessageElsewhere />);

  const input = screen.getByLabelText("PIN", { exact: true });
  await userEvent.click(input);

  await expect.element(input).toHaveFocus();
  const box = input.element().parentElement as HTMLElement;
  expect(getComputedStyle(box).boxShadow).toContain(insetBoundary("action", "2px"));
});

test("keeps the error ring while an invalid field that asks for it is focused", async () => {
  const screen = await render(<FieldWithMessageElsewhere errorRingWhileFocused />);

  const input = screen.getByLabelText("PIN", { exact: true });
  await userEvent.click(input);

  await expect.element(input).toHaveFocus();
  const box = input.element().parentElement as HTMLElement;
  expect(getComputedStyle(box).boxShadow).toContain(insetBoundary("error", "2px"));
});

test("shows the action ring while a valid field that asks for the error ring is focused", async () => {
  const screen = await render(<Harness errorRingWhileFocused />);

  const input = screen.getByLabelText("PIN", { exact: true });
  await userEvent.click(input);

  const box = input.element().parentElement as HTMLElement;
  expect(getComputedStyle(box).boxShadow).toContain(insetBoundary("action", "2px"));
});

test("shows the action ring while a valid field is focused", async () => {
  const screen = await render(<Harness />);

  const input = screen.getByLabelText("PIN", { exact: true });
  await userEvent.click(input);

  const box = input.element().parentElement as HTMLElement;
  expect(getComputedStyle(box).boxShadow).toContain(insetBoundary("action", "2px"));
});

test("is not invalid without an error message", async () => {
  const screen = await render(<Harness />);

  const input = screen.getByLabelText("PIN", { exact: true }).element();
  expect(input.hasAttribute("aria-invalid")).toBe(false);
  expect(input.hasAttribute("aria-describedby")).toBe(false);
});

test("disables the input", async () => {
  const screen = await render(<Harness disabled />);

  expect(
    (screen.getByLabelText("PIN", { exact: true }).element() as HTMLInputElement).disabled,
  ).toBe(true);
});

test("hands the input to the ref it receives", async () => {
  let input: HTMLInputElement | null = null;
  await render(
    <Harness
      ref={(element) => {
        input = element;
      }}
    />,
  );

  expect(input).toBeInstanceOf(HTMLInputElement);
});

test("focuses the input on mount when asked to", async () => {
  const screen = await render(<Harness autoFocus />);

  expect(document.activeElement).toBe(screen.getByLabelText("PIN", { exact: true }).element());
});

test("shows no 0-9 keycap when it is asked to leave it out", async () => {
  const screen = await render(<Harness digitsKeycap={false} />);

  expect(screen.container.querySelector("kbd")).toBeNull();
  await expect.element(screen.getByText("PIN", { exact: true })).toBeVisible();
  await expectNoAccessibilityViolations(screen.container);
});
