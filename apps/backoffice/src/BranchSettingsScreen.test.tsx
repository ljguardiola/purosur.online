import { expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
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
  address: "Av. Belgrano 1450, CABA",
  whatsappNumber: "+54 9 11 3333-2211",
  instagramHandle: "@purosur.dietetica",
  weekdayHours: { opensAt: "09:00", closesAt: "20:00" },
  saturdayHours: { opensAt: "09:00", closesAt: "13:30" },
  sundayHours: null,
  expiringLotAlertDays: 30,
  unreviewedPriceAlertDays: 30,
  goodConditionReturnDays: 15,
  version: 1,
};

// The visible label text an input's own associated <label> carries, independent of whatever an
// external heading adds to its accessible name through `aria-labelledby` (see TextField.tsx's own
// `labelledBy` prop): proves the row heading isn't repeated inside each field's own visible label.
function visibleLabelText(input: HTMLInputElement): string {
  return input.labels?.[0]?.textContent ?? "";
}

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
  await expect
    .element(screen.getByRole("textbox", { name: "Dirección" }))
    .toHaveValue("Av. Belgrano 1450, CABA");
  await expect
    .element(screen.getByRole("textbox", { name: "WhatsApp" }))
    .toHaveValue("+54 9 11 3333-2211");
  await expect
    .element(screen.getByRole("textbox", { name: "Instagram" }))
    .toHaveValue("@purosur.dietetica");
  await expect.element(screen.getByText("Lunes a viernes")).toBeVisible();
  await expect
    .element(screen.getByRole("textbox", { name: "Lunes a viernes Abre" }))
    .toHaveValue("09:00");
  await expect
    .element(screen.getByRole("textbox", { name: "Lunes a viernes Cierra" }))
    .toHaveValue("20:00");
  expect(
    visibleLabelText(
      screen.getByRole("textbox", { name: "Lunes a viernes Abre" }).element() as HTMLInputElement,
    ),
  ).toBe("Abre");
  expect(
    visibleLabelText(
      screen.getByRole("textbox", { name: "Lunes a viernes Cierra" }).element() as HTMLInputElement,
    ),
  ).toBe("Cierra");
  await expect
    .element(screen.getByRole("checkbox", { name: "Lunes a viernes — Cerrado" }))
    .not.toBeChecked();
  await expect.element(screen.getByText("Sábados")).toBeVisible();
  await expect.element(screen.getByRole("textbox", { name: "Sábados Abre" })).toHaveValue("09:00");
  await expect
    .element(screen.getByRole("textbox", { name: "Sábados Cierra" }))
    .toHaveValue("13:30");
  await expect
    .element(screen.getByRole("checkbox", { name: "Sábados — Cerrado" }))
    .not.toBeChecked();
  await expect.element(screen.getByText("Domingos")).toBeVisible();
  await expect.element(screen.getByRole("textbox", { name: "Domingos Abre" })).toHaveValue("");
  await expect.element(screen.getByRole("textbox", { name: "Domingos Abre" })).toBeDisabled();
  await expect.element(screen.getByRole("textbox", { name: "Domingos Cierra" })).toHaveValue("");
  await expect.element(screen.getByRole("textbox", { name: "Domingos Cierra" })).toBeDisabled();
  await expect.element(screen.getByRole("checkbox", { name: "Domingos — Cerrado" })).toBeChecked();
  await expect
    .element(screen.getByRole("textbox", { name: "Aviso de vencimiento" }))
    .toHaveValue("30");
  await expect
    .element(screen.getByRole("textbox", { name: "Precio sin revisar" }))
    .toHaveValue("30");
  await expect
    .element(screen.getByRole("textbox", { name: "Cambio en buen estado" }))
    .toHaveValue("15");
  expect(screen.getByRole("textbox", { name: "Nombre" }).query()).toBeNull();
  expect(screen.getByRole("textbox", { name: "Zona horaria" }).query()).toBeNull();
  expect(screen.getByRole("textbox", { name: "Cambio con defecto" }).query()).toBeNull();
});

