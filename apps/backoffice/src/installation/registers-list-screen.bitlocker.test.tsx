import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { accessWith } from "../shell/test-support/backoffice-access";
import {
  createServices,
  enrolledRegister,
  register1,
  registerWithBitlockerKey,
  renderRegisters,
  renderScreen,
  revokedRegister,
} from "./test-support/registers-list-screen";

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

const loadAction = { name: "Cargar la clave de recuperación de BitLocker de Caja 3" };
const consultAction = { name: "Consultar la clave de recuperación de BitLocker de Caja 5" };

const KEY = "111111-222222-333333-444444-555555-666666-707707-110000";

test("offers loading the key only for an installation in service without a key", async () => {
  const { screen } = await renderRegisters([
    register1,
    enrolledRegister,
    registerWithBitlockerKey,
    revokedRegister,
  ]);

  await expect.element(screen.getByRole("button", loadAction)).toBeVisible();
  expect(
    screen
      .getByRole("button", { name: /^Cargar la clave de recuperación de BitLocker/ })
      .elements(),
  ).toHaveLength(1);
});

test("offers consulting the key only for an installation in service with a key", async () => {
  const { screen } = await renderRegisters([
    register1,
    enrolledRegister,
    registerWithBitlockerKey,
    revokedRegister,
  ]);

  await expect.element(screen.getByRole("button", consultAction)).toBeVisible();
  expect(
    screen
      .getByRole("button", { name: /^Consultar la clave de recuperación de BitLocker/ })
      .elements(),
  ).toHaveLength(1);
});

test("does not offer the key without the capability to use it", async () => {
  const { screen } = await renderRegisters(
    [enrolledRegister, registerWithBitlockerKey],
    accessWith("registers_area"),
  );

  await expect.element(screen.getByText("Caja 5")).toBeVisible();
  await expect.element(screen.getByRole("button", loadAction)).not.toBeInTheDocument();
  await expect.element(screen.getByRole("button", consultAction)).not.toBeInTheDocument();
});

test("offers neither a new register nor an enrollment code to a person who may only use the key", async () => {
  const { screen } = await renderRegisters(
    [enrolledRegister, registerWithBitlockerKey],
    accessWith("registers_area", "bitlocker_recovery_key"),
  );

  await expect.element(screen.getByRole("button", consultAction)).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Nueva caja" })).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: /^Emitir código de alta para/ }).elements(),
  ).toHaveLength(0);
});

test("says which installations have the key loaded", async () => {
  const { screen } = await renderRegisters([enrolledRegister, registerWithBitlockerKey]);

  await expect.element(screen.getByText("Windows 11 · BitLocker activo")).toBeVisible();
  expect(screen.getByText(/BitLocker activo/).elements()).toHaveLength(1);
});

test("has no accessibility violations with the key actions", async () => {
  const { screen } = await renderRegisters([enrolledRegister, registerWithBitlockerKey]);

  await expect.element(screen.getByRole("button", loadAction)).toBeVisible();
  await expectNoAccessibilityViolations(document.body);
});

test("the consult action opens the key of that register", async () => {
  const { services, screen } = await renderRegisters([enrolledRegister, registerWithBitlockerKey]);
  vi.mocked(services.consultBitlockerRecoveryKey).mockResolvedValue({
    kind: "ok",
    value: { recoveryKey: KEY, keyIdentifier: "1A2B3C4D" },
  });

  await userEvent.click(screen.getByRole("button", consultAction));

  const dialog = screen.getByRole("dialog", { name: "Clave de recuperación de BitLocker" });
  await expect.element(dialog.getByText("Identificador de la clave: 1A2B3C4D")).toBeVisible();
  expect(services.consultBitlockerRecoveryKey).toHaveBeenCalledWith("register-5");
});

test("closing the consultation leaves no key on the screen", async () => {
  const { services, screen } = await renderRegisters([registerWithBitlockerKey]);
  vi.mocked(services.consultBitlockerRecoveryKey).mockResolvedValue({
    kind: "ok",
    value: { recoveryKey: KEY, keyIdentifier: "1A2B3C4D" },
  });
  await userEvent.click(screen.getByRole("button", consultAction));
  await userEvent.click(
    screen
      .getByRole("dialog", { name: "Clave de recuperación de BitLocker" })
      .getByRole("button", { name: "Listo" }),
  );

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect
    .element(screen.getByText("Identificador de la clave: 1A2B3C4D"))
    .not.toBeInTheDocument();
});

test("the load action opens the loading of that register's key", async () => {
  const { screen } = await renderRegisters([register1, enrolledRegister]);

  await userEvent.click(screen.getByRole("button", loadAction));

  const dialog = screen.getByRole("dialog", { name: "Cargar clave de recuperación de BitLocker" });
  await expect.element(dialog.getByText("Caja 3 · CAJA-MOSTRADOR")).toBeVisible();
});

test("a loaded key is shown as active once the list reads again", async () => {
  const services = createServices();
  vi.mocked(services.fetchRegisters).mockResolvedValueOnce({
    kind: "ok",
    value: [enrolledRegister],
  });
  vi.mocked(services.loadBitlockerRecoveryKey).mockResolvedValue({ kind: "ok" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByRole("button", loadAction)).toBeVisible();
  vi.mocked(services.fetchRegisters).mockResolvedValueOnce({
    kind: "ok",
    value: [
      {
        ...enrolledRegister,
        installation: {
          state: "enrolled",
          hostname: "CAJA-MOSTRADOR",
          windowsVersion: "Windows 11 Pro 10.0.26100",
          enrolledAt: "2026-08-02T01:30:00.000Z",
          bitlockerKeyLoaded: true,
        },
      },
    ],
  });

  await userEvent.click(screen.getByRole("button", loadAction));
  const dialog = screen.getByRole("dialog", { name: "Cargar clave de recuperación de BitLocker" });
  await userEvent.fill(
    dialog.getByRole("textbox", { name: /^Clave de recuperación de BitLocker/ }),
    KEY,
  );
  await userEvent.fill(
    dialog.getByRole("textbox", { name: /^Identificador de la clave/ }),
    "1A2B3C4D",
  );
  await userEvent.click(dialog.getByRole("button", { name: "Guardar la clave" }));

  await expect
    .element(screen.getByText("Windows 11 Pro 10.0.26100 · BitLocker activo"))
    .toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: /^Consultar la clave de recuperación/ }))
    .toBeVisible();
  expect(screen.getByRole("dialog").query()).toBeNull();
});
