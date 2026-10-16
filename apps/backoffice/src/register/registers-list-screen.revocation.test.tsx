import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { accessWith } from "../shell/test-support/backoffice-access";
import type { RegisterSummary } from "./registers-api";
import {
  createServices,
  enrolledRegister,
  grantAuthorization,
  register1,
  renderScreen,
  revokedRegister,
} from "./test-support/registers-list-screen";

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

const revokeAction = { name: "Revocar por pérdida o robo la caja Caja 3" };

async function renderRegisters(
  registers: RegisterSummary[],
  access?: Parameters<typeof renderScreen>[2],
) {
  const services = createServices();
  vi.mocked(services.fetchRegisters).mockResolvedValue({ kind: "ok", value: registers });
  const screen = await renderScreen(services, undefined, access);
  return { services, screen };
}

test("offers revoking to a person who may, only for a register with an installation in service", async () => {
  const { screen } = await renderRegisters([register1, enrolledRegister, revokedRegister]);

  await expect.element(screen.getByText("Caja 4")).toBeVisible();
  await expect.element(screen.getByRole("button", revokeAction)).toBeVisible();
  expect(
    screen.getByRole("button", { name: /^Revocar por pérdida o robo/ }).elements(),
  ).toHaveLength(1);
});

test("does not offer revoking without the capability to revoke registers", async () => {
  const { screen } = await renderRegisters([enrolledRegister], accessWith("registers_area"));

  await expect.element(screen.getByText("Caja 3")).toBeVisible();
  await expect.element(screen.getByRole("button", revokeAction)).not.toBeInTheDocument();
  await expect
    .element(screen.getByRole("button", { name: "Emitir código de alta para Caja 3" }))
    .toBeVisible();
});

test("has no accessibility violations with the revoke action", async () => {
  const { screen } = await renderRegisters([enrolledRegister]);

  await expect.element(screen.getByRole("button", revokeAction)).toBeVisible();
  await expectNoAccessibilityViolations(document.body);
});

test("the revoke action opens the revocation modal for that register", async () => {
  const { screen } = await renderRegisters([register1, enrolledRegister]);

  await userEvent.click(screen.getByRole("button", revokeAction));

  const dialog = screen.getByRole("dialog", { name: "Revocar por pérdida o robo" });
  await expect.element(dialog.getByText("Caja 3 · CAJA-MOSTRADOR")).toBeVisible();
});

test("cancelling the revocation closes the modal and leaves the register as it was", async () => {
  const { services, screen } = await renderRegisters([enrolledRegister]);
  await userEvent.click(screen.getByRole("button", revokeAction));

  await userEvent.click(
    screen
      .getByRole("dialog", { name: "Revocar por pérdida o robo" })
      .getByRole("button", { name: "Cancelar" }),
  );

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  expect(services.revokeRegister).not.toHaveBeenCalled();
  await expect.element(screen.getByText("Activa", { exact: true })).toBeVisible();
});

test("a revoked register is shown as Revocada once the list reads again", async () => {
  const services = createServices();
  vi.mocked(services.fetchRegisters).mockResolvedValueOnce({
    kind: "ok",
    value: [enrolledRegister],
  });
  vi.mocked(services.revokeRegister).mockResolvedValue({
    kind: "ok",
    value: { revokedAt: "2026-08-04T02:00:00.000Z" },
  });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Activa", { exact: true })).toBeVisible();
  vi.mocked(services.fetchRegisters).mockResolvedValueOnce({
    kind: "ok",
    value: [{ ...revokedRegister, id: enrolledRegister.id, name: enrolledRegister.name }],
  });

  await userEvent.click(screen.getByRole("button", revokeAction));
  await userEvent.click(screen.getByRole("button", { name: "Revocar la caja" }));

  await expect.element(screen.getByText("Revocada", { exact: true })).toBeVisible();
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  expect(services.revokeRegister).toHaveBeenCalledWith("register-3");
  await expect.element(screen.getByRole("button", revokeAction)).not.toBeInTheDocument();
});

test("a revocation that needs authorization opens the authorization modal", async () => {
  const { services, screen } = await renderRegisters([enrolledRegister]);
  vi.mocked(services.revokeRegister).mockResolvedValue({ kind: "authorization_required" });
  grantAuthorization(services);

  await userEvent.click(screen.getByRole("button", revokeAction));
  await userEvent.click(screen.getByRole("button", { name: "Revocar la caja" }));

  await expect.element(screen.getByRole("dialog", { name: "Autorizá este cambio" })).toBeVisible();
});

test("a register that already has no installation in service refreshes the list behind the open modal", async () => {
  const services = createServices();
  vi.mocked(services.fetchRegisters).mockResolvedValueOnce({
    kind: "ok",
    value: [enrolledRegister],
  });
  vi.mocked(services.revokeRegister).mockResolvedValue({ kind: "no_active_installation" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Activa", { exact: true })).toBeVisible();
  vi.mocked(services.fetchRegisters).mockResolvedValueOnce({
    kind: "ok",
    value: [{ ...revokedRegister, id: enrolledRegister.id, name: enrolledRegister.name }],
  });

  await userEvent.click(screen.getByRole("button", revokeAction));
  await userEvent.click(screen.getByRole("button", { name: "Revocar la caja" }));

  await expect.poll(() => vi.mocked(services.fetchRegisters).mock.calls.length).toBe(2);
  await expect
    .element(screen.getByText("La caja ya no tiene una instalación activa."))
    .toBeVisible();
});
