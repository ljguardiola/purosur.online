import { expect, test, vi } from "vitest";
import type { RegisterSummary } from "./registers-api";
import {
  createServices,
  enrolledRegister,
  register1,
  renderScreen,
  revokedRegister,
} from "./test-support/registers-list-screen";

async function renderRegisters(...registers: RegisterSummary[]) {
  const services = createServices();
  vi.mocked(services.fetchRegisters).mockResolvedValue({ kind: "ok", value: registers });
  return renderScreen(services);
}

test("shows an enrolled register under its machine's name, with its installation and the Activa tag", async () => {
  const screen = await renderRegisters(enrolledRegister);

  await expect.element(screen.getByText("CAJA-MOSTRADOR")).toBeVisible();
  await expect.element(screen.getByText("Dada de alta el 01/08/2026")).toBeVisible();
  await expect.element(screen.getByText("Activa", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("Sin instalación")).not.toBeInTheDocument();
});

test("shows a register whose installation was revoked as Sin instalación, with its revocation and the Revocada tag", async () => {
  const screen = await renderRegisters(revokedRegister);

  await expect.element(screen.getByText("Sin instalación")).toBeVisible();
  await expect.element(screen.getByText("Revocada el 03/08/2026")).toBeVisible();
  await expect.element(screen.getByText("Revocada", { exact: true })).toBeVisible();
});

test("shows a register never enrolled as Sin instalación and Esperando alta", async () => {
  const screen = await renderRegisters(register1);

  await expect.element(screen.getByText("Sin instalación")).toBeVisible();
  await expect.element(screen.getByText("Esperando alta")).toBeVisible();
});
