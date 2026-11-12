import { expect, expectTypeOf, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { tokenRgb } from "../../test/token-colors";
import { QuickAmountButton, type QuickAmountButtonProps } from "./quick-amount-button";

const button = (props: Partial<QuickAmountButtonProps> = {}) => (
  <QuickAmountButton amount="$ 26.000,00" keyName="F7" onPress={() => {}} {...props} />
);

test("is a button named by its amount, with its key left out of the name", async () => {
  const screen = await render(button());

  await expect
    .element(screen.getByRole("button", { name: "$ 26.000,00", exact: true }))
    .toBeVisible();
  expect(screen.container.querySelector("kbd")?.textContent).toBe("F7");
  await expectNoAccessibilityViolations(screen.container);
});

test("names the button with its label before the amount when it has one", async () => {
  const screen = await render(button({ label: "JUSTO", amount: "$ 25.100,00", keyName: "F6" }));

  await expect
    .element(screen.getByRole("button", { name: "JUSTO $ 25.100,00", exact: true }))
    .toBeVisible();
  const label = screen.getByText("JUSTO").element().getBoundingClientRect();
  const amount = screen.getByText("$ 25.100,00").element().getBoundingClientRect();
  expect(label.bottom).toBeLessThanOrEqual(amount.top + 1);
});

test("calls onPress when pressed and from the keyboard", async () => {
  const onPress = vi.fn();
  const screen = await render(button({ onPress }));

  await screen.getByRole("button", { name: "$ 26.000,00" }).click();
  await userEvent.keyboard("{Enter}");

  expect(onPress).toHaveBeenCalledTimes(2);
});

test("puts the amount at the start and the key at the end", async () => {
  const screen = await render(<div style={{ width: 170 }}>{button()}</div>);

  const box = screen.getByRole("button").element().getBoundingClientRect();
  const amount = screen.getByText("$ 26.000,00").element().getBoundingClientRect();
  const key = (screen.container.querySelector("kbd") as HTMLElement).getBoundingClientRect();
  expect(amount.left - box.left).toBeLessThan(16);
  expect(box.right - key.right).toBeLessThan(16);
  expect(key.left).toBeGreaterThan(amount.right);
});

test("shows no key when it has none", async () => {
  const screen = await render(button({ keyName: undefined }));

  expect(screen.container.querySelector("kbd")).toBeNull();
});

test("draws a white button with a border while it is not selected", async () => {
  const screen = await render(button());

  const element = screen.getByRole("button").element();
  const style = getComputedStyle(element);
  expect(element.getAttribute("aria-pressed")).toBe("false");
  expect(style.backgroundColor).toBe(tokenRgb("surface"));
  expect(style.borderTopWidth).toBe("1px");
  expect(style.borderTopColor).toBe(tokenRgb("border"));
});

test("draws a blue button and is announced pressed while it is selected", async () => {
  const screen = await render(button({ selected: true }));

  const element = screen.getByRole("button").element();
  const style = getComputedStyle(element);
  expect(element.getAttribute("aria-pressed")).toBe("true");
  expect(style.backgroundColor).toBe(tokenRgb("action-subtle"));
  expect(style.borderTopColor).toBe(tokenRgb("action"));
  await expectNoAccessibilityViolations(screen.container);
});

test("shows a focus ring when reached by keyboard", async () => {
  const screen = await render(button());

  await userEvent.tab();

  const style = getComputedStyle(screen.getByRole("button").element());
  expect(style.outlineStyle).not.toBe("none");
  expect(style.outlineWidth).not.toBe("0px");
});

test("when disabled, is dimmed, announced disabled and ignores presses", async () => {
  const onPress = vi.fn();
  const screen = await render(button({ disabled: true, onPress }));

  const element = screen.getByRole("button", { name: "$ 26.000,00" });
  await expect.element(element).toBeDisabled();
  expect(Number(getComputedStyle(element.element()).opacity)).toBeLessThan(1);
  await element.click({ force: true });
  expect(onPress).not.toHaveBeenCalled();
});

test("requires an amount and a press handler", () => {
  expectTypeOf<Omit<QuickAmountButtonProps, "amount">>().not.toExtend<QuickAmountButtonProps>();
  expectTypeOf<Omit<QuickAmountButtonProps, "onPress">>().not.toExtend<QuickAmountButtonProps>();
});
