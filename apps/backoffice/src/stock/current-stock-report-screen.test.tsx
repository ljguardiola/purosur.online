import { FieldSizeProvider, formatCents, formatPercent, formatSignedCents } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { useState } from "react";
import { beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import {
  type CurrentStockReportFilters,
  currentStockReportFilters,
} from "./current-stock-report-filters";
import { CurrentStockReportScreen } from "./current-stock-report-screen";
import type { CurrentStockReportScreenServices } from "./current-stock-report-services";
import {
  almondOilProduct,
  almondsProduct,
  crackersProduct,
  currentStockReport,
  NUTS_CATEGORY_ID,
  teaProduct,
  yerbaProduct,
} from "./test-support/current-stock-report-fixtures";

beforeEach(async () => {
  await page.viewport(1280, 900);
});

function createServices(): CurrentStockReportScreenServices {
  return { fetchCurrentStockReport: vi.fn() };
}

function listed(report = currentStockReport()) {
  const services = createServices();
  vi.mocked(services.fetchCurrentStockReport).mockResolvedValue({ kind: "ok", value: report });
  return services;
}

function Harness({
  services,
  initial = currentStockReportFilters.parse({}),
  onFiltersChange = () => {},
  onSessionEnded = () => {},
}: {
  services: CurrentStockReportScreenServices;
  initial?: CurrentStockReportFilters;
  onFiltersChange?: (filters: CurrentStockReportFilters) => void;
  onSessionEnded?: () => void;
}) {
  const [filters, setFilters] = useState(initial);
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <CurrentStockReportScreen
          services={services}
          filters={filters}
          onFiltersChange={(next) => {
            onFiltersChange(next);
            setFilters(next);
          }}
          onSessionEnded={onSessionEnded}
        />
      </main>
    </FieldSizeProvider>
  );
}

function renderScreen(
  services: CurrentStockReportScreenServices,
  props: Omit<Parameters<typeof Harness>[0], "services"> = {},
) {
  return render(<Harness services={services} {...props} />);
}

const TABLE = { name: "Stock actual valorizado" } as const;

const PRODUCT_NAMES = [almondsProduct, yerbaProduct, crackersProduct, teaProduct].map(
  ({ name }) => name,
);

function shownProductNames(screen: Awaited<ReturnType<typeof renderScreen>>) {
  return screen
    .getByRole("table", TABLE)
    .getByRole("row")
    .elements()
    .map((row) => PRODUCT_NAMES.find((name) => row.textContent?.includes(name)))
    .filter((name) => name !== undefined);
}

test("titles the report under the stock reports", async () => {
  const screen = await renderScreen(listed());

  await expect
    .element(screen.getByRole("heading", { name: "Stock actual valorizado", level: 1 }))
    .toBeVisible();
  await expect.element(screen.getByText("Reportes · Stock")).toBeVisible();
});

