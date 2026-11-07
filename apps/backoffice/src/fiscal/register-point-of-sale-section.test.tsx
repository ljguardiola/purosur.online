import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import type { CloudData } from "../platform/use-cloud-query";
import { render } from "../shell/test-support/render-with-router";
import type { FiscalAddress } from "./fiscal-addresses-api";
import { RegisterPointOfSaleSection } from "./register-point-of-sale-section";
import type { RegisterPointOfSale } from "./register-points-of-sale-api";

const depot: FiscalAddress = {
  id: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  name: "Depósito Central",
  streetAddress: "Calle Ficticia 123, CABA",
  version: 1,
};

const configuredRegister: RegisterPointOfSale = {
  registerId: "register-1",
  registerName: "Caja 1",
  pointOfSaleNumber: 12,
  fiscalAddressId: depot.id,
  version: 2,
  offlinePointOfSaleNumber: 13,
  offlineVersion: 4,
};

const pendingRegister: RegisterPointOfSale = {
  registerId: "register-2",
  registerName: "Caja 2",
  pointOfSaleNumber: null,
  fiscalAddressId: null,
  version: 0,
  offlinePointOfSaleNumber: null,
  offlineVersion: 0,
};

type SectionData = CloudData<[RegisterPointOfSale[], FiscalAddress[]]>;

function loaded(registers: RegisterPointOfSale[], addresses: FiscalAddress[]): SectionData {
  return { status: "loaded", value: [registers, addresses], refreshing: false };
}

function renderSection(data: SectionData) {
  return render(
    <main>
      <RegisterPointOfSaleSection data={data} />
    </main>,
  );
}

test("shows a register's points of sale padded to five digits and its fiscal address's name", async () => {
  const screen = await renderSection(loaded([configuredRegister], [depot]));

  await expect.element(screen.getByRole("heading", { name: "Caja 1", level: 2 })).toBeVisible();
  await expect.element(screen.getByText("00012")).toBeVisible();
  await expect.element(screen.getByText("00013")).toBeVisible();
  await expect.element(screen.getByText("Depósito Central")).toBeVisible();
});

test("shows Sin configurar for each value a register lacks", async () => {
  const screen = await renderSection(loaded([pendingRegister], [depot]));

  await expect.element(screen.getByText("Sin configurar").first()).toBeVisible();
  expect(screen.getByText("Sin configurar").elements()).toHaveLength(3);
});

test("links each register to its Fiscal y cobros in Cajas", async () => {
  const screen = await renderSection(loaded([configuredRegister, pendingRegister], [depot]));

  const links = screen.getByRole("link", { name: "Se edita en Cajas" });
  await expect
    .element(links.first())
    .toHaveAttribute("href", "/registers?register=register-1&tab=fiscal");
  await expect
    .element(links.nth(1))
    .toHaveAttribute("href", "/registers?register=register-2&tab=fiscal");
});

test("shows the empty state when there are no registers", async () => {
  const screen = await renderSection(loaded([], [depot]));

  await expect.element(screen.getByText("Todavía no hay cajas registradoras")).toBeVisible();
});

test("shows a placeholder while loading", async () => {
  const screen = await renderSection({ status: "loading" });

  await expect.element(screen.getByText("Cargando…").first()).toBeVisible();
});

test("shows a load failure, and Reintentar asks again", async () => {
  const retry = vi.fn();
  const screen = await renderSection({ status: "failed", retry });
  await expect.element(screen.getByText("No pudimos abrir los puntos de venta")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  expect(retry).toHaveBeenCalledOnce();
});

test("has no accessibility violations with a configured and a pending register", async () => {
  const screen = await renderSection(loaded([configuredRegister, pendingRegister], [depot]));
  await expect.element(screen.getByText("00012")).toBeVisible();

  await expectNoAccessibilityViolations(screen.container);
});
