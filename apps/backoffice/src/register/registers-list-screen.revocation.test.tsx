import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { accessWith } from "../shell/test-support/backoffice-access";
import type { RegisterSummary, RevokeRegisterOutcome } from "./registers-api";
import {
  createServices,
  enrolledRegister,
  register1,
  renderRegisters,
  renderScreen,
  revokedRegister,
} from "./test-support/registers-list-screen";

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

const revokeAction = { name: "Revocar por pérdida o robo la caja Caja 3" };

test("offers revoking to a person who may, only for a register with an installation in service", async () => {
  const { screen } = await renderRegisters([register1, enrolledRegister, revokedRegister]);

  await expect.element(screen.getByText("Caja 4")).toBeVisible();
  await expect.element(screen.getByRole("button", revokeAction)).toBeVisible();
  expect(
    screen.getByRole("button", { name: /^Revocar por pérdida o robo/ }).elements(),
  ).toHaveLength(1);
});

test("does not offer revoking without the capability to revoke registers", async () => {
  const { screen } = await renderRegisters(
    [enrolledRegister],
    accessWith("registers_area", "enroll_registers"),
  );

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
});

test("a success that arrives after its modal was closed refreshes the list and leaves another register's revocation open", async () => {
  const otherRegister: RegisterSummary = {
    ...enrolledRegister,
    id: "register-5",
    name: "Caja 5",
    installation: enrolledRegister.installation && {
      ...enrolledRegister.installation,
      hostname: "CAJA-ENTRADA",
    },
  };
  const { services, screen } = await renderRegisters([enrolledRegister, otherRegister]);
  const answers: ((outcome: RevokeRegisterOutcome) => void)[] = [];
  vi.mocked(services.revokeRegister).mockImplementation(
    () => new Promise((resolve) => answers.push(resolve)),
  );
  const dialog = screen.getByRole("dialog", { name: "Revocar por pérdida o robo" });
  await userEvent.click(screen.getByRole("button", revokeAction));
  await userEvent.click(dialog.getByRole("button", { name: "Revocar la caja" }));
  await userEvent.click(dialog.getByRole("button", { name: "Cerrar" }));
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await userEvent.click(
    screen.getByRole("button", { name: "Revocar por pérdida o robo la caja Caja 5" }),
  );
  await userEvent.click(dialog.getByRole("button", { name: "Revocar la caja" }));
  await expect.poll(() => answers.length).toBe(2);

  answers[0]?.({ kind: "ok", value: { revokedAt: "2026-08-04T02:00:00.000Z" } });
  await expect.poll(() => vi.mocked(services.fetchRegisters).mock.calls.length).toBe(2);
  answers[1]?.({ kind: "failed" });

  await expect.element(dialog.getByText("Caja 5 · CAJA-ENTRADA")).toBeVisible();
  await expect.element(dialog.getByText("Probá de nuevo.")).toBeVisible();
});
