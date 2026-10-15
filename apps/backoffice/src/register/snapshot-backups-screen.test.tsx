import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import type { SnapshotBackups } from "./snapshot-backups-api";
import {
  backups,
  caja1,
  caja2,
  createServices,
  declaredGeneration,
  deferred,
  failedGeneration,
  grantAuthorization,
  lostGeneration,
  renderScreen,
  verifiedGeneration,
  verifyingGeneration,
} from "./test-support/snapshot-backups-screen";

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

function servicesWithBackups(read: SnapshotBackups = backups) {
  const services = createServices();
  vi.mocked(services.fetchSnapshotBackupRegisters).mockResolvedValue({
    kind: "ok",
    value: [caja1, caja2],
  });
  vi.mocked(services.fetchSnapshotBackups).mockResolvedValue({ kind: "ok", value: read });
  return services;
}

test("shows the breadcrumb, the heading and the actions", async () => {
  const screen = await renderScreen(servicesWithBackups());

  await expect.element(screen.getByText("Configuración")).toBeVisible();
  await expect.element(screen.getByRole("heading", { name: "Backups", level: 1 })).toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "Rotar la clave de cifrado" }))
    .toBeEnabled();
  await expect.element(screen.getByRole("button", { name: "Cambiar las reglas" })).toBeEnabled();
});

test("reads the first register's backups when the URL names none", async () => {
  const services = servicesWithBackups();

  const screen = await renderScreen(services);

  await expect.element(screen.getByRole("button", { name: /^Caja: Caja 1/ })).toBeVisible();
  await expect
    .element(screen.getByRole("table", { name: "Últimas generaciones de Caja 1" }))
    .toBeVisible();
  expect(services.fetchSnapshotBackups).toHaveBeenCalledWith("register-1");
});

test("shows each generation's date in Argentina, where it is kept, its size and its state", async () => {
  const services = servicesWithBackups({
    ...backups,
    generations: [verifiedGeneration, failedGeneration],
  });

  const screen = await renderScreen(services);

  await expect.element(screen.getByRole("columnheader", { name: "Generada" })).toBeVisible();
  await expect.element(screen.getByRole("columnheader", { name: "Dónde" })).toBeVisible();
  await expect.element(screen.getByRole("columnheader", { name: "Tamaño" })).toBeVisible();
  await expect.element(screen.getByRole("columnheader", { name: "Estado" })).toBeVisible();
  await expect.element(screen.getByText("16/09/2026 12:55")).toBeVisible();
  await expect.element(screen.getByText("185 MB")).toBeVisible();
  await expect.element(screen.getByText("16/09/2026 12:45")).toBeVisible();
  await expect.element(screen.getByText("184 MB")).toBeVisible();
});

test("says where each generation is kept", async () => {
  const screen = await renderScreen(
    servicesWithBackups({
      ...backups,
      generations: [verifiedGeneration, failedGeneration, declaredGeneration, lostGeneration],
    }),
  );

  await expect.element(screen.getByText("Disco y bucket")).toBeVisible();
  await expect.element(screen.getByText("Solo bucket")).toBeVisible();
  await expect.element(screen.getByText("Solo disco")).toBeVisible();
  await expect.element(screen.getByText("En ningún lado")).toBeVisible();
});

test("tells a verified generation from one that failed, and says the failed one does not count for a restore", async () => {
  const screen = await renderScreen(
    servicesWithBackups({ ...backups, generations: [verifiedGeneration, failedGeneration] }),
  );

  await expect.element(screen.getByText("Verificada")).toBeVisible();
  await expect.element(screen.getByText("No pasó la verificación")).toBeVisible();
  await expect.element(screen.getByText("No cuenta para restaurar")).toBeVisible();
});

test("shows a generation that is declared or uploaded but not verified yet as being verified", async () => {
  const screen = await renderScreen(
    servicesWithBackups({
      ...backups,
      generations: [declaredGeneration, verifyingGeneration],
    }),
  );

  await expect.element(screen.getByText("16/09/2026 13:05")).toBeVisible();
  await expect.element(screen.getByText("16/09/2026 13:00")).toBeVisible();
  expect(screen.getByText("Verificando").elements()).toHaveLength(2);
  expect(screen.getByText("Verificada").query()).toBeNull();
});

