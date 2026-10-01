import {
  FICTIONAL_CUIT,
  FICTIONAL_GROSS_INCOME_REGISTRATION,
  FICTIONAL_LEGAL_NAME,
} from "@purosur/domain/fiscal/test-support";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import type { CloudData } from "../platform/use-cloud-query";
import type { IssuerIdentification } from "./issuer-identification-api";
import { IssuerIdentificationSection } from "./issuer-identification-section";

const complete: IssuerIdentification = {
  legalName: FICTIONAL_LEGAL_NAME,
  grossIncomeRegistration: FICTIONAL_GROSS_INCOME_REGISTRATION,
  activityStartDate: "2019-03-01",
  authorizedCuit: FICTIONAL_CUIT,
  taxStatus: "Responsable Monotributo",
  version: 1,
};

const incomplete: IssuerIdentification = {
  ...complete,
  legalName: null,
  grossIncomeRegistration: null,
  activityStartDate: null,
};

function loaded(value: IssuerIdentification): CloudData<IssuerIdentification> {
  return { status: "loaded", value, refreshing: false };
}

function sectionFor(data: CloudData<IssuerIdentification>, options: { onEdit?: () => void } = {}) {
  return (
    <main>
      <IssuerIdentificationSection data={data} onEdit={options.onEdit ?? (() => {})} />
    </main>
  );
}

test("shows every value of a complete issuer identification, and what prints it", async () => {
  const screen = await render(sectionFor(loaded(complete)));

  await expect
    .element(screen.getByRole("heading", { name: "Identificación del emisor", level: 2 }))
    .toBeVisible();
  await expect.element(screen.getByText(FICTIONAL_LEGAL_NAME)).toBeVisible();
  await expect.element(screen.getByText(FICTIONAL_CUIT)).toBeVisible();
  await expect.element(screen.getByText("Responsable Monotributo")).toBeVisible();
  await expect.element(screen.getByText(FICTIONAL_GROSS_INCOME_REGISTRATION)).toBeVisible();
  await expect.element(screen.getByText("01/03/2019")).toBeVisible();
  await expect
    .element(screen.getByText("Lo imprime cada factura y nota de crédito."))
    .toBeVisible();
  expect(screen.getByText("Sin cargar").query()).toBeNull();
  expect(
    screen.getByText("Las cajas no están emitiendo facturas ni notas de crédito").query(),
  ).toBeNull();
});

test("shows the incomplete notice and Sin cargar for each missing value", async () => {
  const screen = await render(sectionFor(loaded(incomplete)));

  await expect
    .element(screen.getByText("Las cajas no están emitiendo facturas ni notas de crédito"))
    .toBeVisible();
  await expect
    .element(
      screen.getByText("Hasta que se carguen los datos que faltan. Las ventas se siguen cobrando."),
    )
    .toBeVisible();
  expect(screen.getByText("Sin cargar").elements().length).toBe(3);
  await expect.element(screen.getByText(FICTIONAL_CUIT)).toBeVisible();
  await expect.element(screen.getByText("Responsable Monotributo")).toBeVisible();
});

test("shows a placeholder instead of a loading line while loading, with Editar disabled", async () => {
  const screen = await render(sectionFor({ status: "loading" }));

  await expect.element(screen.getByText("Cargando…")).toHaveTextContent("Cargando…");
  expect(screen.container.querySelector('[aria-hidden="true"]')?.children.length).toBeGreaterThan(
    0,
  );
  expect(screen.container.querySelector("p[role=status]")).toBeNull();
  expect(screen.getByText("Sin cargar").query()).toBeNull();
  await expect.element(screen.getByRole("button", { name: "Editar" })).toBeDisabled();
});

test("shows a load failure with Reintentar, and Editar disabled", async () => {
  const retry = vi.fn();
  const screen = await render(sectionFor({ status: "failed", retry }));

  await expect.element(screen.getByText("No pudimos abrir la configuración fiscal")).toBeVisible();
  await expect.element(screen.getByText("Probá de nuevo en unos minutos.")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Editar" })).toBeDisabled();

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  expect(retry).toHaveBeenCalledTimes(1);
});

test("shows the rate-limited notice with the time to wait and a retry action", async () => {
  const screen = await render(
    sectionFor({ status: "failed", retry: vi.fn(), retryAfterSeconds: 120 }),
  );

  await expect.element(screen.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(screen.getByText("Se puede volver a intentar en 2 minutos.")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Reintentar" })).toBeVisible();
});

test("keeps Editar available while loaded data refreshes", async () => {
  const onEdit = vi.fn();
  const screen = await render(
    sectionFor({ status: "loaded", value: complete, refreshing: true }, { onEdit }),
  );

  await userEvent.click(screen.getByRole("button", { name: "Editar" }));

  expect(onEdit).toHaveBeenCalledTimes(1);
});

test("has no accessibility violations once loaded", async () => {
  const screen = await render(sectionFor(loaded(incomplete)));
  await expect.element(screen.getByText(FICTIONAL_CUIT)).toBeVisible();

  await expectNoAccessibilityViolations(document.body);
});
