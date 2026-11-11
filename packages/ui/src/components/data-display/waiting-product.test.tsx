import { expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
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
