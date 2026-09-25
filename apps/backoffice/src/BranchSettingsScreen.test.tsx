import { BRANCH_HOURS_RANGES_PER_DAY_MAX } from "@purosur/contracts";
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
  hours: {
    monday: [
      { opensAt: "09:00", closesAt: "13:00" },
      { opensAt: "17:00", closesAt: "21:00" },
    ],
    tuesday: [{ opensAt: "09:00", closesAt: "20:00" }],
    wednesday: [{ opensAt: "09:00", closesAt: "20:00" }],
    thursday: [{ opensAt: "09:00", closesAt: "20:00" }],
    friday: [{ opensAt: "09:00", closesAt: "20:00" }],
    saturday: [{ opensAt: "09:00", closesAt: "13:30" }],
    sunday: [],
  },
  expiringLotAlertDays: 30,
  unreviewedPriceAlertDays: 30,
  goodConditionReturnDays: 15,
  version: 1,
};

// A range field's own label carries its full sentence ("Lunes, horario 1, abre") but draws
// nothing (`labelVisuallyHidden`, see TextField.test.tsx): its box collapses to 1x1px, the same
// technique and assertion as Table.tsx's own srLabel.
function labelRect(input: HTMLInputElement): DOMRect {
  const label = input.labels?.[0] as HTMLElement;
  return label.getBoundingClientRect();
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

  await expect.element(screen.getByText("Lunes")).toBeVisible();
  await expect
    .element(screen.getByRole("textbox", { name: "Lunes, horario 1, abre" }))
    .toHaveValue("09:00");
  await expect
    .element(screen.getByRole("textbox", { name: "Lunes, horario 1, cierra" }))
    .toHaveValue("13:00");
  await expect
    .element(screen.getByRole("textbox", { name: "Lunes, horario 2, abre" }))
    .toHaveValue("17:00");
  await expect
    .element(screen.getByRole("textbox", { name: "Lunes, horario 2, cierra" }))
    .toHaveValue("21:00");
  const opensRect = labelRect(
    screen.getByRole("textbox", { name: "Lunes, horario 1, abre" }).element() as HTMLInputElement,
  );
  expect(opensRect.width).toBeLessThanOrEqual(1);
  expect(opensRect.height).toBeLessThanOrEqual(1);
  const closesRect = labelRect(
    screen.getByRole("textbox", { name: "Lunes, horario 1, cierra" }).element() as HTMLInputElement,
  );
  expect(closesRect.width).toBeLessThanOrEqual(1);
  expect(closesRect.height).toBeLessThanOrEqual(1);
  // No standalone "abre"/"cierra" caption renders for a range: only the field's own full,
  // visually hidden sentence names it.
  expect(screen.getByText("abre", { exact: true }).query()).toBeNull();
  expect(screen.getByText("cierra", { exact: true }).query()).toBeNull();
  await expect.element(screen.getByRole("checkbox", { name: "Lunes — Cerrado" })).not.toBeChecked();
  await expect
    .element(screen.getByRole("button", { name: "Quitar el horario 2 del lunes" }))
    .toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "Agregar un horario al lunes" }))
    .toBeVisible();

  await expect.element(screen.getByText("Sábado")).toBeVisible();
  await expect
    .element(screen.getByRole("textbox", { name: "Sábado, horario 1, abre" }))
    .toHaveValue("09:00");
  await expect
    .element(screen.getByRole("textbox", { name: "Sábado, horario 1, cierra" }))
    .toHaveValue("13:30");
  expect(
    screen.getByRole("button", { name: /Quitar el horario \d del sábado/ }).query(),
  ).toBeNull();

  await expect.element(screen.getByText("Domingo")).toBeVisible();
  await expect.element(screen.getByRole("checkbox", { name: "Domingo — Cerrado" })).toBeChecked();
  expect(screen.getByRole("textbox", { name: "Domingo, horario 1, abre" }).query()).toBeNull();
  expect(screen.getByRole("button", { name: "Agregar un horario al domingo" }).query()).toBeNull();

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

