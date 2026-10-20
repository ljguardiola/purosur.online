import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { useState } from "react";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { dateSegments } from "../shell/test-support/report-dates";
import { FRONT_REGISTER_ID } from "../shell/test-support/report-fixtures";
import {
  createReportRegisterFilterServices,
  type ReportRegisterFilterServices,
  reportRegisterFieldForTests,
} from "../shell/test-support/report-register-filter";
import {
  type SalesByPromotionFilters,
  salesByPromotionFilters,
} from "./sales-by-promotion-filters";
import { SalesByPromotionScreen } from "./sales-by-promotion-screen";
import type { SalesByPromotionScreenServices } from "./sales-by-promotion-services";
import {
  noPromotionDiscountsReport,
  promotionDiscountsReport,
  singleLinePromotionReport,
} from "./test-support/sales-fixtures";

function createServices(): SalesByPromotionScreenServices {
  const services = { fetchSalesByPromotion: vi.fn() };
  services.fetchSalesByPromotion.mockResolvedValue({ kind: "ok", value: promotionDiscountsReport });
  return services;
}

type Handlers = {
  filters?: SalesByPromotionFilters;
  onFiltersChange?: (filters: SalesByPromotionFilters) => void;
  onSessionEnded?: () => void;
};

function ControlledScreen({
  services,
  filters: initial = salesByPromotionFilters.parse({}),
  onFiltersChange = () => {},
  onSessionEnded = () => {},
  registerServices,
}: Handlers & {
  services: SalesByPromotionScreenServices;
  registerServices: ReportRegisterFilterServices;
}) {
  const [filters, setFilters] = useState(initial);
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <SalesByPromotionScreen
          services={services}
          filters={filters}
          onFiltersChange={(next) => {
            onFiltersChange(next);
            setFilters(next);
          }}
          onSessionEnded={onSessionEnded}
          registerFilter={reportRegisterFieldForTests(registerServices, onSessionEnded)}
        />
      </main>
    </FieldSizeProvider>
  );
}

function renderScreen(
  services: SalesByPromotionScreenServices,
  {
    registerServices = createReportRegisterFilterServices(),
    ...handlers
  }: Handlers & {
    registerServices?: ReportRegisterFilterServices;
  } = {},
) {
  return render(
    <ControlledScreen services={services} registerServices={registerServices} {...handlers} />,
  );
}

type Screen = Awaited<ReturnType<typeof renderScreen>>;

const PROMOTION_NAMES = ["Finde de yerbas", "Tres por dos", "Promoción desconocida"];

function shownPromotions(screen: Screen) {
  return screen
    .getByRole("table")
    .getByRole("row")
    .elements()
    .map((row) => PROMOTION_NAMES.find((name) => row.textContent?.startsWith(name)))
    .filter((name) => name !== undefined);
}

