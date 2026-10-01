import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { DataPair, FixedPair } from "./fiscal-data-pair";

test("a data pair shows its label and its value", async () => {
  const screen = await render(<DataPair label="Ingresos Brutos" value="0000000-00" />);

  await expect.element(screen.getByText("Ingresos Brutos")).toBeVisible();
  await expect.element(screen.getByText("0000000-00")).toBeVisible();
});

test("a data pair without a value says Sin cargar", async () => {
  const screen = await render(<DataPair label="Ingresos Brutos" value={null} />);

  await expect.element(screen.getByText("Sin cargar")).toBeVisible();
});

test("a fixed pair shows its label and its value", async () => {
  const screen = await render(<FixedPair label="CUIT" value="20-00000000-1" />);

  await expect.element(screen.getByText("CUIT")).toBeVisible();
  await expect.element(screen.getByText("20-00000000-1")).toBeVisible();
});