test("saves every field, each day's ranges and the loaded version, showing the saved values", async () => {
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

test("checking Cerrado on a day hides its ranges and saves it as closed", async () => {
  const services = createServices();
  vi.mocked(services.fetchBranchSettings).mockResolvedValue({ kind: "ok", value: loaded });
  vi.mocked(services.saveBranchSettings).mockResolvedValue({
    kind: "ok",
    value: { ...loaded, hours: { ...loaded.hours, monday: [] }, version: 2 },
  });
  const screen = await renderScreen(services);
  await expect
    .element(screen.getByRole("textbox", { name: "Lunes, horario 1, abre" }))
    .toHaveValue("09:00");

  // A custom checkbox's decorative box sits visually above its own native input (see
  // Checkbox.test.tsx's own checkboxBox helper for the same overlap), so the click is forced.
  await screen.getByRole("checkbox", { name: "Lunes — Cerrado" }).click({ force: true });

  expect(screen.getByRole("textbox", { name: "Lunes, horario 1, abre" }).query()).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Guardar los cambios" }));

  await expect.poll(() => vi.mocked(services.saveBranchSettings).mock.calls.length).toBe(1);
  expect(services.saveBranchSettings).toHaveBeenCalledWith({
    ...loaded,
    hours: { ...loaded.hours, monday: [] },
  });
});

test("unchecking Cerrado brings back the ranges the day had before it was checked", async () => {
  const services = createServices();
  vi.mocked(services.fetchBranchSettings).mockResolvedValue({ kind: "ok", value: loaded });
  vi.mocked(services.saveBranchSettings).mockResolvedValue({ kind: "ok", value: loaded });
  const screen = await renderScreen(services);
  await userEvent.fill(screen.getByRole("textbox", { name: "Lunes, horario 2, cierra" }), "21:30");

  await screen.getByRole("checkbox", { name: "Lunes — Cerrado" }).click({ force: true });
  expect(screen.getByRole("textbox", { name: "Lunes, horario 1, abre" }).query()).toBeNull();
  await screen.getByRole("checkbox", { name: "Lunes — Cerrado" }).click({ force: true });

  await expect
    .element(screen.getByRole("textbox", { name: "Lunes, horario 1, abre" }))
    .toHaveValue("09:00");
  await expect
    .element(screen.getByRole("textbox", { name: "Lunes, horario 2, cierra" }))
    .toHaveValue("21:30");
  await userEvent.click(screen.getByRole("button", { name: "Guardar los cambios" }));

  await expect.poll(() => vi.mocked(services.saveBranchSettings).mock.calls.length).toBe(1);
  expect(services.saveBranchSettings).toHaveBeenCalledWith({
    ...loaded,
    hours: {
      ...loaded.hours,
      monday: [
        { opensAt: "09:00", closesAt: "13:00" },
        { opensAt: "17:00", closesAt: "21:30" },
      ],
    },
  });
});

test("unchecking Cerrado on a day with no ranges shows one empty range", async () => {
  const services = createServices();
  vi.mocked(services.fetchBranchSettings).mockResolvedValue({ kind: "ok", value: loaded });
  const screen = await renderScreen(services);
  await expect.element(screen.getByRole("checkbox", { name: "Domingo — Cerrado" })).toBeChecked();

  await screen.getByRole("checkbox", { name: "Domingo — Cerrado" }).click({ force: true });

  await expect
    .element(screen.getByRole("textbox", { name: "Domingo, horario 1, abre" }))
    .toHaveValue("");
  await expect
    .element(screen.getByRole("textbox", { name: "Domingo, horario 1, cierra" }))
    .toHaveValue("");
  expect(
    screen.getByRole("button", { name: "Quitar el horario 1 del domingo" }).query(),
  ).toBeNull();
});

test("adding a range appends an empty range and shows a trash button for both", async () => {
  const services = createServices();
  vi.mocked(services.fetchBranchSettings).mockResolvedValue({ kind: "ok", value: loaded });
  vi.mocked(services.saveBranchSettings).mockResolvedValue({ kind: "ok", value: loaded });
  const screen = await renderScreen(services);
  expect(screen.getByRole("textbox", { name: "Martes, horario 2, abre" }).query()).toBeNull();

  await userEvent.click(screen.getByRole("button", { name: "Agregar un horario al martes" }));

  await expect
    .element(screen.getByRole("textbox", { name: "Martes, horario 2, abre" }))
    .toHaveValue("");
  await expect
    .element(screen.getByRole("button", { name: "Quitar el horario 1 del martes" }))
    .toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "Quitar el horario 2 del martes" }))
    .toBeVisible();

  await userEvent.fill(screen.getByRole("textbox", { name: "Martes, horario 2, abre" }), "21:00");
  await userEvent.fill(screen.getByRole("textbox", { name: "Martes, horario 2, cierra" }), "23:00");
  await userEvent.click(screen.getByRole("button", { name: "Guardar los cambios" }));

  await expect.poll(() => vi.mocked(services.saveBranchSettings).mock.calls.length).toBe(1);
  expect(services.saveBranchSettings).toHaveBeenCalledWith({
    ...loaded,
    hours: {
      ...loaded.hours,
      tuesday: [
        { opensAt: "09:00", closesAt: "20:00" },
        { opensAt: "21:00", closesAt: "23:00" },
      ],
    },
  });
});