test("shows the value at cost, the negative balances and the products without cost", async () => {
  const screen = await renderScreen(listed());

  await expect.element(screen.getByText("Valorizado a costo")).toBeVisible();
  await expect.element(screen.getByText(formatCents(15_760_100))).toBeVisible();
  await expect.element(screen.getByText("4 productos")).toBeVisible();
  await expect.element(screen.getByText("Con saldo negativo")).toBeVisible();
  await expect.element(screen.getByText("Sin costo", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("No suman al valorizado")).toBeVisible();
  expect(screen.getByText("1 producto", { exact: true }).elements()).toHaveLength(2);
});

test("shows each product with its category, lots, balance, value and share of the total", async () => {
  const screen = await renderScreen(listed());

  const table = screen.getByRole("table", TABLE);
  await expect.element(table.getByText("Almendras peladas")).toBeVisible();
  await expect.element(table.getByText("Frutos secos")).toBeVisible();
  await expect.element(table.getByText("12,150 kg")).toBeVisible();
  await expect.element(table.getByText("24 u")).toBeVisible();
  await expect.element(table.getByText("− 4 u")).toBeVisible();
  await expect.element(table.getByText(formatSignedCents(12_400_100))).toBeVisible();
  await expect.element(table.getByText(formatSignedCents(-240_000))).toBeVisible();
  await expect.element(table.getByText(formatPercent(78))).toBeVisible();
  await expectNoAccessibilityViolations(screen.container);
});

test("shares out the total among the products valued above zero", async () => {
  const screen = await renderScreen(listed());

  const table = screen.getByRole("table", TABLE);
  const yerba = table.getByRole("row").filter({ hasText: yerbaProduct.name });
  const crackers = table.getByRole("row").filter({ hasText: crackersProduct.name });
  await expect.element(yerba.getByText(formatPercent(22))).toBeVisible();
  await expect.element(crackers.getByText("—")).toBeVisible();
});

test("shows a product without a known value, and its share, as a dash", async () => {
  const screen = await renderScreen(listed(currentStockReport([teaProduct])));

  await expect.element(screen.getByText("Té verde en hebras")).toBeVisible();
  const row = screen.getByRole("row").filter({ hasText: "Té verde en hebras" });
  await expect.element(row).toBeVisible();
  expect(row.getByText("—").elements()).toHaveLength(2);
});

test("lists the products from the most valuable, those without value last", async () => {
  const screen = await renderScreen(listed());
  await expect.element(screen.getByText("Almendras peladas")).toBeVisible();

  expect(shownProductNames(screen)).toEqual(PRODUCT_NAMES);
});

test("opens on the order the URL asks for and reports a new one", async () => {
  const onFiltersChange = vi.fn();
  const screen = await renderScreen(listed(), {
    initial: currentStockReportFilters.parse({ sortBy: "product", sort: "ascending" }),
    onFiltersChange,
  });
  await expect.element(screen.getByText("Almendras peladas")).toBeVisible();
  expect(shownProductNames(screen)).toEqual([
    almondsProduct.name,
    crackersProduct.name,
    teaProduct.name,
    yerbaProduct.name,
  ]);

  await userEvent.click(screen.getByRole("button", { name: "Saldo" }));

  await expect.poll(() => onFiltersChange.mock.lastCall?.[0]).toMatchObject({ sortBy: "balance" });
});

test("orders products of the same name by their whole description", async () => {
  const largeAlmondOilProduct = {
    ...almondOilProduct,
    id: "77777777-7777-4777-8777-777777777776",
    net_content: { quantity: 100, unit: "ML" as const },
  };
  const descriptions = ["Aceite de Almendras Vitora 30 ml", "Aceite de Almendras Vitora 100 ml"];
  const screen = await renderScreen(
    listed(currentStockReport([largeAlmondOilProduct, almondOilProduct])),
    { initial: currentStockReportFilters.parse({ sortBy: "product", sort: "ascending" }) },
  );
  await expect.element(screen.getByText("Aceite de Almendras Vitora 100 ml")).toBeVisible();

  expect(
    screen
      .getByRole("table", TABLE)
      .getByRole("row")
      .elements()
      .map((row) => descriptions.find((description) => row.textContent?.includes(description)))
      .filter((description) => description !== undefined),
  ).toEqual(descriptions);
});

test("shows the lots of a product", async () => {
  const screen = await renderScreen(listed());
  await expect.element(screen.getByText("Almendras peladas")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Ver los lotes de Almendras peladas" }));

  const lots = screen.getByRole("table", { name: "Lotes de Almendras peladas" });
  await expect.element(lots.getByText("L-2312")).toBeVisible();
  await expectNoAccessibilityViolations(screen.container);
});

test("hides the lots again", async () => {
  const screen = await renderScreen(listed());
  await expect.element(screen.getByText("Almendras peladas")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Ver los lotes de Almendras peladas" }));

  await userEvent.click(
    screen.getByRole("button", { name: "Ocultar los lotes de Almendras peladas" }),
  );

  expect(screen.getByRole("table", { name: "Lotes de Almendras peladas" }).query()).toBeNull();
});

test("offers the categories the report names, and reports the one chosen", async () => {
  const onFiltersChange = vi.fn();
  const screen = await renderScreen(listed(), { onFiltersChange });
  await expect.element(screen.getByText("Almendras peladas")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: /Categoría:/ }));
  const options = screen
    .getByRole("option")
    .elements()
    .map((option) => option.textContent);
  expect(options).toEqual(["Todas", "Almacén", "Frutos secos"]);
  await userEvent.click(screen.getByRole("option", { name: "Frutos secos" }));

  await expect
    .poll(() => onFiltersChange.mock.lastCall?.[0])
    .toMatchObject({ category: NUTS_CATEGORY_ID });
});

test("asks for the category the URL carries", async () => {
  const services = listed();

  await renderScreen(services, {
    initial: currentStockReportFilters.parse({ category: NUTS_CATEGORY_ID }),
  });

  await expect
    .poll(() => services.fetchCurrentStockReport)
    .toHaveBeenCalledWith({ category_id: NUTS_CATEGORY_ID });
});

test("asks for every category when none is chosen", async () => {
  const services = listed();

  await renderScreen(services);

  await expect.poll(() => services.fetchCurrentStockReport).toHaveBeenCalledWith({});
});

test("asks for every category and reports it when the URL's category is not an id", async () => {
  const services = listed();
  const onFiltersChange = vi.fn();

  await renderScreen(services, {
    initial: currentStockReportFilters.parse({ category: "frutos-secos" }),
    onFiltersChange,
  });

  await expect.poll(() => services.fetchCurrentStockReport).toHaveBeenCalledWith({});
  expect(services.fetchCurrentStockReport).not.toHaveBeenCalledWith({
    category_id: "frutos-secos",
  });
  await expect.poll(() => onFiltersChange.mock.lastCall?.[0]).toMatchObject({ category: "ALL" });
});

test("keeps showing the report while the next category loads", async () => {
  const services = listed();
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Almendras peladas")).toBeVisible();
  vi.mocked(services.fetchCurrentStockReport).mockReturnValue(new Promise(() => {}));

  await userEvent.click(screen.getByRole("button", { name: /Categoría:/ }));
  await userEvent.click(screen.getByRole("option", { name: "Frutos secos" }));

  await expect
    .poll(() => services.fetchCurrentStockReport)
    .toHaveBeenLastCalledWith({ category_id: NUTS_CATEGORY_ID });
  await expect.element(screen.getByText("Almendras peladas")).toBeVisible();
  await expect.element(screen.getByText(formatCents(15_760_100))).toBeVisible();
});

test("shows the screen loading while the report is on its way", async () => {
  const services = createServices();
  vi.mocked(services.fetchCurrentStockReport).mockReturnValue(new Promise(() => {}));

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Valorizado a costo")).toBeVisible();
  expect(screen.getByText("4 productos").query()).toBeNull();
  await expect.element(screen.getByRole("table", TABLE)).toHaveAttribute("aria-busy", "true");
});

test("says no product holds stock when the report is empty", async () => {
  const screen = await renderScreen(listed(currentStockReport([])));

  await expect.element(screen.getByText("No hay productos con stock")).toBeVisible();
  await expect.element(screen.getByText("0 productos").first()).toBeVisible();
});

test("shows a failed load with a retry that loads the report again, and no figures", async () => {
  const services = createServices();
  vi.mocked(services.fetchCurrentStockReport)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockResolvedValueOnce({ kind: "ok", value: currentStockReport([almondsProduct]) });
  const screen = await renderScreen(services);

  await expect.element(screen.getByText("No pudimos abrir el stock actual")).toBeVisible();
  expect(screen.getByText("Valorizado a costo").query()).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByText("Almendras peladas")).toBeVisible();
  expect(services.fetchCurrentStockReport).toHaveBeenCalledTimes(2);
});

