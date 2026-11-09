import type { Capability } from "@purosur/domain";
import { beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { backups } from "../register/test-support/snapshot-backups-section";
import { accessWith } from "../shell/test-support/backoffice-access";
import { registerPartsOf } from "../shell/test-support/register-parts";
import { render } from "../shell/test-support/render-with-router";
import { RegisterNamesListScreen } from "./register-names-list-screen";
import { RegisterPointOfSaleSectionStub } from "./test-support/register-point-of-sale-section-stub";
import {
  createServices,
  type RegistersListTestServices,
  rowOf,
} from "./test-support/registers-list-screen";

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

const NAMES = [
  { id: "register-1", name: "Caja 1" },
  { id: "register-2", name: "Caja 2" },
];

function namesServices(): RegistersListTestServices {
  const services = createServices();
  vi.mocked(services.fetchSnapshotBackupRegisters).mockResolvedValue({ kind: "ok", value: NAMES });
  vi.mocked(services.fetchFiscalRegisterNames).mockResolvedValue({ kind: "ok", value: NAMES });
  vi.mocked(services.fetchSnapshotBackups).mockResolvedValue({ kind: "ok", value: backups });
  return services;
}

async function renderNames(
  capabilities: Capability[],
  {
    services = namesServices(),
    openRegister,
  }: {
    services?: RegistersListTestServices;
    openRegister?: string;
  } = {},
) {
  await page.viewport(1280, 900);
  const screen = await render(
    <main className="flex">
      <RegisterNamesListScreen
        access={accessWith(...capabilities)}
        services={services}
        registerPointOfSaleSection={RegisterPointOfSaleSectionStub}
        registerPanelSections={registerPartsOf(services).panelSections}
        onSessionEnded={() => {}}
        openRegister={openRegister}
        sessionsPeriod={{ from: "", to: "" }}
        onSessionsPeriodChange={() => {}}
      />
    </main>,
  );
  return { screen, services };
}

test("a person with fiscal configuration reads the names from the points of sale read", async () => {
  const { screen, services } = await renderNames(["fiscal_configuration_area", "backups_area"]);

  await expect.element(screen.getByText("Caja 1")).toBeVisible();
  await expect.element(screen.getByText("Caja 2")).toBeVisible();
  expect(services.fetchFiscalRegisterNames).toHaveBeenCalled();
  expect(services.fetchSnapshotBackupRegisters).not.toHaveBeenCalled();
  expect(services.fetchRegisters).not.toHaveBeenCalled();
});

test("a person with only backups_area reads the names from the backups read", async () => {
  const { screen, services } = await renderNames(["backups_area"]);

  await expect.element(screen.getByText("Caja 1")).toBeVisible();
  await expect.element(screen.getByText("Caja 2")).toBeVisible();
  expect(services.fetchSnapshotBackupRegisters).toHaveBeenCalled();
  expect(services.fetchFiscalRegisterNames).not.toHaveBeenCalled();
  expect(services.fetchRegisters).not.toHaveBeenCalled();
});

test("has the register column only, no row actions and no Nueva caja", async () => {
  const { screen } = await renderNames([
    "backups_area",
    "enroll_registers",
    "revoke_installations",
  ]);

  await expect.element(screen.getByText("Caja 1")).toBeVisible();
  expect(screen.getByRole("columnheader").elements()).toHaveLength(1);
  await expect.element(screen.getByRole("columnheader", { name: "Caja" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Nueva caja" }).query()).toBeNull();
  expect(screen.getByRole("button", { name: /Más acciones/ }).query()).toBeNull();
});

test("opens the panel of the register the URL names, with Copias and without Datos", async () => {
  const { screen } = await renderNames(["backups_area"], { openRegister: "register-2" });

  await expect.element(screen.getByRole("complementary", { name: "Caja 2" })).toBeVisible();
  await expect.element(screen.getByRole("tab", { name: "Copias", selected: true })).toBeVisible();
  expect(screen.getByRole("tab", { name: "Datos" }).query()).toBeNull();
});

test("pressing a row names the register in the URL", async () => {
  const { screen } = await renderNames(["backups_area"]);

  await userEvent.click(rowOf(screen, "Caja 2"));

  expect(window.location.search).toContain("register=register-2");
});

test("does not open a panel for a register the list does not show", async () => {
  const { screen } = await renderNames(["backups_area"], { openRegister: "register-404" });

  await expect.element(screen.getByText("Caja 1")).toBeVisible();
  expect(screen.getByRole("complementary").query()).toBeNull();
});

test("shows the failure of the names read", async () => {
  const services = createServices();
  vi.mocked(services.fetchSnapshotBackupRegisters).mockResolvedValue({ kind: "failed" });

  const { screen } = await renderNames(["backups_area"], { services });

  await expect.element(screen.getByText("No pudimos abrir las cajas registradoras")).toBeVisible();
});

test("shows the empty state when there are no registers", async () => {
  const services = createServices();
  vi.mocked(services.fetchSnapshotBackupRegisters).mockResolvedValue({ kind: "ok", value: [] });

  const { screen } = await renderNames(["backups_area"], { services });

  await expect.element(screen.getByText("Todavía no hay cajas registradoras")).toBeVisible();
});