test("removing a range drops it, hiding the trash button once only one is left", async () => {
  const services = createServices();
  vi.mocked(services.fetchBranchSettings).mockResolvedValue({ kind: "ok", value: loaded });
  vi.mocked(services.saveBranchSettings).mockResolvedValue({ kind: "ok", value: loaded });
  const screen = await renderScreen(services);
  await expect
    .element(screen.getByRole("textbox", { name: "Lunes, horario 2, abre" }))
    .toHaveValue("17:00");

  await userEvent.click(screen.getByRole("button", { name: "Quitar el horario 2 del lunes" }));

  expect(screen.getByRole("textbox", { name: "Lunes, horario 2, abre" }).query()).toBeNull();
  expect(screen.getByRole("button", { name: "Quitar el horario 1 del lunes" }).query()).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Guardar los cambios" }));

  await expect.poll(() => vi.mocked(services.saveBranchSettings).mock.calls.length).toBe(1);
  expect(services.saveBranchSettings).toHaveBeenCalledWith({
    ...loaded,
    hours: { ...loaded.hours, monday: [{ opensAt: "09:00", closesAt: "13:00" }] },
  });
});

function rangeInput(
  screen: Awaited<ReturnType<typeof renderScreen>>,
  name: string,
): HTMLInputElement {
  return screen.getByRole("textbox", { name }).element() as HTMLInputElement;
}

async function pressWithKeyboard(button: HTMLElement) {
  button.focus();
  await userEvent.keyboard("{Enter}");
}

test("moves keyboard focus to the new range's opening field after adding one", async () => {
  const services = createServices();
  vi.mocked(services.fetchBranchSettings).mockResolvedValue({ kind: "ok", value: loaded });
  const screen = await renderScreen(services);

  await pressWithKeyboard(
    screen.getByRole("button", { name: "Agregar un horario al martes" }).element() as HTMLElement,
  );

  await expect
    .poll(() => document.activeElement === rangeInput(screen, "Martes, horario 2, abre"))
    .toBe(true);
});

test("keeps keyboard focus in the day once the add-range button disappears at the cap", async () => {
  const belowCap: BranchSettings = {
    ...loaded,
    hours: {
      ...loaded.hours,
      friday: Array.from({ length: BRANCH_HOURS_RANGES_PER_DAY_MAX - 1 }, (_, index) => ({
        opensAt: `0${index}:00`,
        closesAt: `0${index + 1}:00`,
      })),
    },
  };
  const services = createServices();
  vi.mocked(services.fetchBranchSettings).mockResolvedValue({ kind: "ok", value: belowCap });
  const screen = await renderScreen(services);

  await pressWithKeyboard(
    screen.getByRole("button", { name: "Agregar un horario al viernes" }).element() as HTMLElement,
  );

  expect(screen.getByRole("button", { name: "Agregar un horario al viernes" }).query()).toBeNull();
  await expect
    .poll(
      () =>
        document.activeElement ===
        rangeInput(screen, `Viernes, horario ${BRANCH_HOURS_RANGES_PER_DAY_MAX}, abre`),
    )
    .toBe(true);
});