test("starts the figures from their loading placeholder when retrying a failed load", async () => {
  const services = listed();
  const screen = await renderScreen(services);
  await expect.element(screen.getByText(formatCents(15_760_100))).toBeVisible();
  vi.mocked(services.fetchCurrentStockReport)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockReturnValue(new Promise(() => {}));
  await userEvent.click(screen.getByRole("button", { name: /Categoría:/ }));
  await userEvent.click(screen.getByRole("option", { name: "Frutos secos" }));
  await expect.element(screen.getByText("No pudimos abrir el stock actual")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.poll(() => services.fetchCurrentStockReport).toHaveBeenCalledTimes(3);
  await expect.element(screen.getByText("Valorizado a costo")).toBeVisible();
  expect(screen.getByText(formatCents(15_760_100)).query()).toBeNull();
});

test("ends the session when the cloud says it is over", async () => {
  const services = createServices();
  vi.mocked(services.fetchCurrentStockReport).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();

  await renderScreen(services, { onSessionEnded });

  await expect.poll(() => onSessionEnded).toHaveBeenCalled();
});

test("typing in the category filter offers only the matching categories", async () => {
  const screen = await renderScreen(listed());
  await expect.element(screen.getByText("Almendras peladas")).toBeVisible();

  await userEvent.fill(screen.getByRole("combobox", { name: /Categoría/ }), "frut");

  expect(
    screen
      .getByRole("option")
      .all()
      .map((option) => option.element().textContent),
  ).toEqual(["Frutos secos"]);
});

test("shows each product with its brand and net content, and names its lots by them", async () => {
  const screen = await renderScreen(listed(currentStockReport([almondOilProduct])));
  const table = screen.getByRole("table", TABLE);
  await expect.element(table.getByText("Aceite de Almendras Vitora 30 ml")).toBeVisible();

  await userEvent.click(
    screen.getByRole("button", { name: "Ver los lotes de Aceite de Almendras Vitora 30 ml" }),
  );

  await expect
    .element(screen.getByRole("table", { name: "Lotes de Aceite de Almendras Vitora 30 ml" }))
    .toBeVisible();
});

test("shows the product counts with the thousands separator", async () => {
  const report = currentStockReport();
  const screen = await renderScreen(
    listed({
      ...report,
      summary: {
        ...report.summary,
        product_count: 1998,
        negative_balance_count: 1500,
        without_cost_count: 1200,
      },
    }),
  );

  await expect.element(screen.getByText("1.998 productos")).toBeVisible();
  await expect.element(screen.getByText("1.500 productos")).toBeVisible();
  await expect.element(screen.getByText("1.200 productos")).toBeVisible();
});
