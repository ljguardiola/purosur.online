import { beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { ADMINISTRATOR_ACCESS } from "../shell/test-support/backoffice-access";
import { render } from "../shell/test-support/render-with-router";
import { RegistersListScreen } from "./registers-list-screen";
import {
  createServices,
  enrolledRegister,
  register1,
  rowOf,
} from "./test-support/registers-list-screen";
import { backups } from "./test-support/snapshot-backups-section";

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

async function renderListWithPanel(openRegister: string | undefined, tab?: string) {
  await page.viewport(1280, 900);
  const services = createServices();
  vi.mocked(services.fetchRegisters).mockResolvedValue({
    kind: "ok",
    value: [register1, enrolledRegister],
  });
  vi.mocked(services.fetchSnapshotBackups).mockResolvedValue({ kind: "ok", value: backups });
  const screen = await render(
    <main className="flex">
      <RegistersListScreen
        access={ADMINISTRATOR_ACCESS}
        services={services}
        onSessionEnded={() => {}}
        openRegister={openRegister}
        tab={tab}
      />
    </main>,
  );
  return { screen, services };
}

test("opens the panel of the register named, beside the list, and marks its row", async () => {
  const { screen } = await renderListWithPanel("register-3");

  await expect.element(screen.getByRole("complementary", { name: "Caja 3" })).toBeVisible();
  await expect.element(rowOf(screen, "Caja 3")).toHaveAttribute("aria-current", "true");
  expect(rowOf(screen, "Caja 1").element()).not.toHaveAttribute("aria-current");
  await expect.element(screen.getByText("Caja 1")).toBeVisible();
});

test("shows no panel when no register is named", async () => {
  const { screen } = await renderListWithPanel(undefined);

  await expect.element(screen.getByText("Caja 1")).toBeVisible();
  expect(screen.getByRole("complementary").query()).toBeNull();
});

test("does not open a panel for a register the list does not show", async () => {
  const { screen } = await renderListWithPanel("register-404");

  await expect.element(screen.getByText("Caja 1")).toBeVisible();
  expect(screen.getByRole("complementary").query()).toBeNull();
});

test("the panel's Emitir código de alta emits the code of its register", async () => {
  const { screen, services } = await renderListWithPanel("register-1");
  const panel = screen.getByRole("complementary", { name: "Caja 1" });

  await userEvent.click(panel.getByRole("button", { name: "Emitir código de alta" }));

  await expect.element(screen.getByRole("dialog", { name: "Código de alta" })).toBeVisible();
  expect(services.emitEnrollmentCode).toHaveBeenCalledWith("register-1");
});

test("the panel's Revocar opens the revocation of its register", async () => {
  const { screen } = await renderListWithPanel("register-3");
  const panel = screen.getByRole("complementary", { name: "Caja 3" });

  await userEvent.click(panel.getByRole("button", { name: "Revocar" }));

  await expect
    .element(screen.getByRole("dialog", { name: "Revocar por pérdida o robo" }))
    .toBeVisible();
});

test("the panel's BitLocker button opens the key load of its register", async () => {
  const { screen } = await renderListWithPanel("register-3");
  const panel = screen.getByRole("complementary", { name: "Caja 3" });

  await userEvent.click(panel.getByRole("button", { name: "Cargar la clave de BitLocker" }));

  await expect.element(screen.getByRole("dialog")).toBeVisible();
});

test("the panel's Fiscal y cobros assigns the Point terminal and the QR of its register", async () => {
  const { screen } = await renderListWithPanel("register-3", "fiscal");
  const panel = screen.getByRole("complementary", { name: "Caja 3" });

  await userEvent.click(panel.getByRole("button", { name: "Asignar terminal Point" }));
  await expect
    .element(screen.getByRole("dialog", { name: "Terminal Point integrada" }))
    .toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();

  await userEvent.click(panel.getByRole("button", { name: "Asignar QR de Mercado Pago" }));
  await expect
    .element(screen.getByRole("dialog", { name: "Asignar QR de Mercado Pago" }))
    .toBeVisible();
});