test("moves keyboard focus to the previous range's opening field after removing the last range", async () => {
  const services = createServices();
  vi.mocked(services.fetchBranchSettings).mockResolvedValue({ kind: "ok", value: loaded });
  const screen = await renderScreen(services);

  await pressWithKeyboard(
    screen.getByRole("button", { name: "Quitar el horario 2 del lunes" }).element() as HTMLElement,
  );

  expect(screen.getByRole("button", { name: "Quitar el horario 1 del lunes" }).query()).toBeNull();
  await expect
    .poll(() => document.activeElement === rangeInput(screen, "Lunes, horario 1, abre"))
    .toBe(true);
});

test("moves keyboard focus to the range that takes the removed one's place", async () => {
  const services = createServices();
  vi.mocked(services.fetchBranchSettings).mockResolvedValue({
    kind: "ok",
    value: {
      ...loaded,
      hours: {
        ...loaded.hours,
        monday: [
          { opensAt: "08:00", closesAt: "10:00" },
          { opensAt: "11:00", closesAt: "13:00" },
          { opensAt: "17:00", closesAt: "21:00" },
        ],
      },
    },
  });
  const screen = await renderScreen(services);

  await pressWithKeyboard(
    screen.getByRole("button", { name: "Quitar el horario 1 del lunes" }).element() as HTMLElement,
  );

  await expect
    .element(screen.getByRole("textbox", { name: "Lunes, horario 1, abre" }))
    .toHaveValue("11:00");
  await expect
    .poll(() => document.activeElement === rangeInput(screen, "Lunes, horario 1, abre"))
    .toBe(true);
});

test("hides the add-range button once a day reaches the ranges cap", async () => {
  const atCap: BranchSettings = {
    ...loaded,
    hours: {
      ...loaded.hours,
      friday: Array.from({ length: BRANCH_HOURS_RANGES_PER_DAY_MAX }, (_, index) => ({
        opensAt: `0${index}:00`,
        closesAt: `0${index + 1}:00`,
      })),
    },
  };
  const services = createServices();
  vi.mocked(services.fetchBranchSettings).mockResolvedValue({ kind: "ok", value: atCap });
  const screen = await renderScreen(services);
  await expect
    .element(
      screen.getByRole("textbox", {
        name: `Viernes, horario ${BRANCH_HOURS_RANGES_PER_DAY_MAX}, abre`,
      }),
    )
    .toHaveValue(`0${BRANCH_HOURS_RANGES_PER_DAY_MAX - 1}:00`);

  expect(screen.getByRole("button", { name: "Agregar un horario al viernes" }).query()).toBeNull();
});

test("accepts a single-digit hour like 9:00 and sends it zero-padded", async () => {
  const services = createServices();
  vi.mocked(services.fetchBranchSettings).mockResolvedValue({
    kind: "ok",
    value: { ...loaded, hours: { ...loaded.hours, sunday: [] } },
  });
  vi.mocked(services.saveBranchSettings).mockResolvedValue({ kind: "ok", value: loaded });
  const screen = await renderScreen(services);
  await screen.getByRole("checkbox", { name: "Domingo — Cerrado" }).click({ force: true });
  await userEvent.fill(screen.getByRole("textbox", { name: "Domingo, horario 1, abre" }), "9:00");
  await userEvent.fill(
    screen.getByRole("textbox", { name: "Domingo, horario 1, cierra" }),
    "13:00",
  );

  await userEvent.click(screen.getByRole("button", { name: "Guardar los cambios" }));

  await expect.poll(() => vi.mocked(services.saveBranchSettings).mock.calls.length).toBe(1);
  expect(services.saveBranchSettings).toHaveBeenCalledWith({
    ...loaded,
    hours: { ...loaded.hours, sunday: [{ opensAt: "09:00", closesAt: "13:00" }] },
  });
});

