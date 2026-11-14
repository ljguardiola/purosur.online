import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { tokenRgb } from "../../test/token-colors";
import { Button } from "../forms/button";
import { FigureStat } from "./figure-stat";
import { ProductCard } from "./product-card";

const figures = [
  { label: "Peso", value: "0,410 kg" },
  { label: "Importe", value: "$ 6.974,10" },
  { label: "Stock", value: "12,4 kg" },
];

test("is a region labelled by the product name, with its price", async () => {
  const screen = await render(
    <ProductCard
      name="Almendras peladas"
      price="$ 18.900,00 / kg"
      soldBy="weight"
      figures={figures}
    />,
  );

  await expect.element(screen.getByRole("region", { name: "Almendras peladas" })).toBeVisible();
  await expect.element(screen.getByText("$ 18.900,00 / kg")).toBeVisible();
  await expectNoAccessibilityViolations(screen.container);
});

test("shows every figure under its label", async () => {
  const screen = await render(
    <ProductCard
      name="Almendras peladas"
      price="$ 18.900,00 / kg"
      soldBy="weight"
      figures={figures}
    />,
  );

  for (const { label, value } of figures) {
    await expect.element(screen.getByText(label, { exact: true })).toBeVisible();
    await expect.element(screen.getByText(value)).toBeVisible();
  }
  expect(getComputedStyle(screen.getByText("Peso").element()).textTransform).toBe("uppercase");
  expect(getComputedStyle(screen.getByText("0,410 kg").element()).fontFamily).toContain("mono");
});

test("draws each figure as the design system's figure, with a warning label and a plain value", async () => {
  const loose = await render(
    <FigureStat labelTone="warning" variant="plain" monospace label="Peso" value="0,410 kg" />,
  );
  const figureStatClassName = loose.container.firstElementChild?.className;
  await loose.unmount();
  const screen = await render(
    <ProductCard
      name="Almendras peladas"
      price="$ 18.900,00 / kg"
      soldBy="weight"
      figures={figures}
    />,
  );
  const label = screen.getByText("Peso").element();

  expect(label.parentElement?.className).toBe(figureStatClassName);
  expect(getComputedStyle(label).color).toBe(tokenRgb("warning"));
  expect(getComputedStyle(screen.getByText("0,410 kg").element()).color).toBe(tokenRgb("text"));
});

test("shows the promotion tag only when it has one", async () => {
  const withTag = await render(
    <ProductCard
      name="Almendras peladas"
      price="$ 18.900,00 / kg"
      soldBy="weight"
      tag="10 % los martes"
      figures={figures}
    />,
  );
  await expect.element(withTag.getByText("10 % los martes")).toBeVisible();
  await withTag.unmount();

  const without = await render(
    <ProductCard
      name="Almendras peladas"
      price="$ 18.900,00 / kg"
      soldBy="weight"
      figures={figures}
    />,
  );
  expect(without.container.textContent).not.toContain("10 %");
});

test("draws a different icon when sold by weight and by unit", async () => {
  const byWeight = await render(
    <ProductCard name="Almendras" price="$ 1,00 / kg" soldBy="weight" figures={[]} />,
  );
  const weightIcon = byWeight.container.querySelector("svg")?.innerHTML;
  await byWeight.unmount();
  const byUnit = await render(
    <ProductCard name="Almendras" price="$ 1,00" soldBy="unit" figures={[]} />,
  );

  expect(weightIcon).toBeDefined();
  expect(byUnit.container.querySelector("svg")?.innerHTML).not.toBe(weightIcon);
});

test("shows the action below the figures", async () => {
  const screen = await render(
    <ProductCard
      name="Almendras peladas"
      price="$ 18.900,00 / kg"
      soldBy="weight"
      figures={figures}
      action={<Button keycap="Enter">Agregar a la venta</Button>}
    />,
  );

  const button = screen.getByRole("button", { name: /Agregar a la venta/ }).element();
  const lastFigure = screen.getByText("12,4 kg").element();
  expect(button.getBoundingClientRect().top).toBeGreaterThan(
    lastFigure.getBoundingClientRect().bottom,
  );
});

test("draws a soft brown card", async () => {
  const screen = await render(
    <ProductCard name="Almendras" price="$ 1,00" soldBy="unit" figures={[]} />,
  );

  const style = getComputedStyle(screen.getByRole("region").element());
  expect(style.backgroundColor).toBe(tokenRgb("surface-soft"));
  expect(style.borderTopColor).toBe(tokenRgb("border-accent"));
});