test("names the report and the figures of the period", async () => {
  const screen = await renderScreen(createServices());

  await expect
    .element(screen.getByRole("heading", { name: "Descuentos por promoción", level: 1 }))
    .toBeVisible();
  await expect.element(screen.getByText("Reportes · Ventas", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("Descontado").first()).toBeVisible();
  await expect.element(screen.getByText("$ 2.130,00")).toBeVisible();
  await expect.element(screen.getByText("Líneas con promoción")).toBeVisible();
  await expect.element(screen.getByText("84", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("Más usada")).toBeVisible();
  await expect.element(screen.getByText("50 líneas")).toBeVisible();
  await expectNoAccessibilityViolations(screen.container);
});

test("names the period only in its range fields", async () => {
  const screen = await renderScreen(createServices());
  await expect.element(screen.getByText("Líneas con promoción")).toBeVisible();

  expect(screen.getByText(/01\/10\/2026/).query()).toBeNull();
  expect(screen.getByText(/07\/10\/2026/).query()).toBeNull();
});

test("shows each promotion with its lines, quantity sold and amount discounted", async () => {
  const screen = await renderScreen(createServices());

  const table = screen.getByRole("table", { name: "Descuentos por promoción" });
  for (const header of ["Promoción", "Líneas", "Cantidad", "Descontado"]) {
    await expect.element(table.getByRole("columnheader", { name: header })).toBeVisible();
  }
  const bundle = table.getByRole("row", { name: /Tres por dos/ });
  await expect.element(bundle.getByText("50", { exact: true })).toBeVisible();
  await expect.element(bundle.getByText("150 u · 2,500 kg")).toBeVisible();
  await expect.element(bundle.getByText("$ 900,00")).toBeVisible();
});

test("writes the target, the benefit and the weekdays of a promotion under its name", async () => {
  const screen = await renderScreen(createServices());

  const table = screen.getByRole("table");
  await expect
    .element(table.getByText("Categoría · Almacén › Yerbas · 15 % de descuento · Sábado y domingo"))
    .toBeVisible();
});

test("leaves the weekdays out when the promotion runs every day", async () => {
  const screen = await renderScreen(createServices());

  const table = screen.getByRole("table");
  await expect.element(table.getByText("Producto · Azúcar 1 kg · Lleve 3, pague 2")).toBeVisible();
  expect(table.getByText(/Todos los días/).query()).toBeNull();
});

test("leaves the weekdays out when all seven are marked", async () => {
  const services = createServices();
  vi.mocked(services.fetchSalesByPromotion).mockResolvedValue({
    kind: "ok",
    value: singleLinePromotionReport,
  });

  const screen = await renderScreen(services);

  await expect
    .element(screen.getByText("Categoría · Almacén › Yerbas · 15 % de descuento", { exact: true }))
    .toBeVisible();
});

test("calls a promotion that no longer exists Promoción desconocida, with no terms", async () => {
  const screen = await renderScreen(createServices());

  const row = screen.getByRole("table").getByRole("row", { name: /Promoción desconocida/ });
  await expect.element(row.getByText("1,250 kg")).toBeVisible();
  await expect.element(row.getByText("$ 30,00")).toBeVisible();
  expect(row.getByText(/·/).query()).toBeNull();
});

test("names the most used promotion in the report, whatever order the table is in", async () => {
  const screen = await renderScreen(createServices(), {
    filters: salesByPromotionFilters.parse({ sortBy: "lines", sort: "ascending" }),
  });
  await expect.element(screen.getByRole("table").getByText("Tres por dos")).toBeVisible();

  await expect.element(screen.getByText("50 líneas")).toBeVisible();
});

test("counts a single line as 1 línea", async () => {
  const services = createServices();
  vi.mocked(services.fetchSalesByPromotion).mockResolvedValue({
    kind: "ok",
    value: singleLinePromotionReport,
  });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("1 línea", { exact: true })).toBeVisible();
});

test("opens on the promotion that discounted the most first", async () => {
  const screen = await renderScreen(createServices());
  await expect.element(screen.getByRole("table").getByText("Tres por dos")).toBeVisible();

  expect(shownPromotions(screen)).toEqual([
    "Finde de yerbas",
    "Tres por dos",
    "Promoción desconocida",
  ]);
});

test.each([
  [
    { sortBy: "name", sort: "ascending" },
    ["Finde de yerbas", "Promoción desconocida", "Tres por dos"],
  ],
  [
    { sortBy: "name", sort: "descending" },
    ["Tres por dos", "Promoción desconocida", "Finde de yerbas"],
  ],
  [
    { sortBy: "lines", sort: "descending" },
    ["Tres por dos", "Finde de yerbas", "Promoción desconocida"],
  ],
  [
    { sortBy: "units", sort: "ascending" },
    ["Promoción desconocida", "Finde de yerbas", "Tres por dos"],
  ],
  [
    { sortBy: "discounted", sort: "ascending" },
    ["Promoción desconocida", "Tres por dos", "Finde de yerbas"],
  ],
] as const)("opens on the order the URL asks for, %j", async (order, promotions) => {
  const screen = await renderScreen(createServices(), {
    filters: salesByPromotionFilters.parse(order),
  });
  await expect.element(screen.getByRole("table").getByText("Tres por dos")).toBeVisible();

  expect(shownPromotions(screen)).toEqual(promotions);
});

test.each([
  ["Promoción", { sortBy: "name", sort: "ascending" }],
  ["Líneas", { sortBy: "lines", sort: "descending" }],
  ["Cantidad", { sortBy: "units", sort: "descending" }],
] as const)(
  "reports the %s column as the order when its header is pressed",
  async (header, order) => {
    const onFiltersChange = vi.fn();
    const screen = await renderScreen(createServices(), { onFiltersChange });
    await expect.element(screen.getByRole("table").getByText("Tres por dos")).toBeVisible();

    await userEvent.click(
      screen.getByRole("table").getByRole("button", { name: header, exact: true }),
    );

    await expect.poll(() => onFiltersChange.mock.lastCall?.[0]).toMatchObject(order);
  },
);

test("reports the opposite direction when the column it is ordered by is pressed again", async () => {
  const onFiltersChange = vi.fn();
  const screen = await renderScreen(createServices(), { onFiltersChange });
  await expect.element(screen.getByRole("table").getByText("Tres por dos")).toBeVisible();

  await userEvent.click(
    screen.getByRole("table").getByRole("button", { name: "Descontado", exact: true }),
  );

  await expect
    .poll(() => onFiltersChange.mock.lastCall?.[0])
    .toMatchObject({ sortBy: "discounted", sort: "ascending" });
});

test("asks the cloud with no range when the URL has none, and shows the range it answered", async () => {
  const services = createServices();

  const screen = await renderScreen(services);

  await expect.poll(() => dateSegments(screen, "Desde")).toEqual(["1", "10", "2026"]);
  expect(dateSegments(screen, "Hasta")).toEqual(["7", "10", "2026"]);
  expect(services.fetchSalesByPromotion).toHaveBeenCalledWith({});
});

test("asks the cloud for the range and the register the URL names", async () => {
  const services = createServices();

  await renderScreen(services, {
    filters: salesByPromotionFilters.parse({
      from: "2026-10-02",
      to: "2026-10-05",
      register: FRONT_REGISTER_ID,
    }),
  });

  await expect
    .poll(() => vi.mocked(services.fetchSalesByPromotion).mock.lastCall)
    .toEqual([{ from: "2026-10-02", to: "2026-10-05", register_id: FRONT_REGISTER_ID }]);
});

test("asks the cloud again for the register chosen in the filters", async () => {
  const services = createServices();
  const screen = await renderScreen(services);
  await expect.element(screen.getByRole("table").getByText("Tres por dos")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: /Caja:/ }));
  await userEvent.click(screen.getByRole("option", { name: "Caja principal" }));

  await expect
    .poll(() => vi.mocked(services.fetchSalesByPromotion).mock.lastCall)
    .toEqual([{ register_id: FRONT_REGISTER_ID }]);
});

