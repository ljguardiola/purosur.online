import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { createServices, register1, renderScreen } from "./test-support/registers-list-screen";

const WARNING = "Hay acciones de la caja que nadie del local puede hacer";

test("warns about the register actions nobody at the branch can do, below the registers", async () => {
  const services = createServices();
  vi.mocked(services.fetchRegisters).mockResolvedValue({ kind: "ok", value: [register1] });
  vi.mocked(services.fetchRegisterCoverage).mockResolvedValue({
    kind: "ok",
    value: ["void_sale", "correct_register_clock"],
  });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText(WARNING)).toBeVisible();
  await expect.element(screen.getByText(/Nadie puede anular ventas\./)).toBeVisible();
  const table = screen.getByRole("table", { name: "Cajas registradoras" }).element();
  const warning = screen.getByText(WARNING).element();
  expect(table.compareDocumentPosition(warning) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

test("shows no warning while every register action is covered", async () => {
  const services = createServices();
  vi.mocked(services.fetchRegisters).mockResolvedValue({ kind: "ok", value: [register1] });
  vi.mocked(services.fetchRegisterCoverage).mockResolvedValue({ kind: "ok", value: [] });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Caja 1")).toBeVisible();
  await expect.element(screen.getByText(WARNING)).not.toBeInTheDocument();
});

test("the warning goes away on its own once the coverage is read again with the action covered", async () => {
  const services = createServices();
  vi.mocked(services.fetchRegisters).mockResolvedValue({ kind: "ok", value: [register1] });
  vi.mocked(services.fetchRegisterCoverage)
    .mockResolvedValueOnce({ kind: "ok", value: ["void_sale"] })
    .mockResolvedValue({ kind: "ok", value: [] });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText(WARNING)).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Refrescar" }));

  await expect.element(screen.getByText(WARNING)).not.toBeInTheDocument();
  await expect.element(screen.getByText("Caja 1")).toBeVisible();
});

test("never blocks creating a register while the warning shows", async () => {
  const services = createServices();
  vi.mocked(services.fetchRegisters).mockResolvedValue({ kind: "ok", value: [register1] });
  vi.mocked(services.fetchRegisterCoverage).mockResolvedValue({
    kind: "ok",
    value: ["void_sale"],
  });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText(WARNING)).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Nueva caja" }));

  await expect.element(screen.getByRole("dialog")).toBeVisible();
});

test("a failed coverage read keeps the registers listed, and Reintentar reads it again", async () => {
  const services = createServices();
  vi.mocked(services.fetchRegisters).mockResolvedValue({ kind: "ok", value: [register1] });
  vi.mocked(services.fetchRegisterCoverage)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockResolvedValue({ kind: "ok", value: ["void_sale"] });
  const screen = await renderScreen(services);

  await expect
    .element(screen.getByText("No pudimos abrir las acciones de la caja sin cubrir"))
    .toBeInTheDocument();
  await expect.element(screen.getByText("Caja 1")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByText(WARNING)).toBeVisible();
});

test("has no accessibility violations with the warning shown", async () => {
  const services = createServices();
  vi.mocked(services.fetchRegisters).mockResolvedValue({ kind: "ok", value: [register1] });
  vi.mocked(services.fetchRegisterCoverage).mockResolvedValue({
    kind: "ok",
    value: ["void_sale", "correct_register_clock"],
  });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText(WARNING)).toBeVisible();

  await expectNoAccessibilityViolations(document.body);
});
