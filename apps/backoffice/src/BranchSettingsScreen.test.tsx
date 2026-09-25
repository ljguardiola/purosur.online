import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../../packages/ui/src/test/axe";
import { BranchSettingsScreen, type BranchSettingsScreenServices } from "./BranchSettingsScreen";
import type { BranchSettings } from "./branchSettingsApi";

function createServices(
  overrides: Partial<BranchSettingsScreenServices> = {},
): BranchSettingsScreenServices {
  return {
    fetchBranchSettings: vi.fn(),
    saveBranchSettings: vi.fn(),
    ...overrides,
  };
}

const loaded: BranchSettings = {
  businessName: "Puro Sur",
  address: "Av. Belgrano 1450, CABA",
  whatsappNumber: "+54 9 11 3333-2211",
  instagramHandle: "@purosur.dietetica",
  weekdayHours: "9:00 a 20:00",
  saturdayHours: "9:00 a 13:30",
  sundayHours: "Cerrado",
  timezone: "America/Argentina/Buenos_Aires",
  expiringLotAlertDays: 30,
  unreviewedPriceAlertDays: 30,
  goodConditionReturnDays: 15,
  defectiveReturnDays: 180,
  version: 1,
};

function renderScreen(
  services: BranchSettingsScreenServices,
  onSessionEnded: () => void = () => {},
) {
  return render(
    <main>
      <BranchSettingsScreen onSessionEnded={onSessionEnded} services={services} />
    </main>,
  );
}

test("shows the breadcrumb, heading, and the branch's loaded values", async () => {
  const services = createServices();
  vi.mocked(services.fetchBranchSettings).mockResolvedValue({ kind: "ok", value: loaded });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Configuración")).toBeVisible();
  await expect.element(screen.getByRole("heading", { name: "Sucursal", level: 1 })).toBeVisible();
  await expect.element(screen.getByRole("textbox", { name: "Nombre" })).toHaveValue("Puro Sur");
  await expect
    .element(screen.getByRole("textbox", { name: "Dirección" }))
    .toHaveValue("Av. Belgrano 1450, CABA");
  await expect
    .element(screen.getByRole("textbox", { name: "WhatsApp" }))
    .toHaveValue("+54 9 11 3333-2211");
  await expect
    .element(screen.getByRole("textbox", { name: "Instagram" }))
    .toHaveValue("@purosur.dietetica");
  await expect
    .element(screen.getByRole("textbox", { name: "Lunes a viernes" }))
    .toHaveValue("9:00 a 20:00");
  await expect
    .element(screen.getByRole("textbox", { name: "Sábados" }))
    .toHaveValue("9:00 a 13:30");
  await expect.element(screen.getByRole("textbox", { name: "Domingos" })).toHaveValue("Cerrado");
  await expect
    .element(screen.getByRole("textbox", { name: "Zona horaria" }))
    .toHaveValue("America/Argentina/Buenos_Aires");
  await expect
    .element(screen.getByRole("textbox", { name: "Aviso de vencimiento" }))
    .toHaveValue("30");
  await expect
    .element(screen.getByRole("textbox", { name: "Precio sin revisar" }))
    .toHaveValue("30");
  await expect
    .element(screen.getByRole("textbox", { name: "Cambio en buen estado" }))
    .toHaveValue("15");
  await expect
    .element(screen.getByRole("textbox", { name: "Cambio con defecto" }))
    .toHaveValue("180");
  await expect
    .element(
      screen.getByText(
        "El plazo con defecto no puede bajar de 180 días: es el mínimo que fija la ley.",
      ),
    )
    .toBeVisible();
});