test("keeps the previous rows, marked as updating, while another register loads", async () => {
  const services = createServices();
  const screen = await renderScreen(services);
  await expect.element(screen.getByRole("table").getByText("Tres por dos")).toBeVisible();
  vi.mocked(services.fetchSalesByPromotion).mockReturnValue(new Promise(() => {}));

  await userEvent.click(screen.getByRole("button", { name: /Caja:/ }));
  await userEvent.click(screen.getByRole("option", { name: "Caja principal" }));

  await expect
    .element(screen.getByRole("table", { name: "Descuentos por promoción" }))
    .toHaveAttribute("aria-busy", "true");
  await expect.element(screen.getByRole("table").getByText("Tres por dos")).toBeVisible();
  await expect.element(screen.getByText("50 líneas")).toBeVisible();
});

test("shows placeholders while the report loads", async () => {
  const services = createServices();
  vi.mocked(services.fetchSalesByPromotion).mockReturnValue(new Promise(() => {}));

  const screen = await renderScreen(services);

  await expect
    .element(screen.getByRole("table", { name: "Descuentos por promoción" }))
    .toHaveAttribute("aria-busy", "true");
  await expect.element(screen.getByText("Líneas con promoción")).toBeVisible();
  await expect.element(screen.getByText("Más usada")).toBeVisible();
  expect(screen.getByText("$ 2.130,00").query()).toBeNull();
});

test("says there are no discounts in the period, with no most used promotion, when there are none", async () => {
  const services = createServices();
  vi.mocked(services.fetchSalesByPromotion).mockResolvedValue({
    kind: "ok",
    value: noPromotionDiscountsReport,
  });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("No hay descuentos en este período")).toBeVisible();
  await expect.element(screen.getByText("$ 0,00")).toBeVisible();
  await expect.element(screen.getByText("0", { exact: true })).toBeVisible();
  expect(screen.getByText("—", { exact: true }).elements()).toHaveLength(1);
});

test("says the register has no discounts in the period when one is chosen and none were made", async () => {
  const services = createServices();
  vi.mocked(services.fetchSalesByPromotion).mockResolvedValue({
    kind: "ok",
    value: noPromotionDiscountsReport,
  });

  const screen = await renderScreen(services, {
    filters: salesByPromotionFilters.parse({ register: FRONT_REGISTER_ID }),
  });

  await expect
    .element(screen.getByText("No hay descuentos de esta caja en este período"))
    .toBeVisible();
});

test("shows a failed load with a retry that loads the report again", async () => {
  const services = createServices();
  vi.mocked(services.fetchSalesByPromotion)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockResolvedValueOnce({ kind: "ok", value: promotionDiscountsReport });
  const screen = await renderScreen(services);

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByRole("table").getByText("Tres por dos")).toBeVisible();
  expect(services.fetchSalesByPromotion).toHaveBeenCalledTimes(2);
});

test("ends the session when the cloud says it is over", async () => {
  const services = createServices();
  vi.mocked(services.fetchSalesByPromotion).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();

  await renderScreen(services, { onSessionEnded });

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("navigates to Mi cuenta when the report request comes back forbidden", async () => {
  const services = createServices();
  vi.mocked(services.fetchSalesByPromotion).mockResolvedValue({ kind: "forbidden" });

  await renderScreen(services);

  await expect.poll(() => window.location.pathname).toBe("/account");
});

test("shows every promotion on one page, with no pages and no export", async () => {
  const screen = await renderScreen(createServices());
  await expect.element(screen.getByRole("table").getByText("Tres por dos")).toBeVisible();

  expect(screen.getByRole("navigation", { name: /Páginas/ }).query()).toBeNull();
  expect(screen.getByRole("button", { name: "Exportar" }).query()).toBeNull();
});
