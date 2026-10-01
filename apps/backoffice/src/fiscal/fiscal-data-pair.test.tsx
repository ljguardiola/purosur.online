import {
  FICTIONAL_CUIT,
  FICTIONAL_GROSS_INCOME_REGISTRATION,
} from "@purosur/domain/fiscal/test-support";
import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { DataPair, FixedPair } from "./fiscal-data-pair";

test("a data pair shows its label and its value", async () => {
  const screen = await render(
    <DataPair label="Ingresos Brutos" value={FICTIONAL_GROSS_INCOME_REGISTRATION} />,
  );

  await expect.element(screen.getByText("Ingresos Brutos")).toBeVisible();
  await expect.element(screen.getByText(FICTIONAL_GROSS_INCOME_REGISTRATION)).toBeVisible();
});

test("a data pair without a value says Sin cargar", async () => {
  const screen = await render(<DataPair label="Ingresos Brutos" value={null} />);

  await expect.element(screen.getByText("Sin cargar")).toBeVisible();
});

test("a fixed pair shows its label and its value", async () => {
  const screen = await render(<FixedPair label="CUIT" value={FICTIONAL_CUIT} />);

  await expect.element(screen.getByText("CUIT")).toBeVisible();
  await expect.element(screen.getByText(FICTIONAL_CUIT)).toBeVisible();
});

test("a data pair without a value says what its screen calls a missing one", async () => {
  const screen = await render(
    <DataPair label="Punto de venta" value={null} missing="Sin configurar" />,
  );

  await expect.element(screen.getByText("Sin configurar")).toBeVisible();
});
