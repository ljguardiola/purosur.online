import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { accessWith } from "../shell/test-support/backoffice-access";
import {
  createServices,
  enrolledRegister,
  renderRegisters,
  renderScreen,
  revokedRegister,
} from "./test-support/registers-list-screen";

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

const revokeAll = { name: "Revocar todas las instalaciones" };

test("offers revoking every installation, with its reason, to a person who may", async () => {
  const { screen } = await renderRegisters([enrolledRegister]);

  await expect.element(screen.getByText("Ante una sospecha de compromiso")).toBeVisible();
  await expect.element(screen.getByRole("button", revokeAll)).toBeVisible();
});

test("does not offer revoking every installation without the capability to revoke registers", async () => {
  const { screen } = await renderRegisters([enrolledRegister], accessWith("registers_area"));

  await expect.element(screen.getByText("Caja 3")).toBeVisible();
  await expect.element(screen.getByRole("button", revokeAll)).not.toBeInTheDocument();
  await expect.element(screen.getByText("Ante una sospecha de compromiso")).not.toBeInTheDocument();
});

test("has no accessibility violations with the callout", async () => {
  const { screen } = await renderRegisters([enrolledRegister]);

  await expect.element(screen.getByRole("button", revokeAll)).toBeVisible();
  await expectNoAccessibilityViolations(document.body);
});

test("the callout's button opens the modal that revokes every installation", async () => {
  const { screen } = await renderRegisters([enrolledRegister]);

  await userEvent.click(screen.getByRole("button", revokeAll));

  await expect
    .element(screen.getByRole("dialog", { name: "Revocar todas las instalaciones" }))
    .toBeVisible();
});

test("a successful revocation refreshes the list and confirms how many registers were revoked", async () => {
  const services = createServices();
  vi.mocked(services.fetchRegisters).mockResolvedValueOnce({
    kind: "ok",
    value: [enrolledRegister],
  });
  vi.mocked(services.revokeEveryInstallation).mockResolvedValue({
    kind: "ok",
    value: { revokedAt: "2026-08-04T02:00:00.000Z", revokedRegisters: 1234 },
  });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Activa", { exact: true })).toBeVisible();
  vi.mocked(services.fetchRegisters).mockResolvedValueOnce({
    kind: "ok",
    value: [{ ...revokedRegister, id: enrolledRegister.id, name: enrolledRegister.name }],
  });

  await userEvent.click(screen.getByRole("button", revokeAll));
  await userEvent.click(screen.getByRole("button", { name: "Revocar todas" }));

  await expect.element(screen.getByText("Revocada", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("Se revocaron 1.234 cajas.")).toBeVisible();
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
});

test("confirms a single register revoked in the singular", async () => {
  const { services, screen } = await renderRegisters([enrolledRegister]);
  vi.mocked(services.revokeEveryInstallation).mockResolvedValue({
    kind: "ok",
    value: { revokedAt: "2026-08-04T02:00:00.000Z", revokedRegisters: 1 },
  });

  await userEvent.click(screen.getByRole("button", revokeAll));
  await userEvent.click(screen.getByRole("button", { name: "Revocar todas" }));

  await expect.element(screen.getByText("Se revocó 1 caja.")).toBeVisible();
});

test("finding no installation in service refreshes the list behind the open modal", async () => {
  const { services, screen } = await renderRegisters([enrolledRegister]);
  vi.mocked(services.revokeEveryInstallation).mockResolvedValue({
    kind: "no_active_installation",
  });
  await expect.element(screen.getByText("Activa", { exact: true })).toBeVisible();

  await userEvent.click(screen.getByRole("button", revokeAll));
  await userEvent.click(screen.getByRole("button", { name: "Revocar todas" }));

  await expect.poll(() => vi.mocked(services.fetchRegisters).mock.calls.length).toBe(2);
  await expect
    .element(screen.getByRole("dialog", { name: "Revocar todas las instalaciones" }))
    .toBeVisible();
});

test("cancelling leaves the registers as they were and revokes nothing", async () => {
  const { services, screen } = await renderRegisters([enrolledRegister]);
  await userEvent.click(screen.getByRole("button", revokeAll));

  await userEvent.click(
    screen
      .getByRole("dialog", { name: "Revocar todas las instalaciones" })
      .getByRole("button", { name: "Cancelar" }),
  );

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  expect(services.revokeEveryInstallation).not.toHaveBeenCalled();
  await expect.element(screen.getByText("Activa", { exact: true })).toBeVisible();
});
