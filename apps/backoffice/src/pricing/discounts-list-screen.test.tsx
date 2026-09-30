import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { discountsListFilters } from "./routes";
import {
  almacenTuesdays,
  discountList,
  endedPromotion,
  sinTaccWinter,
  switchedOffPromotion,
  yerbaOff,
} from "./test-support/discounts";
import {
  createServices,
  deferred,
  loaded,
  renderScreen,
  rowCells,
} from "./test-support/discounts-list-screen";

const everyPromotion = [
  yerbaOff,
  almacenTuesdays,
  sinTaccWinter,
  endedPromotion,
  switchedOffPromotion,
];

test("shows the breadcrumb, heading and the current and scheduled promotions with their columns", async () => {
  const services = createServices();
  const screen = await loaded(services, everyPromotion);

  await expect.element(screen.getByText("Catálogo").first()).toBeVisible();
  await expect
    .element(screen.getByRole("heading", { name: "Promociones", level: 1 }))
    .toBeVisible();
  const headers = screen.getByRole("columnheader").all();
  expect(headers.map((header) => header.element().textContent)).toEqual([
    "Promoción",
    "Beneficio",
    "Vigencia",
    "Días",
    "Estado",
    "Acciones",
  ]);
  await expect
    .poll(() => rowCells(screen))
    .toEqual([
      [
        "Martes de almacénCategoría · Almacén",
        "10 % de descuento",
        "01/10 → 31/10/2026",
        "LMMJVSD",
        "Programada",
      ],
      [
        "Sin TACC de inviernoDistintivo · Sin TACC",
        "20 % de descuento",
        "01/12/2026 → 28/02/2027",
        "LMMJVSD",
        "Programada",
      ],
      [
        "Yerba de septiembreProducto · Yerba Playadito 1 kg",
        "15 % de descuento",
        "12/09 → 30/09/2026",
        "LMMJVSD",
        "Vigente",
      ],
    ]);
});

test("names each promotion's weekdays in the accessible text of its days", async () => {
  const services = createServices();
  const screen = await loaded(services, [yerbaOff, almacenTuesdays, sinTaccWinter]);

  await expect.element(screen.getByRole("img", { name: "Todos los días" })).toBeVisible();
  await expect.element(screen.getByRole("img", { name: "Martes" })).toBeVisible();
  await expect
    .element(screen.getByRole("img", { name: "Lunes, miércoles y viernes" }))
    .toBeVisible();
});

test("marks a promotion whose validity has passed as ended, and a switched off one as deactivated", async () => {
  const services = createServices();
  const screen = await loaded(services, [endedPromotion, switchedOffPromotion, yerbaOff], {
    filters: discountsListFilters.parse({ status: "all" }),
  });

  await expect
    .poll(() => rowCells(screen).map((cells) => cells.at(-1)))
    .toEqual(["Desactivada", "Terminada", "Vigente"]);
});

test("a promotion that starts today is current, and one that ended yesterday is not", async () => {
  const services = createServices();
  const startsToday = { ...almacenTuesdays, validFrom: "2026-09-30", validTo: "2026-10-31" };
  const endedYesterday = { ...yerbaOff, validFrom: "2026-09-01", validTo: "2026-09-29" };
  const screen = await loaded(services, [startsToday, endedYesterday], {
    filters: discountsListFilters.parse({ status: "all" }),
  });

  await expect
    .poll(() => rowCells(screen).map((cells) => cells.at(-1)))
    .toEqual(["Vigente", "Terminada"]);
});

test("today is Argentina's calendar day, not the UTC one", async () => {
  const services = createServices();
  const startsTomorrowInUtc = { ...almacenTuesdays, validFrom: "2026-10-01" };
  const screen = await loaded(services, [startsTomorrowInUtc], {
    now: () => new Date("2026-10-01T01:00:00.000Z"),
  });

  await expect.poll(() => rowCells(screen).map((cells) => cells.at(-1))).toEqual(["Programada"]);
});

test("the state filter offers Vigentes y programadas, Terminadas, Desactivadas and Todas", async () => {
  const services = createServices();
  const screen = await loaded(services, everyPromotion);

  await userEvent.click(screen.getByRole("button", { name: /Estado:/ }));

  const options = screen.getByRole("option").all();
  expect(options.map((option) => option.element().textContent)).toEqual([
    "Vigentes y programadas",
    "Terminadas",
    "Desactivadas",
    "Todas",
  ]);
});