test("shows a load-error notice, and Reintentar loads the settings again", async () => {
  const services = createServices();
  vi.mocked(services.fetchBranchSettings).mockResolvedValueOnce({ kind: "failed" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No pudimos abrir la sucursal")).toBeVisible();

  vi.mocked(services.fetchBranchSettings).mockResolvedValueOnce({ kind: "ok", value: loaded });
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByRole("textbox", { name: "Nombre" })).toHaveValue("Puro Sur");
});

test("ends the session when the load finds it closed", async () => {
  const services = createServices();
  vi.mocked(services.fetchBranchSettings).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();

  await renderScreen(services, onSessionEnded);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("saves every field and the loaded version, showing the saved values", async () => {
  const services = createServices();
  vi.mocked(services.fetchBranchSettings).mockResolvedValue({ kind: "ok", value: loaded });
  vi.mocked(services.saveBranchSettings).mockResolvedValue({
    kind: "ok",
    value: { ...loaded, businessName: "Puro Sur Norte", version: 2 },
  });
  const screen = await renderScreen(services);
  await expect.element(screen.getByRole("textbox", { name: "Nombre" })).toHaveValue("Puro Sur");

  await userEvent.fill(screen.getByRole("textbox", { name: "Nombre" }), "Puro Sur Norte");
  await userEvent.click(screen.getByRole("button", { name: "Guardar los cambios" }));

  await expect.poll(() => vi.mocked(services.saveBranchSettings).mock.calls.length).toBe(1);
  expect(services.saveBranchSettings).toHaveBeenCalledWith({
    ...loaded,
    businessName: "Puro Sur Norte",
  });
  await expect
    .element(screen.getByRole("textbox", { name: "Nombre" }))
    .toHaveValue("Puro Sur Norte");
});

test("rejects a defective-return window of 179 days with an inline error, without saving", async () => {
  const services = createServices();
  vi.mocked(services.fetchBranchSettings).mockResolvedValue({ kind: "ok", value: loaded });
  const screen = await renderScreen(services);
  await expect
    .element(screen.getByRole("textbox", { name: "Cambio con defecto" }))
    .toHaveValue("180");

  await userEvent.fill(screen.getByRole("textbox", { name: "Cambio con defecto" }), "179");
  await userEvent.click(screen.getByRole("button", { name: "Guardar los cambios" }));

  await expect.element(screen.getByText("No puede ser menor a 180 días.")).toBeVisible();
  expect(services.saveBranchSettings).not.toHaveBeenCalled();
});

test("accepts a good-condition return window of exactly 0 days", async () => {
  const services = createServices();
  vi.mocked(services.fetchBranchSettings).mockResolvedValue({ kind: "ok", value: loaded });
  vi.mocked(services.saveBranchSettings).mockResolvedValue({
    kind: "ok",
    value: { ...loaded, goodConditionReturnDays: 0, version: 2 },
  });
  const screen = await renderScreen(services);
  await expect
    .element(screen.getByRole("textbox", { name: "Cambio en buen estado" }))
    .toHaveValue("15");

  await userEvent.fill(screen.getByRole("textbox", { name: "Cambio en buen estado" }), "0");
  await userEvent.click(screen.getByRole("button", { name: "Guardar los cambios" }));

  await expect.poll(() => vi.mocked(services.saveBranchSettings).mock.calls.length).toBe(1);
  expect(services.saveBranchSettings).toHaveBeenCalledWith({
    ...loaded,
    goodConditionReturnDays: 0,
  });
});

test("shows the server's timezone validation error inline on Zona horaria", async () => {
  const services = createServices();
  vi.mocked(services.fetchBranchSettings).mockResolvedValue({ kind: "ok", value: loaded });
  vi.mocked(services.saveBranchSettings).mockResolvedValue({
    kind: "validation_failed",
    field: "timezone",
  });
  const screen = await renderScreen(services);
  await expect
    .element(screen.getByRole("textbox", { name: "Zona horaria" }))
    .toHaveValue("America/Argentina/Buenos_Aires");

  await userEvent.fill(screen.getByRole("textbox", { name: "Zona horaria" }), "Not/AZone");
  await userEvent.click(screen.getByRole("button", { name: "Guardar los cambios" }));

  await expect.element(screen.getByText("Ingresá una zona horaria válida.")).toBeVisible();
});

test("shows a stale_version notice, and Recargar refetches so the second save sends the new version", async () => {
  const services = createServices();
  vi.mocked(services.fetchBranchSettings).mockResolvedValueOnce({ kind: "ok", value: loaded });
  vi.mocked(services.saveBranchSettings).mockResolvedValueOnce({ kind: "stale_version" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByRole("textbox", { name: "Nombre" })).toHaveValue("Puro Sur");

  await userEvent.fill(screen.getByRole("textbox", { name: "Nombre" }), "Puro Sur Nuevo");
  await userEvent.click(screen.getByRole("button", { name: "Guardar los cambios" }));

  await expect.element(screen.getByText("La sucursal cambió mientras la editabas")).toBeVisible();

  const reloaded: BranchSettings = { ...loaded, businessName: "Puro Sur Recargado", version: 5 };
  vi.mocked(services.fetchBranchSettings).mockResolvedValueOnce({ kind: "ok", value: reloaded });
  await userEvent.click(screen.getByRole("button", { name: "Recargar" }));

  await expect
    .element(screen.getByRole("textbox", { name: "Nombre" }))
    .toHaveValue("Puro Sur Recargado");

  vi.mocked(services.saveBranchSettings).mockResolvedValueOnce({
    kind: "ok",
    value: { ...reloaded, version: 6 },
  });
  await userEvent.click(screen.getByRole("button", { name: "Guardar los cambios" }));

  await expect.poll(() => vi.mocked(services.saveBranchSettings).mock.calls.length).toBe(2);
  expect(services.saveBranchSettings).toHaveBeenLastCalledWith(reloaded);
});

test("has no accessibility violations once loaded", async () => {
  const services = createServices();
  vi.mocked(services.fetchBranchSettings).mockResolvedValue({ kind: "ok", value: loaded });
  const screen = await renderScreen(services);
  await expect.element(screen.getByRole("heading", { name: "Sucursal", level: 1 })).toBeVisible();

  await expectNoAccessibilityViolations(document.body);
});
