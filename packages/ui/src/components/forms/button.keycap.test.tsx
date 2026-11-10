import { Banknote } from "lucide-react";
import { expect, expectTypeOf, test } from "vitest";
import { render } from "vitest-browser-react";
import { colorAlpha } from "../../test/color-alpha";
import { tokenRgb } from "../../test/token-colors";
import type { KeyName } from "../data-display/keycap";
import { Button, type ButtonProps } from "./button";

test("shows the key at the button's trailing end, after its label", async () => {
  const screen = await render(
    <Button fullWidth size="large" keycap="F12">
      Cobrar en efectivo
    </Button>,
  );

  const button = screen.getByRole("button").element() as HTMLElement;
  const label = screen.getByText("Cobrar en efectivo").element();
  const keycap = button.querySelector("kbd") as HTMLElement;
  expect(keycap.textContent).toBe("F12");
  expect(keycap.getBoundingClientRect().left).toBeGreaterThan(label.getBoundingClientRect().right);
  expect(button.getBoundingClientRect().right - keycap.getBoundingClientRect().right).toBe(16);
});

test("places the key after a primary button's icon", async () => {
  const screen = await render(
    <Button icon={<Banknote />} keycap="F12">
      Cobrar
    </Button>,
  );

  const button = screen.getByRole("button").element() as HTMLElement;
  const icon = button.querySelector("svg") as SVGSVGElement;
  const keycap = button.querySelector("kbd") as HTMLElement;
  expect(keycap.getBoundingClientRect().left).toBeGreaterThan(icon.getBoundingClientRect().right);
});

test("keeps the key out of the button's accessible name", async () => {
  const screen = await render(<Button keycap="F12">Cobrar</Button>);

  await expect.element(screen.getByRole("button", { name: "Cobrar", exact: true })).toBeVisible();
});

test("draws a translucent key on the primary variant and a white one on the others", async () => {
  const primary = await render(<Button keycap="Enter">Confirmar</Button>);
  const fill = getComputedStyle(primary.getByText("Enter").element()).backgroundColor;
  expect(colorAlpha(fill)).toBeGreaterThan(0);
  expect(colorAlpha(fill)).toBeLessThan(1);
  await primary.unmount();

  const secondary = await render(
    <Button variant="secondary" keycap="Escape">
      Volver
    </Button>,
  );
  expect(getComputedStyle(secondary.getByText("Esc").element()).backgroundColor).toBe(
    tokenRgb("surface"),
  );
  await secondary.unmount();

  const text = await render(
    <Button variant="text" keycap="Escape">
      Volver
    </Button>,
  );
  expect(getComputedStyle(text.getByText("Esc").element()).backgroundColor).toBe(
    tokenRgb("surface"),
  );
});

test("shows no key on a button without one", async () => {
  const screen = await render(<Button>Guardar</Button>);

  expect(screen.container.querySelector("kbd")).toBeNull();
});

test("shows the key on a button that explains why it is disabled", async () => {
  const screen = await render(
    <Button keycap="F12" disabledReason="Falta abrir la caja">
      Cobrar
    </Button>,
  );

  expect(screen.container.querySelector("kbd")?.textContent).toBe("F12");
});

test("takes the name of a key", () => {
  expectTypeOf<ButtonProps["keycap"]>().toEqualTypeOf<KeyName | undefined>();
});