test("the state filter shows the ended, the deactivated, or every promotion, with the footer of what is shown", async () => {
  const services = createServices();
  const screen = await loaded(services, everyPromotion);
  await expect.element(screen.getByText("3 promociones · 1 vigente hoy")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: /Estado:/ }));
  await userEvent.click(screen.getByRole("option", { name: "Terminadas" }));
  await expect
    .poll(() => rowCells(screen).map((cells) => cells[0]))
    .toEqual(["Vuelta a clasesProducto · Cuaderno rayado"]);
  await expect.element(screen.getByText("1 promoción · 0 vigentes hoy")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: /Estado:/ }));
  await userEvent.click(screen.getByRole("option", { name: "Desactivadas" }));
  await expect
    .poll(() => rowCells(screen).map((cells) => cells[0]))
    .toEqual(["Aceite apagadoProducto · Aceite de girasol 900 ml"]);

  await userEvent.click(screen.getByRole("button", { name: /Estado:/ }));
  await userEvent.click(screen.getByRole("option", { name: "Todas" }));
  await expect.element(screen.getByText("5 promociones · 1 vigente hoy")).toBeVisible();
});

test("the kind filter offers every kind and only the percentage kind, and keeps its promotions", async () => {
  const services = createServices();
  const screen = await loaded(services, everyPromotion);

  await userEvent.click(screen.getByRole("button", { name: /Tipo:/ }));
  expect(
    screen
      .getByRole("option")
      .all()
      .map((option) => option.element().textContent),
  ).toEqual(["Todos", "Porcentaje"]);
  await userEvent.click(screen.getByRole("option", { name: "Porcentaje" }));

  await expect.poll(() => rowCells(screen)).toHaveLength(3);
});

test("the search field matches the promotion name and the name of its target, case-insensitively", async () => {
  const services = createServices();
  const screen = await loaded(services, everyPromotion, {
    filters: discountsListFilters.parse({ status: "all" }),
  });

  await userEvent.fill(screen.getByPlaceholder("Buscar una promoción"), "mARtes");
  await expect
    .poll(() => rowCells(screen).map((cells) => cells[0]))
    .toEqual(["Martes de almacénCategoría · Almacén"]);

  await userEvent.fill(screen.getByPlaceholder("Buscar una promoción"), "girasol");
  await expect
    .poll(() => rowCells(screen).map((cells) => cells[0]))
    .toEqual(["Aceite apagadoProducto · Aceite de girasol 900 ml"]);
});

test("orders the promotions by name, and each sortable header orders them by its own column", async () => {
  const services = createServices();
  const screen = await loaded(services, everyPromotion, {
    filters: discountsListFilters.parse({ status: "all" }),
  });
  const names = () =>
    rowCells(screen).map((cells) => cells[0]?.split(/Producto|Categoría|Distintivo/)[0]);
  await expect
    .poll(names)
    .toEqual([
      "Aceite apagado",
      "Martes de almacén",
      "Sin TACC de invierno",
      "Vuelta a clases",
      "Yerba de septiembre",
    ]);

  await userEvent.click(screen.getByRole("button", { name: "Beneficio", exact: true }));
  await expect
    .poll(names)
    .toEqual([
      "Vuelta a clases",
      "Martes de almacén",
      "Yerba de septiembre",
      "Sin TACC de invierno",
      "Aceite apagado",
    ]);

  await userEvent.click(screen.getByRole("button", { name: "Vigencia", exact: true }));
  await expect
    .poll(names)
    .toEqual([
      "Vuelta a clases",
      "Aceite apagado",
      "Yerba de septiembre",
      "Martes de almacén",
      "Sin TACC de invierno",
    ]);

  await userEvent.click(screen.getByRole("button", { name: "Estado", exact: true }));
  await expect
    .poll(names)
    .toEqual([
      "Yerba de septiembre",
      "Martes de almacén",
      "Sin TACC de invierno",
      "Vuelta a clases",
      "Aceite apagado",
    ]);
});

test("the days header is not sortable", async () => {
  const services = createServices();
  const screen = await loaded(services, everyPromotion);

  expect(screen.getByRole("button", { name: "Días", exact: true }).query()).toBeNull();
});

test("shows the drawn empty state on the default filter when no promotion is current or scheduled", async () => {
  const services = createServices();
  await loaded(services, [endedPromotion]).then(async (screen) => {
    await expect.element(screen.getByText("Sin promociones vigentes ni programadas")).toBeVisible();
    await expect
      .element(screen.getByText("Las promociones terminadas se ven cambiando el filtro de estado."))
      .toBeVisible();
    expect(screen.getByText(/promociones · /).query()).toBeNull();
  });
});

