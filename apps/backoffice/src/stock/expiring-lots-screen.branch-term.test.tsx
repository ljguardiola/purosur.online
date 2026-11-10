import { beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { accessWith } from "../shell/test-support/backoffice-access";
import { expiringLotList } from "./test-support/expiring-lots-fixtures";
import { EVERY_LOT, listed, renderScreen } from "./test-support/expiring-lots-screen";

beforeEach(async () => {
  await page.viewport(1280, 900);
});

test("shows the days of warning the branch has, with Cambiar for who can change the branch", async () => {
  const screen = await renderScreen(listed(), { access: accessWith("branch_area") });

  await expect.element(screen.getByText("Aviso de vencimiento: 30 días")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Cambiar" })).toBeVisible();
});

test("shows the days of warning without Cambiar to who cannot change the branch", async () => {
  const screen = await renderScreen(listed(), { access: accessWith("stock_expiries") });

  await expect.element(screen.getByText("Aviso de vencimiento: 30 días")).toBeVisible();
  expect(screen.getByRole("button", { name: "Cambiar" }).query()).toBeNull();
});

test("shows nothing of the warning while the lots load", async () => {
  const services = listed();
  vi.mocked(services.fetchExpiringLots).mockReturnValue(new Promise(() => {}));

  const screen = await renderScreen(services, { access: accessWith("branch_area") });

  await expect.element(screen.getByRole("table", { name: "Vencimientos" })).toBeVisible();
  expect(screen.getByText(/Aviso de vencimiento/).query()).toBeNull();
  expect(screen.getByRole("button", { name: "Cambiar" }).query()).toBeNull();
});

test("shows the new days of warning, answered by the cloud, once they are saved", async () => {
  const services = listed();
  vi.mocked(services.fetchExpiringLots)
    .mockResolvedValueOnce({ kind: "ok", value: expiringLotList(EVERY_LOT) })
    .mockResolvedValue({ kind: "ok", value: { ...expiringLotList(EVERY_LOT), windowDays: 60 } });
  const screen = await renderScreen(services, { access: accessWith("branch_area") });
  await userEvent.click(screen.getByRole("button", { name: "Cambiar" }));
  const dialog = screen.getByRole("dialog");
  await expect
    .element(dialog.getByRole("textbox", { name: "Aviso de vencimiento" }))
    .toHaveValue("30");

  await userEvent.fill(dialog.getByRole("textbox", { name: "Aviso de vencimiento" }), "60");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar" }));

  await expect.element(screen.getByText("Aviso de vencimiento: 60 días")).toBeVisible();
  expect(services.branchTerm.saveBranchSettings).toHaveBeenCalledWith(
    expect.objectContaining({ expiring_lot_alert_days: 60 }),
  );
});
