import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import type { BackofficeAccess } from "../shell/backoffice-access";
import { ADMINISTRATOR_ACCESS, accessWith } from "../shell/test-support/backoffice-access";
import { render } from "../shell/test-support/render-with-router";
import { RegisterPanel } from "./register-panel";
import { weekCashSessionClosesReport } from "./test-support/cash-session-closes-fixtures";
import { createActions, panelServices } from "./test-support/register-panel";
import { enrolledRegister } from "./test-support/registers-list-screen";
import { backups } from "./test-support/snapshot-backups-section";

function renderPanel({
  access = ADMINISTRATOR_ACCESS,
  tab,
  onClose = () => {},
}: {
  access?: BackofficeAccess;
  tab?: string;
  onClose?: () => void;
} = {}) {
  const services = panelServices();
  vi.mocked(services.fetchSnapshotBackups).mockResolvedValue({ kind: "ok", value: backups });
  vi.mocked(services.fetchCashSessionCloses).mockResolvedValue({
    kind: "ok",
    value: weekCashSessionClosesReport,
  });
  return render(
    <RegisterPanel
      register={enrolledRegister}
      access={access}
      actions={createActions()}
      secondsSinceRead={0}
      tab={tab}
      onClose={onClose}
      onSessionEnded={() => {}}
      services={services}
    />,
  ).then((screen) => ({ screen, services }));
}

test("is titled with the register's name and opens on Datos", async () => {
  const { screen } = await renderPanel();

  await expect.element(screen.getByRole("complementary", { name: "Caja 3" })).toBeVisible();
  await expect.element(screen.getByRole("tab", { name: "Datos", selected: true })).toBeVisible();
  await expect.element(screen.getByText("CAJA-MOSTRADOR")).toBeVisible();
});

test("offers the four tabs to a person who can see every part", async () => {
  const { screen } = await renderPanel();

  for (const name of ["Datos", "Fiscal y cobros", "Copias", "Sesiones"]) {
    await expect.element(screen.getByRole("tab", { name })).toBeVisible();
  }
  expect(screen.getByRole("tab").elements()).toHaveLength(4);
});

test.each([
  { missing: "backups_area", tab: "Copias" },
  { missing: "reports_area", tab: "Sesiones" },
  { missing: "fiscal_configuration_area", tab: "Fiscal y cobros" },
] as const)("leaves $tab out for a person without $missing", async ({ missing, tab }) => {
  const all = [
    "registers_area",
    "fiscal_configuration_area",
    "backups_area",
    "reports_area",
  ] as const;
  const { screen } = await renderPanel({
    access: accessWith(...all.filter((capability) => capability !== missing)),
  });

  await expect.element(screen.getByRole("tab", { name: "Datos" })).toBeVisible();
  expect(screen.getByRole("tab", { name: tab }).query()).toBeNull();
});

test("opens the tab it is given when the person can see it", async () => {
  const { screen } = await renderPanel({ tab: "backups" });

  await expect.element(screen.getByRole("tab", { name: "Copias", selected: true })).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Cambiar las reglas" })).toBeVisible();
});

test.each(["invoices", "backups"])(
  "falls back to the first tab the person sees for the tab %s they cannot open",
  async (tab) => {
    const { screen } = await renderPanel({ access: accessWith("registers_area"), tab });

    await expect.element(screen.getByRole("tab", { name: "Datos", selected: true })).toBeVisible();
  },
);

test("shows the sessions of the register in Sesiones", async () => {
  const { screen, services } = await renderPanel({ tab: "sessions" });

  await expect.element(screen.getByText("Cerró: Beto")).toBeVisible();
  expect(services.fetchCashSessionCloses).toHaveBeenCalledWith({ register_id: "register-3" });
});

test("shows the Point terminal and the QR in Fiscal y cobros", async () => {
  const { screen } = await renderPanel({ tab: "fiscal" });

  await expect.element(screen.getByText("Terminal Point: sin asignar")).toBeVisible();
});

test("reads the backups of the register in Copias", async () => {
  const { services } = await renderPanel({ tab: "backups" });

  await expect
    .poll(() => vi.mocked(services.fetchSnapshotBackups).mock.calls)
    .toEqual([["register-3"]]);
});

test("Cerrar closes the panel", async () => {
  const onClose = vi.fn();
  const { screen } = await renderPanel({ onClose });

  await userEvent.click(screen.getByRole("button", { name: "Cerrar" }));

  expect(onClose).toHaveBeenCalledOnce();
});

test("shows nothing to a person who can see no part of it", async () => {
  const { screen } = await renderPanel({ access: accessWith("refunds_area") });

  expect(screen.getByRole("complementary").query()).toBeNull();
});