test("shows how many generations each tier keeps and the rules that bound it", async () => {
  const screen = await renderScreen(servicesWithBackups());

  await expect.element(screen.getByText("Recientes")).toBeVisible();
  await expect.element(screen.getByText("5 de 6", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("Las 6 más nuevas")).toBeVisible();
  await expect.element(screen.getByText("Por hora")).toBeVisible();
  await expect.element(screen.getByText("24", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("Últimas 24 horas")).toBeVisible();
  await expect.element(screen.getByText("Diarias")).toBeVisible();
  await expect.element(screen.getByText("30", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("Últimos 30 días")).toBeVisible();
  await expect.element(screen.getByText("Mensuales")).toBeVisible();
  await expect.element(screen.getByText("2", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("Hasta 12 meses")).toBeVisible();
});

test("reads the singular of each rule in the tier captions", async () => {
  const screen = await renderScreen(
    servicesWithBackups({ ...backups, rules: { hourly: 1, daily: 1, monthly: 1 } }),
  );

  await expect.element(screen.getByText("Última hora")).toBeVisible();
  await expect.element(screen.getByText("Último día")).toBeVisible();
  await expect.element(screen.getByText("Hasta 1 mes")).toBeVisible();
});

test("shows the backups of the register the URL names", async () => {
  const services = servicesWithBackups();

  const screen = await renderScreen(services, { register: "register-2" });

  await expect.element(screen.getByRole("button", { name: /^Caja: Caja 2/ })).toBeVisible();
  await expect
    .element(screen.getByRole("table", { name: "Últimas generaciones de Caja 2" }))
    .toBeVisible();
  expect(services.fetchSnapshotBackups).toHaveBeenCalledWith("register-2");
  expect(services.fetchSnapshotBackups).not.toHaveBeenCalledWith("register-1");
});

test("choosing a register reports it so the URL carries it", async () => {
  const onRegisterChange = vi.fn();
  const screen = await renderScreen(servicesWithBackups(), { onRegisterChange });

  await userEvent.click(screen.getByRole("button", { name: /^Caja:/ }));
  await userEvent.click(screen.getByRole("option", { name: "Caja 2" }));

  expect(onRegisterChange).toHaveBeenCalledWith("register-2");
});

test("goes back to the first register when the URL names one the cloud does not list", async () => {
  const onRegisterChange = vi.fn();
  const services = servicesWithBackups();

  const screen = await renderScreen(services, { register: "register-9", onRegisterChange });

  await expect.element(screen.getByRole("button", { name: /^Caja: Caja 1/ })).toBeVisible();
  await expect.poll(() => onRegisterChange.mock.calls).toEqual([[""]]);
  expect(services.fetchSnapshotBackups).not.toHaveBeenCalledWith("register-9");
});

test("shows an empty state, and offers no action on a register, when there are no registers", async () => {
  const services = createServices();
  vi.mocked(services.fetchSnapshotBackupRegisters).mockResolvedValue({ kind: "ok", value: [] });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Todavía no hay cajas registradoras")).toBeVisible();
  await expect
    .element(screen.getByText("Los backups aparecen cuando una caja se da de alta."))
    .toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "Rotar la clave de cifrado" }))
    .toBeDisabled();
  expect(services.fetchSnapshotBackups).not.toHaveBeenCalled();
});

test("shows an empty table for a register that has not generated any backup yet", async () => {
  const screen = await renderScreen(
    servicesWithBackups({
      rules: backups.rules,
      tiers: { recent: 0, hourly: 0, daily: 0, monthly: 0 },
      recentLimit: 6,
      generations: [],
    }),
  );

  await expect.element(screen.getByText("Esta caja todavía no generó backups")).toBeVisible();
});

test("shows loading placeholders while the registers load", async () => {
  const services = createServices();
  const registers = deferred<Awaited<ReturnType<typeof services.fetchSnapshotBackupRegisters>>>();
  vi.mocked(services.fetchSnapshotBackupRegisters).mockReturnValueOnce(registers.promise);
  vi.mocked(services.fetchSnapshotBackups).mockResolvedValue({ kind: "ok", value: backups });

  const screen = await renderScreen(services);

  await expect.element(screen.getByRole("table")).toHaveAttribute("aria-busy", "true");
  expect(screen.getByText("Todavía no hay cajas registradoras").query()).toBeNull();
  registers.resolve({ kind: "ok", value: [caja1] });
  await expect.element(screen.getByText("Verificada")).toBeVisible();
});

test("shows loading placeholders while a register's backups load", async () => {
  const services = createServices();
  const read = deferred<Awaited<ReturnType<typeof services.fetchSnapshotBackups>>>();
  vi.mocked(services.fetchSnapshotBackupRegisters).mockResolvedValue({
    kind: "ok",
    value: [caja1],
  });
  vi.mocked(services.fetchSnapshotBackups).mockReturnValueOnce(read.promise);

  const screen = await renderScreen(services);

  await expect.element(screen.getByRole("table")).toHaveAttribute("aria-busy", "true");
  await expect.element(screen.getByRole("button", { name: /^Caja: Caja 1/ })).toBeVisible();
  read.resolve({ kind: "ok", value: backups });
  await expect.element(screen.getByText("Verificada")).toBeVisible();
});

test("the actions that need the backups stay disabled while they load and after they fail to load", async () => {
  const services = createServices();
  const read = deferred<Awaited<ReturnType<typeof services.fetchSnapshotBackups>>>();
  vi.mocked(services.fetchSnapshotBackupRegisters).mockResolvedValue({
    kind: "ok",
    value: [caja1],
  });
  vi.mocked(services.fetchSnapshotBackups).mockReturnValueOnce(read.promise);
  const screen = await renderScreen(services);

  await expect.element(screen.getByRole("button", { name: "Cambiar las reglas" })).toBeDisabled();
  await expect
    .element(screen.getByRole("button", { name: "Rotar la clave de cifrado" }))
    .toBeDisabled();

  read.resolve({ kind: "failed" });
  await expect.element(screen.getByText("No pudimos abrir los backups")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Cambiar las reglas" })).toBeDisabled();
  await expect
    .element(screen.getByRole("button", { name: "Rotar la clave de cifrado" }))
    .toBeDisabled();
});

test("shows a load error with a retry that starts again from the placeholders when the registers fail to load", async () => {
  const services = createServices();
  const retry = deferred<Awaited<ReturnType<typeof services.fetchSnapshotBackupRegisters>>>();
  vi.mocked(services.fetchSnapshotBackupRegisters)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockReturnValueOnce(retry.promise);
  vi.mocked(services.fetchSnapshotBackups).mockResolvedValue({ kind: "ok", value: backups });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No pudimos abrir los backups")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByText("No pudimos abrir los backups")).not.toBeInTheDocument();
  retry.resolve({ kind: "ok", value: [caja1] });
  await expect.element(screen.getByText("Verificada")).toBeVisible();
});

test("shows a load error and no figures when a register's backups fail to load", async () => {
  const services = createServices();
  vi.mocked(services.fetchSnapshotBackupRegisters).mockResolvedValue({
    kind: "ok",
    value: [caja1],
  });
  vi.mocked(services.fetchSnapshotBackups).mockResolvedValue({ kind: "failed" });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("No pudimos abrir los backups")).toBeVisible();
  expect(screen.getByText("Recientes").query()).toBeNull();
});

test("shows the rate-limited notice with a retry action", async () => {
  const services = createServices();
  vi.mocked(services.fetchSnapshotBackupRegisters).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 120,
  });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(screen.getByText("Se puede volver a intentar en 2 minutos.")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Reintentar" })).toBeVisible();
});