test("shows a load-error notice, and Reintentar loads the settings again", async () => {
  const services = createServices();
  vi.mocked(services.fetchBranchSettings).mockResolvedValueOnce({ kind: "failed" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No pudimos abrir la sucursal")).toBeVisible();

  vi.mocked(services.fetchBranchSettings).mockResolvedValueOnce({ kind: "ok", value: loaded });
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect
    .element(screen.getByRole("textbox", { name: "Dirección" }))
    .toHaveValue("Av. Belgrano 1450, CABA");
});

test("ends the session when the load finds it closed", async () => {
  const services = createServices();
  vi.mocked(services.fetchBranchSettings).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();

  await renderScreen(services, onSessionEnded);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("navigates to Mi cuenta when the load comes back forbidden", async () => {
  window.history.pushState(null, "", "/settings/branch");
  const services = createServices();
  vi.mocked(services.fetchBranchSettings).mockResolvedValue({ kind: "forbidden" });

  await renderScreen(services);

  await expect.poll(() => window.location.pathname).toBe("/settings/users/me");
  window.history.pushState(null, "", "/");
});

test("navigates to Mi cuenta when the save comes back forbidden", async () => {
  window.history.pushState(null, "", "/settings/branch");
  const services = createServices();
  vi.mocked(services.fetchBranchSettings).mockResolvedValue({ kind: "ok", value: loaded });
  vi.mocked(services.saveBranchSettings).mockResolvedValue({ kind: "forbidden" });
  const screen = await renderScreen(services);
  await expect
    .element(screen.getByRole("textbox", { name: "Dirección" }))
    .toHaveValue("Av. Belgrano 1450, CABA");

  await userEvent.click(screen.getByRole("button", { name: "Guardar los cambios" }));

  await expect.poll(() => window.location.pathname).toBe("/settings/users/me");
  window.history.pushState(null, "", "/");
});

test("navigates to Mi cuenta when Recargar comes back forbidden", async () => {
  window.history.pushState(null, "", "/settings/branch");
  const services = createServices();
  vi.mocked(services.fetchBranchSettings).mockResolvedValueOnce({ kind: "ok", value: loaded });
  vi.mocked(services.saveBranchSettings).mockResolvedValue({ kind: "stale_version" });
  const screen = await renderScreen(services);
  await expect
    .element(screen.getByRole("textbox", { name: "Dirección" }))
    .toHaveValue("Av. Belgrano 1450, CABA");
  await userEvent.click(screen.getByRole("button", { name: "Guardar los cambios" }));
  await expect.element(screen.getByText("La sucursal cambió mientras la editabas")).toBeVisible();

  vi.mocked(services.fetchBranchSettings).mockResolvedValueOnce({ kind: "forbidden" });
  await userEvent.click(screen.getByRole("button", { name: "Recargar" }));

  await expect.poll(() => window.location.pathname).toBe("/settings/users/me");
  window.history.pushState(null, "", "/");
});

test("saves every field and the loaded version, showing the saved values", async () => {
  const services = createServices();
  vi.mocked(services.fetchBranchSettings).mockResolvedValue({ kind: "ok", value: loaded });
  vi.mocked(services.saveBranchSettings).mockResolvedValue({
    kind: "ok",
    value: { ...loaded, address: "Av. Belgrano 1500, CABA", version: 2 },
  });
  const screen = await renderScreen(services);
  await expect
    .element(screen.getByRole("textbox", { name: "Dirección" }))
    .toHaveValue("Av. Belgrano 1450, CABA");

  await userEvent.fill(
    screen.getByRole("textbox", { name: "Dirección" }),
    "Av. Belgrano 1500, CABA",
  );
  await userEvent.click(screen.getByRole("button", { name: "Guardar los cambios" }));

  await expect.poll(() => vi.mocked(services.saveBranchSettings).mock.calls.length).toBe(1);
  expect(services.saveBranchSettings).toHaveBeenCalledWith({
    ...loaded,
    address: "Av. Belgrano 1500, CABA",
  });
  await expect
    .element(screen.getByRole("textbox", { name: "Dirección" }))
    .toHaveValue("Av. Belgrano 1500, CABA");
});

test("checking Cerrado on a group disables and clears its Abre/Cierra fields, and saves it as closed", async () => {
  const services = createServices();
  vi.mocked(services.fetchBranchSettings).mockResolvedValue({ kind: "ok", value: loaded });
  vi.mocked(services.saveBranchSettings).mockResolvedValue({
    kind: "ok",
    value: { ...loaded, weekdayHours: null, version: 2 },
  });
  const screen = await renderScreen(services);
  await expect
    .element(screen.getByRole("textbox", { name: "Lunes a viernes Abre" }))
    .toHaveValue("09:00");

  // A custom checkbox's decorative box sits visually above its own native input (see
  // Checkbox.test.tsx's own checkboxBox helper for the same overlap), so the click is forced.
  await screen.getByRole("checkbox", { name: "Lunes a viernes — Cerrado" }).click({ force: true });

  await expect
    .element(screen.getByRole("textbox", { name: "Lunes a viernes Abre" }))
    .toHaveValue("");
  await expect
    .element(screen.getByRole("textbox", { name: "Lunes a viernes Abre" }))
    .toBeDisabled();
  await userEvent.click(screen.getByRole("button", { name: "Guardar los cambios" }));

  await expect.poll(() => vi.mocked(services.saveBranchSettings).mock.calls.length).toBe(1);
  expect(services.saveBranchSettings).toHaveBeenCalledWith({ ...loaded, weekdayHours: null });
});

test("unchecking Cerrado brings back the times the group had before it was checked", async () => {
  const services = createServices();
  vi.mocked(services.fetchBranchSettings).mockResolvedValue({ kind: "ok", value: loaded });
  vi.mocked(services.saveBranchSettings).mockResolvedValue({ kind: "ok", value: loaded });
  const screen = await renderScreen(services);
  await expect
    .element(screen.getByRole("textbox", { name: "Lunes a viernes Abre" }))
    .toHaveValue("09:00");
  await userEvent.fill(screen.getByRole("textbox", { name: "Lunes a viernes Cierra" }), "21:30");

  await screen.getByRole("checkbox", { name: "Lunes a viernes — Cerrado" }).click({ force: true });
  await expect
    .element(screen.getByRole("textbox", { name: "Lunes a viernes Abre" }))
    .toBeDisabled();
  await screen.getByRole("checkbox", { name: "Lunes a viernes — Cerrado" }).click({ force: true });

  await expect
    .element(screen.getByRole("textbox", { name: "Lunes a viernes Abre" }))
    .toHaveValue("09:00");
  await expect
    .element(screen.getByRole("textbox", { name: "Lunes a viernes Cierra" }))
    .toHaveValue("21:30");
  await expect.element(screen.getByRole("textbox", { name: "Lunes a viernes Abre" })).toBeEnabled();
  await userEvent.click(screen.getByRole("button", { name: "Guardar los cambios" }));

  await expect.poll(() => vi.mocked(services.saveBranchSettings).mock.calls.length).toBe(1);
  expect(services.saveBranchSettings).toHaveBeenCalledWith({
    ...loaded,
    weekdayHours: { opensAt: "09:00", closesAt: "21:30" },
  });
});

test("accepts a single-digit hour like 9:00 and sends it zero-padded", async () => {
  const services = createServices();
  vi.mocked(services.fetchBranchSettings).mockResolvedValue({
    kind: "ok",
    value: { ...loaded, sundayHours: null },
  });
  vi.mocked(services.saveBranchSettings).mockResolvedValue({ kind: "ok", value: loaded });
  const screen = await renderScreen(services);
  await screen.getByRole("checkbox", { name: "Domingos — Cerrado" }).click({ force: true });
  await userEvent.fill(screen.getByRole("textbox", { name: "Domingos Abre" }), "9:00");
  await userEvent.fill(screen.getByRole("textbox", { name: "Domingos Cierra" }), "13:00");

  await userEvent.click(screen.getByRole("button", { name: "Guardar los cambios" }));

  await expect.poll(() => vi.mocked(services.saveBranchSettings).mock.calls.length).toBe(1);
  expect(services.saveBranchSettings).toHaveBeenCalledWith({
    ...loaded,
    sundayHours: { opensAt: "09:00", closesAt: "13:00" },
  });
});

test("rejects an hours group whose closing time isn't later than opening, with an inline error, without saving", async () => {
  const services = createServices();
  vi.mocked(services.fetchBranchSettings).mockResolvedValue({ kind: "ok", value: loaded });
  const screen = await renderScreen(services);
  await expect
    .element(screen.getByRole("textbox", { name: "Lunes a viernes Cierra" }))
    .toHaveValue("20:00");

  await userEvent.fill(screen.getByRole("textbox", { name: "Lunes a viernes Cierra" }), "08:00");
  await userEvent.click(screen.getByRole("button", { name: "Guardar los cambios" }));

  await expect
    .element(screen.getByRole("textbox", { name: "Lunes a viernes Cierra" }))
    .toHaveAccessibleDescription("La hora de cierre tiene que ser posterior a la de apertura.");
  await expect
    .element(screen.getByRole("textbox", { name: "Lunes a viernes Abre" }))
    .not.toHaveAttribute("aria-invalid", "true");
  expect(services.saveBranchSettings).not.toHaveBeenCalled();
});

test("rejects an empty opening time with a time-format error on Abre alone, without saving", async () => {
  const services = createServices();
  vi.mocked(services.fetchBranchSettings).mockResolvedValue({ kind: "ok", value: loaded });
  const screen = await renderScreen(services);
  await expect
    .element(screen.getByRole("textbox", { name: "Lunes a viernes Abre" }))
    .toHaveValue("09:00");

  await userEvent.clear(screen.getByRole("textbox", { name: "Lunes a viernes Abre" }));
  await userEvent.click(screen.getByRole("button", { name: "Guardar los cambios" }));

  await expect
    .element(screen.getByRole("textbox", { name: "Lunes a viernes Abre" }))
    .toHaveAccessibleDescription("Ingresá la hora como 9:00 o 21:30.");
  await expect
    .element(screen.getByRole("textbox", { name: "Lunes a viernes Cierra" }))
    .not.toHaveAttribute("aria-invalid", "true");
  expect(
    screen.getByText("La hora de cierre tiene que ser posterior a la de apertura.").query(),
  ).toBeNull();
  expect(services.saveBranchSettings).not.toHaveBeenCalled();
});

test("rejects an out-of-range closing time like 25:00 with a time-format error on Cierra alone", async () => {
  const services = createServices();
  vi.mocked(services.fetchBranchSettings).mockResolvedValue({ kind: "ok", value: loaded });
  const screen = await renderScreen(services);
  await expect
    .element(screen.getByRole("textbox", { name: "Sábados Cierra" }))
    .toHaveValue("13:30");

  await userEvent.fill(screen.getByRole("textbox", { name: "Sábados Cierra" }), "25:00");
  await userEvent.click(screen.getByRole("button", { name: "Guardar los cambios" }));

  await expect
    .element(screen.getByRole("textbox", { name: "Sábados Cierra" }))
    .toHaveAccessibleDescription("Ingresá la hora como 9:00 o 21:30.");
  await expect
    .element(screen.getByRole("textbox", { name: "Sábados Abre" }))
    .not.toHaveAttribute("aria-invalid", "true");
  expect(services.saveBranchSettings).not.toHaveBeenCalled();
});

test("marks both times of a group when neither is a valid time", async () => {
  const services = createServices();
  vi.mocked(services.fetchBranchSettings).mockResolvedValue({ kind: "ok", value: loaded });
  const screen = await renderScreen(services);
  await expect
    .element(screen.getByRole("textbox", { name: "Lunes a viernes Abre" }))
    .toHaveValue("09:00");

  await userEvent.fill(screen.getByRole("textbox", { name: "Lunes a viernes Abre" }), "9.00");
  await userEvent.clear(screen.getByRole("textbox", { name: "Lunes a viernes Cierra" }));
  await userEvent.click(screen.getByRole("button", { name: "Guardar los cambios" }));

  await expect
    .element(screen.getByRole("textbox", { name: "Lunes a viernes Abre" }))
    .toHaveAccessibleDescription("Ingresá la hora como 9:00 o 21:30.");
  await expect
    .element(screen.getByRole("textbox", { name: "Lunes a viernes Cierra" }))
    .toHaveAccessibleDescription("Ingresá la hora como 9:00 o 21:30.");
  expect(services.saveBranchSettings).not.toHaveBeenCalled();
});

test("rejects a days value above 2147483647 with an error that asks for a smaller number, without saving", async () => {
  const services = createServices();
  vi.mocked(services.fetchBranchSettings).mockResolvedValue({ kind: "ok", value: loaded });
  const screen = await renderScreen(services);
  await expect
    .element(screen.getByRole("textbox", { name: "Precio sin revisar" }))
    .toHaveValue("30");

  await userEvent.fill(screen.getByRole("textbox", { name: "Precio sin revisar" }), "2147483648");
  await userEvent.click(screen.getByRole("button", { name: "Guardar los cambios" }));

  await expect
    .element(screen.getByRole("textbox", { name: "Precio sin revisar" }))
    .toHaveAttribute("aria-invalid", "true");
  await expect.element(screen.getByText("Ingresá un número de días más chico.")).toBeVisible();
  expect(services.saveBranchSettings).not.toHaveBeenCalled();
});

test("accepts a days value of exactly 2147483647", async () => {
  const services = createServices();
  vi.mocked(services.fetchBranchSettings).mockResolvedValue({ kind: "ok", value: loaded });
  vi.mocked(services.saveBranchSettings).mockResolvedValue({ kind: "ok", value: loaded });
  const screen = await renderScreen(services);
  await expect
    .element(screen.getByRole("textbox", { name: "Precio sin revisar" }))
    .toHaveValue("30");

  await userEvent.fill(screen.getByRole("textbox", { name: "Precio sin revisar" }), "2147483647");
  await userEvent.click(screen.getByRole("button", { name: "Guardar los cambios" }));

  await expect.poll(() => vi.mocked(services.saveBranchSettings).mock.calls.length).toBe(1);
  expect(services.saveBranchSettings).toHaveBeenCalledWith({
    ...loaded,
    unreviewedPriceAlertDays: 2147483647,
  });
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

test("shows the server's hours validation error inline on the group's Cierra field", async () => {
  const services = createServices();
  vi.mocked(services.fetchBranchSettings).mockResolvedValue({ kind: "ok", value: loaded });
  vi.mocked(services.saveBranchSettings).mockResolvedValue({
    kind: "validation_failed",
    field: "weekday_hours",
  });
  const screen = await renderScreen(services);
  await expect
    .element(screen.getByRole("textbox", { name: "Lunes a viernes Cierra" }))
    .toHaveValue("20:00");

  await userEvent.click(screen.getByRole("button", { name: "Guardar los cambios" }));

  await expect
    .element(screen.getByRole("textbox", { name: "Lunes a viernes Cierra" }))
    .toHaveAccessibleDescription("La hora de cierre tiene que ser posterior a la de apertura.");
});

test("shows a stale_version notice, and Recargar refetches so the second save sends the new version", async () => {
  const services = createServices();
  vi.mocked(services.fetchBranchSettings).mockResolvedValueOnce({ kind: "ok", value: loaded });
  vi.mocked(services.saveBranchSettings).mockResolvedValueOnce({ kind: "stale_version" });
  const screen = await renderScreen(services);
  await expect
    .element(screen.getByRole("textbox", { name: "Dirección" }))
    .toHaveValue("Av. Belgrano 1450, CABA");

  await userEvent.fill(
    screen.getByRole("textbox", { name: "Dirección" }),
    "Av. Belgrano 1500, CABA",
  );
  await userEvent.click(screen.getByRole("button", { name: "Guardar los cambios" }));

  await expect.element(screen.getByText("La sucursal cambió mientras la editabas")).toBeVisible();

  const reloaded: BranchSettings = { ...loaded, address: "Av. Belgrano 1600, CABA", version: 5 };
  vi.mocked(services.fetchBranchSettings).mockResolvedValueOnce({ kind: "ok", value: reloaded });
  await userEvent.click(screen.getByRole("button", { name: "Recargar" }));

  await expect
    .element(screen.getByRole("textbox", { name: "Dirección" }))
    .toHaveValue("Av. Belgrano 1600, CABA");

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

test("fits the three deadline fields inside their card at the backoffice's content width", async () => {
  await page.viewport(1440, 1000);
  const services = createServices();
  vi.mocked(services.fetchBranchSettings).mockResolvedValue({ kind: "ok", value: loaded });

  const screen = await render(
    <main style={{ width: 1104, height: 1000, display: "flex", flexDirection: "column" }}>
      <BranchSettingsScreen onSessionEnded={() => {}} services={services} />
    </main>,
  );

  const lastField = screen.getByLabelText("Cambio en buen estado");
  await expect.element(lastField).toBeVisible();
  const card = screen.getByRole("heading", { name: "Plazos" }).element()
    .parentElement as HTMLElement;

  expect(lastField.element().getBoundingClientRect().right).toBeLessThanOrEqual(
    card.getBoundingClientRect().right,
  );
});

test("renders a Plazos field at the same box height as a plain-text field, with its días unit still exposed", async () => {
  const services = createServices();
  vi.mocked(services.fetchBranchSettings).mockResolvedValue({ kind: "ok", value: loaded });
  const screen = await renderScreen(services);

  const addressBox = screen.getByRole("textbox", { name: "Dirección" }).element()
    .parentElement as HTMLElement;
  const daysBox = screen.getByRole("textbox", { name: "Precio sin revisar" }).element()
    .parentElement as HTMLElement;

  expect(daysBox.getBoundingClientRect().height).toBeCloseTo(
    addressBox.getBoundingClientRect().height,
    0,
  );
  await expect
    .element(screen.getByRole("textbox", { name: "Precio sin revisar" }))
    .toHaveAccessibleDescription("días");
});

test("keeps unsaved edits without refetching when the parent re-renders with a new onSessionEnded", async () => {
  const services = createServices();
  vi.mocked(services.fetchBranchSettings).mockResolvedValue({ kind: "ok", value: loaded });
  const screen = await renderScreen(services, () => {});
  const address = screen.getByRole("textbox", { name: "Dirección" });
  await expect.element(address).toHaveValue("Av. Belgrano 1450, CABA");
  await userEvent.fill(address, "Av. Corrientes 800, CABA");

  await screen.rerender(
    <main>
      <BranchSettingsScreen services={services} onSessionEnded={() => {}} />
    </main>,
  );

  await expect.element(address).toHaveValue("Av. Corrientes 800, CABA");
  expect(services.fetchBranchSettings).toHaveBeenCalledTimes(1);
});