test("rejects a range whose closing time isn't later than opening, with one inline error under the day, without saving", async () => {
  const services = createServices();
  vi.mocked(services.fetchBranchSettings).mockResolvedValue({ kind: "ok", value: loaded });
  const screen = await renderScreen(services);
  await expect
    .element(screen.getByRole("textbox", { name: "Lunes, horario 1, cierra" }))
    .toHaveValue("13:00");

  await userEvent.fill(screen.getByRole("textbox", { name: "Lunes, horario 1, cierra" }), "08:00");
  await userEvent.click(screen.getByRole("button", { name: "Guardar los cambios" }));

  await expect
    .element(screen.getByText("La hora de cierre tiene que ser posterior a la de apertura."))
    .toBeVisible();
  for (const name of [
    "Lunes, horario 1, abre",
    "Lunes, horario 1, cierra",
    "Lunes, horario 2, abre",
    "Lunes, horario 2, cierra",
  ]) {
    await expect
      .element(screen.getByRole("textbox", { name }))
      .toHaveAttribute("aria-invalid", "true");
    await expect
      .element(screen.getByRole("textbox", { name }))
      .toHaveAccessibleDescription("La hora de cierre tiene que ser posterior a la de apertura.");
  }
  await expect
    .element(screen.getByRole("textbox", { name: "Martes, horario 1, abre" }))
    .not.toHaveAttribute("aria-invalid", "true");
  await expect
    .element(screen.getByRole("textbox", { name: "Martes, horario 1, abre" }))
    .toHaveAccessibleDescription("");
  expect(services.saveBranchSettings).not.toHaveBeenCalled();
  await expectNoAccessibilityViolations(screen.container);
});

test("rejects an empty opening time with a time-format error under the day, without saving", async () => {
  const services = createServices();
  vi.mocked(services.fetchBranchSettings).mockResolvedValue({ kind: "ok", value: loaded });
  const screen = await renderScreen(services);
  await expect
    .element(screen.getByRole("textbox", { name: "Lunes, horario 1, abre" }))
    .toHaveValue("09:00");

  await userEvent.clear(screen.getByRole("textbox", { name: "Lunes, horario 1, abre" }));
  await userEvent.click(screen.getByRole("button", { name: "Guardar los cambios" }));

  await expect.element(screen.getByText("Ingresá la hora como 9:00 o 21:30.")).toBeVisible();
  await expect
    .element(screen.getByRole("textbox", { name: "Lunes, horario 1, abre" }))
    .toHaveAccessibleDescription("Ingresá la hora como 9:00 o 21:30.");
  await expect
    .element(screen.getByRole("textbox", { name: "Lunes, horario 1, cierra" }))
    .toHaveAccessibleDescription("Ingresá la hora como 9:00 o 21:30.");
  expect(
    screen.getByText("La hora de cierre tiene que ser posterior a la de apertura.").query(),
  ).toBeNull();
  expect(services.saveBranchSettings).not.toHaveBeenCalled();
});

test("rejects two ranges of the same day that overlap, without saving", async () => {
  const services = createServices();
  vi.mocked(services.fetchBranchSettings).mockResolvedValue({ kind: "ok", value: loaded });
  const screen = await renderScreen(services);
  await expect
    .element(screen.getByRole("textbox", { name: "Lunes, horario 1, cierra" }))
    .toHaveValue("13:00");

  await userEvent.fill(screen.getByRole("textbox", { name: "Lunes, horario 1, cierra" }), "18:00");
  await userEvent.click(screen.getByRole("button", { name: "Guardar los cambios" }));

  await expect
    .element(screen.getByText("Los horarios de un mismo día no se pueden superponer."))
    .toBeVisible();
  await expect
    .element(screen.getByRole("textbox", { name: "Lunes, horario 2, abre" }))
    .toHaveAccessibleDescription("Los horarios de un mismo día no se pueden superponer.");
  expect(services.saveBranchSettings).not.toHaveBeenCalled();
});