test("navigates to Mi cuenta when a read comes back forbidden", async () => {
  window.history.pushState(null, "", "/backups");
  const services = createServices();
  vi.mocked(services.fetchSnapshotBackupRegisters).mockResolvedValue({ kind: "forbidden" });

  await renderScreen(services);

  await expect.poll(() => window.location.pathname).toBe("/account");
});

test("ends the session when a read finds no open session", async () => {
  const services = createServices();
  vi.mocked(services.fetchSnapshotBackupRegisters).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();

  await renderScreen(services, { onSessionEnded });

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("Cambiar las reglas opens the modal with the rules in force, and cancel closes it without calling the cloud", async () => {
  const services = servicesWithBackups();
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Verificada")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Cambiar las reglas" }));

  const dialog = screen.getByRole("dialog", { name: "Cambiar las reglas" });
  await expect.element(dialog.getByRole("textbox", { name: /^Por hora/ })).toHaveValue("24");
  await userEvent.click(dialog.getByRole("button", { name: "Cancelar" }));
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  expect(services.changeSnapshotLifecycleRules).not.toHaveBeenCalled();
});

test("changing the rules closes the modal, reads the backups again and says the rules changed", async () => {
  const services = servicesWithBackups();
  vi.mocked(services.changeSnapshotLifecycleRules).mockResolvedValue({
    kind: "ok",
    value: { hourly: 48, daily: 30, monthly: 12 },
  });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Últimas 24 horas")).toBeVisible();
  vi.mocked(services.fetchSnapshotBackups).mockResolvedValue({
    kind: "ok",
    value: { ...backups, rules: { hourly: 48, daily: 30, monthly: 12 } },
  });

  await userEvent.click(screen.getByRole("button", { name: "Cambiar las reglas" }));
  const dialog = screen.getByRole("dialog", { name: "Cambiar las reglas" });
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Por hora/ }), "48");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar las reglas" }));

  await expect.element(screen.getByText("Reglas cambiadas")).toBeVisible();
  await expect.element(screen.getByText("Últimas 48 horas")).toBeVisible();
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
});

