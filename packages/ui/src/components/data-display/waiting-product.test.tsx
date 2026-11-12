import { expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { Button } from "../forms/button";
import { WaitingProduct } from "./waiting-product";

const waiting = {
  label: "En espera",
  name: "Aceite de oliva extra virgen 500 ml",
  detail: "$ 9.400,00 / u",
  discardLabel: "Descartar",
  onDiscard: () => {},
};

test("shows the label, the product's name and its detail", async () => {
  const screen = await render(<WaitingProduct {...waiting} />);

  await expect.element(screen.getByText("En espera")).toBeVisible();
  await expect.element(screen.getByText("Aceite de oliva extra virgen 500 ml")).toBeVisible();
  await expect.element(screen.getByText("$ 9.400,00 / u", { exact: false })).toBeVisible();
  await expectNoAccessibilityViolations(screen.container);
});

test("shows the discard button with its Supr key and reports a press", async () => {
  const onDiscard = vi.fn();
  const screen = await render(<WaitingProduct {...waiting} onDiscard={onDiscard} />);
  const button = screen.getByRole("button", { name: "Descartar", exact: true });

  await expect.element(button).toBeVisible();
  expect(button.element().querySelector("kbd")?.textContent).toBe("Supr");
  await button.click();

  expect(onDiscard).toHaveBeenCalledOnce();
});

test("reads the product's name and price as one line", async () => {
  const screen = await render(<WaitingProduct {...waiting} />);

  expect(screen.container.textContent).toContain(
    "Aceite de oliva extra virgen 500 ml · $ 9.400,00 / u",
  );
});

test("shows the text about the other waiting products after the product's line", async () => {
  const screen = await render(<WaitingProduct {...waiting} more="y 2 más" />);

  await expect.element(screen.getByText("y 2 más")).toBeVisible();
  expect(screen.container.textContent).toContain("$ 9.400,00 / u y 2 más");
  await expectNoAccessibilityViolations(screen.container);
});

test("shows nothing about other waiting products when it is given no text", async () => {
  const screen = await render(<WaitingProduct {...waiting} />);

  expect(screen.container.textContent).not.toContain("más");
});

test("draws the discard button at the large size", async () => {
  const screen = await render(
    <>
      <WaitingProduct {...waiting} />
      <Button size="large">Large reference</Button>
    </>,
  );
  const discard = screen.getByRole("button", { name: "Descartar", exact: true }).element();
  const reference = screen.getByRole("button", { name: "Large reference" }).element();

  expect(discard.getBoundingClientRect().height).toBe(reference.getBoundingClientRect().height);
  expect(discard.getBoundingClientRect().height).toBeCloseTo(56, 0);
});
