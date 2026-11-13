import { expect, test } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { DimmedPanel } from "./dimmed-panel";

test("shows its content dimmed", async () => {
  const screen = await render(
    <DimmedPanel>
      <p>Total</p>
    </DimmedPanel>,
  );

  await expect.element(screen.getByText("Total")).toBeVisible();
  const panel = screen.getByText("Total").element().parentElement as HTMLElement;
  expect(getComputedStyle(panel).opacity).toBe("0.65");
});

test("leaves what it holds out of reach of the keyboard and the pointer", async () => {
  const screen = await render(
    <>
      <DimmedPanel>
        <button type="button">Cobrar</button>
      </DimmedPanel>
      <button type="button">Fuera</button>
    </>,
  );

  await userEvent.tab();

  expect(document.activeElement?.textContent).toBe("Fuera");
  expect(screen.getByText("Cobrar").element().closest("[inert]")).not.toBeNull();
});