test("Rotar la clave de cifrado opens the modal naming the register being shown", async () => {
  const services = servicesWithBackups();
  const screen = await renderScreen(services, { register: "register-2" });
  await expect.element(screen.getByText("Verificada")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Rotar la clave de cifrado" }));

  const dialog = screen.getByRole("dialog", { name: "Rotar la clave de cifrado" });
  await expect.element(dialog.getByText(/Caja 2/)).toBeVisible();
  await userEvent.click(dialog.getByRole("button", { name: "Cancelar" }));
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  expect(services.rotateSnapshotKey).not.toHaveBeenCalled();
});

test("rotating the key closes the modal and says which version the register's next generations use", async () => {
  const services = servicesWithBackups();
  vi.mocked(services.rotateSnapshotKey).mockResolvedValue({ kind: "ok", value: { keyVersion: 3 } });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Verificada")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Rotar la clave de cifrado" }));
  await userEvent.click(
    screen
      .getByRole("dialog", { name: "Rotar la clave de cifrado" })
      .getByRole("button", { name: "Rotar la clave" }),
  );

  await expect.element(screen.getByText("Clave rotada")).toBeVisible();
  await expect
    .element(
      screen.getByText(
        "Las próximas generaciones de Caja 1 se cifran con la versión 3 de su clave.",
      ),
    )
    .toBeVisible();
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  expect(services.rotateSnapshotKey).toHaveBeenCalledWith("register-1");
});

test("a register the cloud no longer knows closes the rotation and reads the registers again", async () => {
  const services = servicesWithBackups();
  vi.mocked(services.rotateSnapshotKey).mockResolvedValue({ kind: "not_found" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Verificada")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Rotar la clave de cifrado" }));
  await userEvent.click(
    screen
      .getByRole("dialog", { name: "Rotar la clave de cifrado" })
      .getByRole("button", { name: "Rotar la clave" }),
  );

  await expect
    .poll(() => vi.mocked(services.fetchSnapshotBackupRegisters).mock.calls.length)
    .toBe(2);
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
});

test("rotating asks for the passkey when the cloud requires a fresh authorization", async () => {
  const services = servicesWithBackups();
  vi.mocked(services.rotateSnapshotKey).mockResolvedValueOnce({ kind: "authorization_required" });
  grantAuthorization(services);
  vi.mocked(services.rotateSnapshotKey).mockResolvedValueOnce({
    kind: "ok",
    value: { keyVersion: 2 },
  });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Verificada")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Rotar la clave de cifrado" }));
  await userEvent.click(
    screen
      .getByRole("dialog", { name: "Rotar la clave de cifrado" })
      .getByRole("button", { name: "Rotar la clave" }),
  );
  await userEvent.click(
    screen
      .getByRole("dialog", { name: "Autorizá este cambio" })
      .getByRole("button", { name: "Usar mi passkey" }),
  );

  await expect.element(screen.getByText("Clave rotada")).toBeVisible();
});

test("has no accessibility violations once loaded and with each modal open", async () => {
  const screen = await renderScreen(servicesWithBackups());
  await expect.element(screen.getByText("Verificada")).toBeVisible();
  await expectNoAccessibilityViolations(document.body);

  await userEvent.click(screen.getByRole("button", { name: "Cambiar las reglas" }));
  await expect.element(screen.getByRole("dialog", { name: "Cambiar las reglas" })).toBeVisible();
  await expectNoAccessibilityViolations(document.body);
});
