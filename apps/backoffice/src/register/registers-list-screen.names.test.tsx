import type { Capability } from "@purosur/domain";
import { beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { FetchRegisterNames } from "../platform/register-name";
import { accessWith } from "../shell/test-support/backoffice-access";
import { render } from "../shell/test-support/render-with-router";
import { RegistersListScreen } from "./registers-list-screen";
import { RegisterPointOfSaleSectionStub } from "./test-support/register-point-of-sale-section-stub";
import { createServices, register1, rowOf } from "./test-support/registers-list-screen";
import { backups } from "./test-support/snapshot-backups-section";

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

const NAMES = [
  { id: "register-1", name: "Caja 1" },
  { id: "register-2", name: "Caja 2" },
];

async function renderList(capabilities: Capability[], openRegister?: string, tab?: string) {
  await page.viewport(1280, 900);
  const services = createServices();
  vi.mocked(services.fetchRegisters).mockResolvedValue({ kind: "ok", value: [register1] });
  vi.mocked(services.fetchSnapshotBackupRegisters).mockResolvedValue({
    kind: "ok",
    value: NAMES,
  });
  vi.mocked(services.fetchSnapshotBackups).mockResolvedValue({ kind: "ok", value: backups });
  const fetchFiscalRegisterNames = vi.fn<FetchRegisterNames>().mockResolvedValue({
    kind: "ok",
    value: NAMES,
  });
  const screen = await render(
    <main className="flex">
      <RegistersListScreen
        access={accessWith(...capabilities)}
        services={services}
        registerPointOfSaleSection={RegisterPointOfSaleSectionStub}
        fetchFiscalRegisterNames={fetchFiscalRegisterNames}
        onSessionEnded={() => {}}
        openRegister={openRegister}
        tab={tab}
        sessionsPeriod={{ from: "", to: "" }}
        onSessionsPeriodChange={() => {}}
      />
    </main>,
  );
  return { screen, services, fetchFiscalRegisterNames };
}

test("a person with registers_area reads the full register list and nothing else", async () => {
  const { screen, services, fetchFiscalRegisterNames } = await renderList([
    "registers_area",
    "enroll_registers",
    "fiscal_configuration_area",
    "backups_area",
  ]);

  await expect.element(screen.getByRole("columnheader", { name: "Instalación" })).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Nueva caja" })).toBeVisible();
  expect(services.fetchRegisters).toHaveBeenCalled();
  expect(fetchFiscalRegisterNames).not.toHaveBeenCalled();
  expect(services.fetchSnapshotBackupRegisters).not.toHaveBeenCalled();
});

test("a person with fiscal configuration but not registers_area gets a list of names from the points of sale read", async () => {
  const { screen, services, fetchFiscalRegisterNames } = await renderList([
    "fiscal_configuration_area",
    "backups_area",
  ]);

  await expect.element(screen.getByText("Caja 1")).toBeVisible();
  await expect.element(screen.getByText("Caja 2")).toBeVisible();
  expect(fetchFiscalRegisterNames).toHaveBeenCalled();
  expect(services.fetchRegisters).not.toHaveBeenCalled();
  expect(services.fetchSnapshotBackupRegisters).not.toHaveBeenCalled();
});

test("a person with only backups_area gets a list of names from the backups read", async () => {
  const { screen, services, fetchFiscalRegisterNames } = await renderList(["backups_area"]);

  await expect.element(screen.getByText("Caja 1")).toBeVisible();
  await expect.element(screen.getByText("Caja 2")).toBeVisible();
  expect(services.fetchSnapshotBackupRegisters).toHaveBeenCalled();
  expect(services.fetchRegisters).not.toHaveBeenCalled();
  expect(fetchFiscalRegisterNames).not.toHaveBeenCalled();
});

test("the list of names has the register column only, no row actions and no Nueva caja", async () => {
  const { screen } = await renderList(["backups_area", "enroll_registers", "revoke_installations"]);

  await expect.element(screen.getByText("Caja 1")).toBeVisible();
  expect(screen.getByRole("columnheader").elements()).toHaveLength(1);
  await expect.element(screen.getByRole("columnheader", { name: "Caja" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Nueva caja" }).query()).toBeNull();
  expect(screen.getByRole("button", { name: /Más acciones/ }).query()).toBeNull();
});

test("pressing a name opens the panel with Copias and without Datos", async () => {
  const { screen } = await renderList(["backups_area"], "register-2");

  await expect.element(screen.getByRole("complementary", { name: "Caja 2" })).toBeVisible();
  await expect.element(screen.getByRole("tab", { name: "Copias", selected: true })).toBeVisible();
  expect(screen.getByRole("tab", { name: "Datos" }).query()).toBeNull();
});

test("pressing a row of the list of names names the register in the URL", async () => {
  const { screen } = await renderList(["backups_area"]);

  await userEvent.click(rowOf(screen, "Caja 2"));

  expect(window.location.search).toContain("register=register-2");
});

test("does not open a panel for a register the list of names does not show", async () => {
  const { screen } = await renderList(["backups_area"], "register-404");

  await expect.element(screen.getByText("Caja 1")).toBeVisible();
  expect(screen.getByRole("complementary").query()).toBeNull();
});

test("shows the failure of the names read as the full list shows its own", async () => {
  await page.viewport(1280, 900);
  const services = createServices();
  vi.mocked(services.fetchSnapshotBackupRegisters).mockResolvedValue({ kind: "failed" });
  const screen = await render(
    <main className="flex">
      <RegistersListScreen
        access={accessWith("backups_area")}
        services={services}
        registerPointOfSaleSection={RegisterPointOfSaleSectionStub}
        fetchFiscalRegisterNames={vi.fn()}
        onSessionEnded={() => {}}
        sessionsPeriod={{ from: "", to: "" }}
        onSessionsPeriodChange={() => {}}
      />
    </main>,
  );

  await expect.element(screen.getByText("No pudimos abrir las cajas registradoras")).toBeVisible();
});

test("shows the empty state when there are no registers", async () => {
  await page.viewport(1280, 900);
  const services = createServices();
  vi.mocked(services.fetchSnapshotBackupRegisters).mockResolvedValue({ kind: "ok", value: [] });
  const screen = await render(
    <main className="flex">
      <RegistersListScreen
        access={accessWith("backups_area")}
        services={services}
        registerPointOfSaleSection={RegisterPointOfSaleSectionStub}
        fetchFiscalRegisterNames={vi.fn()}
        onSessionEnded={() => {}}
        sessionsPeriod={{ from: "", to: "" }}
        onSessionsPeriodChange={() => {}}
      />
    </main>,
  );

  await expect.element(screen.getByText("Todavía no hay cajas registradoras")).toBeVisible();
});