test("editing a day's range clears its error", async () => {
  const services = createServices();
  vi.mocked(services.fetchBranchSettings).mockResolvedValue({ kind: "ok", value: loaded });
  const screen = await renderScreen(services);
  await userEvent.fill(screen.getByRole("textbox", { name: "Lunes, horario 1, cierra" }), "08:00");
  await userEvent.click(screen.getByRole("button", { name: "Guardar los cambios" }));
  await expect
    .element(screen.getByText("La hora de cierre tiene que ser posterior a la de apertura."))
    .toBeVisible();

  await userEvent.fill(screen.getByRole("textbox", { name: "Lunes, horario 1, cierra" }), "14:00");

  expect(
    screen.getByText("La hora de cierre tiene que ser posterior a la de apertura.").query(),
  ).toBeNull();
  await expect
    .element(screen.getByRole("textbox", { name: "Lunes, horario 1, cierra" }))
    .not.toHaveAttribute("aria-invalid", "true");
  await expect
    .element(screen.getByRole("textbox", { name: "Lunes, horario 1, cierra" }))
    .toHaveAccessibleDescription("");
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

test("shows the server's hours rejection as a neutral error under the day it names, since it doesn't say why", async () => {
  const services = createServices();
  vi.mocked(services.fetchBranchSettings).mockResolvedValue({ kind: "ok", value: loaded });
  vi.mocked(services.saveBranchSettings).mockResolvedValue({
    kind: "validation_failed",
    field: "monday_hours",
  });
  const screen = await renderScreen(services);
  await expect
    .element(screen.getByRole("textbox", { name: "Lunes, horario 1, cierra" }))
    .toHaveValue("13:00");

  await userEvent.click(screen.getByRole("button", { name: "Guardar los cambios" }));

  await expect.element(screen.getByText("Revisá los horarios de este día.")).toBeVisible();
  expect(
    screen.getByText("La hora de cierre tiene que ser posterior a la de apertura.").query(),
  ).toBeNull();
  await expect
    .element(screen.getByRole("textbox", { name: "Lunes, horario 1, cierra" }))
    .toHaveAttribute("aria-invalid", "true");
  await expect
    .element(screen.getByRole("textbox", { name: "Lunes, horario 1, cierra" }))
    .toHaveAccessibleDescription("Revisá los horarios de este día.");
  await expect
    .element(screen.getByRole("textbox", { name: "Martes, horario 1, cierra" }))
    .not.toHaveAttribute("aria-invalid", "true");
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

test("centers a day's row actions on the same line as its time fields", async () => {
  const services = createServices();
  vi.mocked(services.fetchBranchSettings).mockResolvedValue({ kind: "ok", value: loaded });
  const screen = await renderScreen(services);
  const field = screen.getByRole("textbox", { name: "Lunes, horario 2, cierra" });
  await expect.element(field).toBeVisible();

  const centerY = (element: Element) => {
    const rect = element.getBoundingClientRect();
    return rect.top + rect.height / 2;
  };
  const fieldBoxCenter = centerY((field.element() as HTMLElement).parentElement as HTMLElement);
  const removeCenter = centerY(
    screen.getByRole("button", { name: "Quitar el horario 2 del lunes" }).element(),
  );
  const addCenter = centerY(
    screen.getByRole("button", { name: "Agregar un horario al lunes" }).element(),
  );

  expect(removeCenter).toBeCloseTo(fieldBoxCenter, 0);
  expect(addCenter).toBeCloseTo(fieldBoxCenter, 0);
});

test("draws the same separator line above Lunes as above every other day", async () => {
  const services = createServices();
  vi.mocked(services.fetchBranchSettings).mockResolvedValue({ kind: "ok", value: loaded });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Lunes")).toBeVisible();

  // Day name → its fixed-width box → the row's first line → the day's row.
  const dayRow = (day: string) =>
    screen.getByText(day, { exact: true }).element().parentElement?.parentElement
      ?.parentElement as HTMLElement;
  const monday = getComputedStyle(dayRow("Lunes"));
  const tuesday = getComputedStyle(dayRow("Martes"));

  expect(monday.borderTopWidth).toBe("1px");
  expect(monday.borderTopStyle).toBe(tuesday.borderTopStyle);
  expect(monday.borderTopColor).toBe(tuesday.borderTopColor);
  expect(monday.paddingTop).toBe(tuesday.paddingTop);
});