test("shows the blank empty state when there are no promotions yet, with no footer", async () => {
  const services = createServices();
  vi.mocked(services.fetchDiscounts).mockResolvedValue({ kind: "ok", value: discountList([]) });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Todavía no hay promociones")).toBeVisible();
  expect(screen.getByText(/promociones · /).query()).toBeNull();
});

test("shows a filtered empty state when no promotion has the chosen state", async () => {
  const services = createServices();
  const screen = await loaded(services, [yerbaOff], {
    filters: discountsListFilters.parse({ status: "deactivated" }),
  });

  await expect.element(screen.getByText("No hay promociones desactivadas")).toBeVisible();
});

test("shows a filtered empty state when the search matches nothing", async () => {
  const services = createServices();
  const screen = await loaded(services, [yerbaOff]);

  await userEvent.fill(screen.getByPlaceholder("Buscar una promoción"), "zzz");

  await expect.element(screen.getByText("Sin resultados")).toBeVisible();
});

test("shows the table loading while the promotions are read", async () => {
  const services = createServices();
  vi.mocked(services.fetchDiscounts).mockReturnValue(new Promise(() => {}));

  const screen = await renderScreen(services);

  await expect
    .element(screen.getByRole("table", { name: "Promociones" }))
    .toHaveAttribute("aria-busy", "true");
});

test("shows a load error with a retry action that starts again from the loading placeholder", async () => {
  const services = createServices();
  const retry = deferred<Awaited<ReturnType<typeof services.fetchDiscounts>>>();
  vi.mocked(services.fetchDiscounts)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockReturnValueOnce(retry.promise);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No pudimos abrir las promociones")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect
    .element(screen.getByRole("table", { name: "Promociones" }))
    .toHaveAttribute("aria-busy", "true");
  retry.resolve({ kind: "ok", value: discountList([yerbaOff]) });
  await expect.element(screen.getByText("Yerba de septiembre")).toBeVisible();
});

test("shows the rate-limited notice with the time to wait", async () => {
  const services = createServices();
  vi.mocked(services.fetchDiscounts).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 120,
  });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(screen.getByText("Se puede volver a intentar en 2 minutos.")).toBeVisible();
});

test("navigates to Mi cuenta when the promotions request comes back forbidden", async () => {
  window.history.pushState(null, "", "/catalog/discounts");
  const services = createServices();
  vi.mocked(services.fetchDiscounts).mockResolvedValue({ kind: "forbidden" });

  await renderScreen(services);

  await expect.poll(() => window.location.pathname).toBe("/settings/users/me");
  window.history.pushState(null, "", "/");
});

test("ends the session when the promotions request finds no open session", async () => {
  const services = createServices();
  vi.mocked(services.fetchDiscounts).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();

  await renderScreen(services, { onSessionEnded });

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("opens with the filters it is given, and reports every change to them", async () => {
  const services = createServices();
  const onFiltersChange = vi.fn();
  const screen = await loaded(services, everyPromotion, {
    filters: {
      search: "yer",
      kind: "PERCENT_OFF",
      status: "all",
      sortBy: "benefit",
      sort: "descending",
    },
    onFiltersChange,
  });

  await expect.element(screen.getByPlaceholder("Buscar una promoción")).toHaveValue("yer");
  await expect.poll(() => rowCells(screen)).toHaveLength(1);
  expect(onFiltersChange).not.toHaveBeenCalled();

  await userEvent.fill(screen.getByPlaceholder("Buscar una promoción"), "");
  await expect
    .poll(() => onFiltersChange.mock.lastCall?.[0])
    .toEqual({
      search: "",
      kind: "PERCENT_OFF",
      status: "all",
      sortBy: "benefit",
      sort: "descending",
    });

  await userEvent.click(screen.getByRole("button", { name: "Promoción", exact: true }));
  await expect
    .poll(() => onFiltersChange.mock.lastCall?.[0])
    .toEqual({
      search: "",
      kind: "PERCENT_OFF",
      status: "all",
      sortBy: "promotion",
      sort: "ascending",
    });
});

test("has no accessibility violations once loaded", async () => {
  const services = createServices();
  const screen = await loaded(services, everyPromotion, {
    filters: discountsListFilters.parse({ status: "all" }),
  });

  await expectNoAccessibilityViolations(screen.container);
});
