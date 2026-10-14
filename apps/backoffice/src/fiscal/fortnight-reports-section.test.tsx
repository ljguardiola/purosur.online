import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import type { CloudData } from "../platform/use-cloud-query";
import type { FortnightPresentation } from "./fortnight-presentations-api";
import { FortnightReportsSection } from "./fortnight-reports-section";
import type { RegisterPointOfSale } from "./register-points-of-sale-api";

const register: RegisterPointOfSale = {
  registerId: "register-1",
  registerName: "Caja 1",
  pointOfSaleNumber: 3,
  fiscalAddressId: null,
  version: 1,
  offlinePointOfSaleNumber: 4,
  offlineVersion: 1,
};

const secondRegister: RegisterPointOfSale = {
  ...register,
  registerId: "register-2",
  registerName: "Caja 2",
  offlinePointOfSaleNumber: 5,
};

const septemberFirstHalf = { start: "2026-09-01", end: "2026-09-15" };
const augustSecondHalf = { start: "2026-08-16", end: "2026-08-31" };

function presentation(overrides: Partial<FortnightPresentation> = {}): FortnightPresentation {
  return {
    registerId: register.registerId,
    pointOfSaleNumber: 4,
    fortnight: septemberFirstHalf,
    deadline: "2026-09-23",
    state: null,
    ...overrides,
  };
}

function loaded(
  presentations: FortnightPresentation[],
  registers: RegisterPointOfSale[] = [register, secondRegister],
): CloudData<[FortnightPresentation[], RegisterPointOfSale[]]> {
  return { status: "loaded", value: [presentations, registers], refreshing: false };
}

function sectionFor(data: CloudData<[FortnightPresentation[], RegisterPointOfSale[]]>) {
  return (
    <main>
      <FortnightReportsSection data={data} />
    </main>
  );
}

test("lists each presentation with its fortnight, its point of sale and its deadline", async () => {
  const screen = await render(
    sectionFor(loaded([presentation({ fortnight: augustSecondHalf, deadline: "2026-09-08" })])),
  );

  const table = screen.getByRole("table", { name: "Informes quincenales" });
  for (const header of ["Quincena", "Punto de venta", "Comprobantes", "Estado", "Vence"]) {
    await expect.element(table.getByRole("columnheader", { name: header })).toBeVisible();
  }
  await expect.element(table.getByText("16 al 31/08/2026")).toBeVisible();
  await expect.element(table.getByText("00004")).toBeVisible();
  await expect.element(table.getByText("08/09/2026")).toBeVisible();
});

test.each([
  [null, "Pendiente"],
  ["ready", "Listo para presentar"],
  ["submitting", "Presentando"],
  ["refused", "Rechazado"],
  ["blocked", "Bloqueado"],
  ["accepted", "Aceptado"],
] as const)("shows the state %s as %s", async (state, label) => {
  const screen = await render(sectionFor(loaded([presentation({ state })])));

  await expect.element(screen.getByRole("table").getByText(label, { exact: true })).toBeVisible();
});

test("says an accepted presentation had no movement", async () => {
  const screen = await render(sectionFor(loaded([presentation({ state: "accepted" })])));

  await expect.element(screen.getByText("Sin movimiento")).toBeVisible();
});

test("says which register is still missing vouchers on a blocked presentation", async () => {
  const screen = await render(sectionFor(loaded([presentation({ state: "blocked" })])));

  await expect
    .element(screen.getByRole("table").getByText("Faltan comprobantes de Caja 1"))
    .toBeVisible();
});

test.each([null, "ready", "submitting", "refused"] as const)(
  "shows a dash for the vouchers of a %s presentation",
  async (state) => {
    const screen = await render(sectionFor(loaded([presentation({ state })])));

    await expect.element(screen.getByRole("table").getByText("—")).toBeVisible();
  },
);

test("warns above the table of each blocked presentation, naming its register", async () => {
  const screen = await render(
    sectionFor(
      loaded([
        presentation({ state: "blocked" }),
        presentation({
          registerId: secondRegister.registerId,
          pointOfSaleNumber: 5,
          fortnight: augustSecondHalf,
          state: "blocked",
        }),
      ]),
    ),
  );

  await expect
    .element(screen.getByText("No se puede presentar el informe del 1 al 15/09"))
    .toBeVisible();
  await expect
    .element(
      screen.getByText(
        "Caja 1 estuvo sin conexión y la nube todavía no tiene todos sus comprobantes de esa quincena. Se puede presentar cuando termine de sincronizar.",
      ),
    )
    .toBeVisible();
  await expect
    .element(screen.getByText("No se puede presentar el informe del 16 al 31/08"))
    .toBeVisible();
  await expect.element(screen.getByText(/^Caja 2 estuvo sin conexión/)).toBeVisible();
});

test("shows no warning while no presentation is blocked", async () => {
  const screen = await render(
    sectionFor(loaded([presentation({ state: "refused" }), presentation({ state: "accepted" })])),
  );

  await expect.element(screen.getByRole("table")).toBeVisible();
  expect(screen.getByText(/No se puede presentar el informe/).query()).toBeNull();
});

test("shows the empty state when no fortnight has closed", async () => {
  const screen = await render(sectionFor(loaded([])));

  await expect.element(screen.getByText("Todavía no hay informes quincenales")).toBeVisible();
  await expect
    .element(
      screen.getByText("Aparecen cuando cierra la primera quincena con un punto de venta CAEA."),
    )
    .toBeVisible();
});

test("shows a placeholder while the presentations load", async () => {
  const screen = await render(sectionFor({ status: "loading" }));

  await expect.element(screen.getByText("Cargando…").first()).toBeVisible();
});

test("shows a load failure, and Reintentar asks again", async () => {
  const retry = vi.fn();
  const screen = await render(sectionFor({ status: "failed", retry }));
  await expect.element(screen.getByText("No pudimos abrir los informes quincenales")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  expect(retry).toHaveBeenCalledOnce();
});

test("has no accessibility violations with blocked and accepted presentations", async () => {
  const screen = await render(
    sectionFor(loaded([presentation({ state: "blocked" }), presentation({ state: "accepted" })])),
  );

  await expect.element(screen.getByRole("table")).toBeVisible();
  await expectNoAccessibilityViolations(document.body);
});
