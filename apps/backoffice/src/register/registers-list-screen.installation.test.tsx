import { expect, test, vi } from "vitest";
import type { RegisterSummary } from "./registers-api";
import {
  createServices,
  enrolledRegister,
  register1,
  register2,
  renderScreen,
  revokedRegister,
} from "./test-support/registers-list-screen";

async function renderRegisters(...registers: RegisterSummary[]) {
  const services = createServices();
  vi.mocked(services.fetchRegisters).mockResolvedValue({ kind: "ok", value: registers });
  return renderScreen(services);
}

test("shows an enrolled register under its machine's name with when it enrolled and its Windows version", async () => {
  const screen = await renderRegisters(enrolledRegister);

  await expect.element(screen.getByText("CAJA-MOSTRADOR")).toBeVisible();
  await expect.element(screen.getByText("Dada de alta el 01/08/2026")).toBeVisible();
  await expect.element(screen.getByText("Windows 11 Pro 10.0.26100")).toBeVisible();
  await expect.element(screen.getByText("Activa", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("Sin instalación")).not.toBeInTheDocument();
  await expect.element(screen.getByText("Esperando alta")).not.toBeInTheDocument();
});

test("shows a register whose installation was revoked as Revocada with when and on which machine", async () => {
  const screen = await renderRegisters(revokedRegister);

  await expect.element(screen.getByText("Revocada el 03/08/2026")).toBeVisible();
  await expect.element(screen.getByText("CAJA-DEPOSITO · Windows 10 Pro 10.0.19045")).toBeVisible();
  await expect.element(screen.getByText("Revocada", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("Sin instalación")).toBeVisible();
  await expect.element(screen.getByText("Esperando alta")).not.toBeInTheDocument();
});

test("shows a register never enrolled as Sin instalación and Esperando alta", async () => {
  const screen = await renderRegisters(register1);

  await expect.element(screen.getByText("Sin instalación")).toBeVisible();
  await expect.element(screen.getByText("Esperando alta")).toBeVisible();
  await expect.element(screen.getByText("Activa", { exact: true })).not.toBeInTheDocument();
});

test("keeps showing a pending code after the installation of a revoked register", async () => {
  const screen = await renderRegisters({ ...revokedRegister, pendingCode: register2.pendingCode });

  await expect.element(screen.getByText("Revocada el 03/08/2026")).toBeVisible();
  await expect.element(screen.getByText("Código emitido hace 4 minutos")).toBeVisible();
  await expect.element(screen.getByText("Vence en 11 minutos")).toBeVisible();
});
