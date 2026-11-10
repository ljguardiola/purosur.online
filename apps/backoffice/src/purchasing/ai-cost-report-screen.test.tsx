import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations, tokenRgb } from "@purosur/ui/test";
import { useState } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { readDownloadedXlsx } from "../platform/spreadsheet/test-support/read-xlsx";
import { render } from "../shell/test-support/render-with-router";
import { periodSegments, typePeriodEnd, typePeriodStart } from "../shell/test-support/report-dates";
import { spyOnDownloads } from "../shell/test-support/spy-on-downloads";
import { type AiCostReportFilters, aiCostReportFilters } from "./ai-cost-report-filters";
import { AiCostReportScreen } from "./ai-cost-report-screen";
import type { AiCostReportScreenServices } from "./ai-cost-report-services";
import {
  AI_COST_BY_DAY,
  AI_COST_BY_PERSON,
  AI_COST_BY_SUPPLIER,
  EMPTY_AI_COST,
  INCOMPLETE_AI_COST_BY_SUPPLIER,
} from "./test-support/ai-cost";

beforeEach(async () => {
  await page.viewport(1280, 900);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function createServices(): AiCostReportScreenServices {
  const services = { fetchAiCostReport: vi.fn() };
  services.fetchAiCostReport.mockResolvedValue({ kind: "ok", value: AI_COST_BY_SUPPLIER });
  return services;
}

type Handlers = {
  filters?: AiCostReportFilters;
  onFiltersChange?: (filters: AiCostReportFilters) => void;
  onSessionEnded?: () => void;
};

function ControlledScreen({
  services,
  filters: initial = aiCostReportFilters.parse({}),
  onFiltersChange = () => {},
  onSessionEnded = () => {},
}: Handlers & { services: AiCostReportScreenServices }) {
  const [filters, setFilters] = useState(initial);
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <AiCostReportScreen
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

function renderScreen(services: AiCostReportScreenServices, handlers: Handlers = {}) {
  return render(<ControlledScreen services={services} {...handlers} />);
}

type Screen = Awaited<ReturnType<typeof renderScreen>>;

const TITLE = "Costo de IA";

function costTable(screen: Screen) {
  return screen.getByRole("table", { name: TITLE, exact: true });
}

function emptyStateIconColor(title: Element): string {
  const icon = title.parentElement?.querySelector("svg");
  return icon ? getComputedStyle(icon).color : "";
}

test("has no accessibility violations", async () => {
  const screen = await renderScreen(createServices());

  await expectNoAccessibilityViolations(screen.container);
});

test("shows, for each supplier, what reading cost, what the proposals cost and their sum", async () => {
  const screen = await renderScreen(createServices());

  const table = costTable(screen);
  for (const name of ["Proveedor", "Lectura", "Propuestas", "Total"]) {
    await expect.element(table.getByRole("columnheader", { name })).toBeVisible();
  }
  const andina = table.getByRole("row", { name: /^Distribuidora Andina/ });
  await expect.element(andina.getByText("US$ 1,0000", { exact: true })).toBeVisible();
  await expect.element(andina.getByText("US$ 0,5000", { exact: true })).toBeVisible();
  await expect.element(andina.getByText("US$ 1,5000", { exact: true })).toBeVisible();
  const almacen = table.getByRole("row", { name: /^Almacén del Sur/ });
  await expect.element(almacen.getByText("US$ 2,2500", { exact: true })).toBeVisible();
});

test("lists the groups in the order the cloud answered them", async () => {
  const screen = await renderScreen(createServices());
  await expect.element(costTable(screen).getByText("Distribuidora Andina")).toBeVisible();

  const names = costTable(screen)
    .getByRole("row")
    .elements()
    .map((row) => /Distribuidora Andina|Almacén del Sur/.exec(row.textContent ?? "")?.[0])
    .filter((name) => name !== undefined);
  expect(names).toEqual(["Distribuidora Andina", "Almacén del Sur"]);
});

test("shows the period's cost of reading, of proposals and in total, from the cloud", async () => {
  const screen = await renderScreen(createServices());

  await expect.element(screen.getByText(/^Costo de lecturaUS\$ 3,0000$/)).toBeVisible();
  await expect.element(screen.getByText(/^Costo de propuestasUS\$ 0,7500$/)).toBeVisible();
  await expect.element(screen.getByText(/^Costo totalUS\$ 3,7500$/)).toBeVisible();
});

test("marks as incomplete a cost with calls whose model had no price, in a row and in the total", async () => {
  const services = createServices();
  vi.mocked(services.fetchAiCostReport).mockResolvedValue({
    kind: "ok",
    value: INCOMPLETE_AI_COST_BY_SUPPLIER,
  });

  const screen = await renderScreen(services);

  const andina = costTable(screen).getByRole("row", { name: /^Distribuidora Andina/ });
  await expect.element(andina.getByText("Incompleto: 3 llamadas sin precio").first()).toBeVisible();
  const almacen = costTable(screen).getByRole("row", { name: /^Almacén del Sur/ });
  expect(almacen.element().textContent).not.toContain("Incompleto");
  await expect
    .element(screen.getByText(/^Costo totalIncompleto: 3 llamadas sin precioUS\$ 3,7500$/))
    .toBeVisible();
  await expect
    .element(screen.getByText(/^Costo de propuestasIncompleto: 3 llamadas sin precioUS\$ 0,7500$/))
    .toBeVisible();
  expect(screen.getByText(/^Costo de lecturaIncompleto/).query()).toBeNull();
});

test("asks the cloud for the grouping in the URL and no range when the URL has none, and shows the range it answered", async () => {
  const services = createServices();

  const screen = await renderScreen(services);

  await expect.poll(() => periodSegments(screen).slice(0, 3)).toEqual(["1", "10", "2026"]);
  expect(periodSegments(screen).slice(3)).toEqual(["31", "10", "2026"]);
  expect(services.fetchAiCostReport).toHaveBeenCalledWith({ group_by: "supplier" });
});

test("asks the cloud for the range the URL names", async () => {
  const services = createServices();

  await renderScreen(services, {
    filters: aiCostReportFilters.parse({ from: "2026-10-02", to: "2026-10-05", group: "person" }),
  });

  await expect
    .poll(() => vi.mocked(services.fetchAiCostReport).mock.lastCall)
    .toEqual([{ from: "2026-10-02", to: "2026-10-05", group_by: "person" }]);
});

test("asks the cloud again for the range typed in the filters", async () => {
  const services = createServices();
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Distribuidora Andina").first()).toBeVisible();

  await typePeriodStart(screen, "01102026");
  await typePeriodEnd(screen, "07102026");

  await expect
    .poll(() => vi.mocked(services.fetchAiCostReport).mock.lastCall)
    .toEqual([{ from: "2026-10-01", to: "2026-10-07", group_by: "supplier" }]);
});

test("offers the groupings by day, by supplier and by person, and reports the one chosen", async () => {
  const services = createServices();
  const onFiltersChange = vi.fn();
  const screen = await renderScreen(services, { onFiltersChange });
  await expect.element(screen.getByText("Distribuidora Andina").first()).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: /Agrupar por:/ }));
  expect(
    screen
      .getByRole("option")
      .elements()
      .map((option) => option.textContent),
  ).toEqual(["Día", "Proveedor", "Persona"]);
  vi.mocked(services.fetchAiCostReport).mockResolvedValue({
    kind: "ok",
    value: AI_COST_BY_PERSON,
  });
  await userEvent.click(screen.getByRole("option", { name: "Persona" }));

  await expect.poll(() => onFiltersChange.mock.lastCall?.[0]).toMatchObject({ group: "person" });
  await expect
    .poll(() => vi.mocked(services.fetchAiCostReport).mock.lastCall)
    .toEqual([{ group_by: "person" }]);
});

test("names the groups by person under a Persona column", async () => {
  const services = createServices();
  vi.mocked(services.fetchAiCostReport).mockResolvedValue({
    kind: "ok",
    value: AI_COST_BY_PERSON,
  });

  const screen = await renderScreen(services, {
    filters: aiCostReportFilters.parse({ group: "person" }),
  });

  await expect
    .element(costTable(screen).getByRole("columnheader", { name: "Persona" }))
    .toBeVisible();
  await expect.element(costTable(screen).getByText("Lucía Ferreyra")).toBeVisible();
});

test("writes each day as the application writes dates, under a Día column", async () => {
  const services = createServices();
  vi.mocked(services.fetchAiCostReport).mockResolvedValue({ kind: "ok", value: AI_COST_BY_DAY });

  const screen = await renderScreen(services, {
    filters: aiCostReportFilters.parse({ group: "day" }),
  });

  await expect.element(costTable(screen).getByRole("columnheader", { name: "Día" })).toBeVisible();
  await expect.element(costTable(screen).getByText("03/10/2026")).toBeVisible();
});

test("keeps the previous report in view, marked as updating, while another range loads", async () => {
  const services = createServices();
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Distribuidora Andina")).toBeVisible();
  vi.mocked(services.fetchAiCostReport).mockReturnValue(new Promise(() => {}));

  await typePeriodStart(screen, "01102026");
  await typePeriodEnd(screen, "07102026");

  await expect.element(costTable(screen)).toHaveAttribute("aria-busy", "true");
  await expect.element(screen.getByText("Distribuidora Andina")).toBeVisible();
});

test("shows placeholders while the report loads", async () => {
  const services = createServices();
  vi.mocked(services.fetchAiCostReport).mockReturnValue(new Promise(() => {}));

  const screen = await renderScreen(services);

  await expect.element(costTable(screen)).toHaveAttribute("aria-busy", "true");
  await expect.element(screen.getByText("Costo total", { exact: true })).toBeVisible();
  expect(screen.getByText("US$ 3,7500").query()).toBeNull();
});

test("says there is no AI cost in the period when there is none", async () => {
  const services = createServices();
  vi.mocked(services.fetchAiCostReport).mockResolvedValue({ kind: "ok", value: EMPTY_AI_COST });

  const screen = await renderScreen(services);

  const empty = costTable(screen).getByText("No hay costo de IA en este período");
  await expect.element(empty).toBeVisible();
  await expect.element(screen.getByText(/^Costo totalUS\$ 0,0000$/)).toBeVisible();
  expect(emptyStateIconColor(empty.element())).toBe(tokenRgb("text-accent"));
});

test("says there is no AI cost in the chosen period as a filtered result", async () => {
  const services = createServices();
  vi.mocked(services.fetchAiCostReport).mockResolvedValue({ kind: "ok", value: EMPTY_AI_COST });

  const screen = await renderScreen(services, {
    filters: aiCostReportFilters.parse({ from: "2026-10-02", to: "2026-10-05" }),
  });

  const empty = costTable(screen).getByText("No hay costo de IA en este período");
  await expect.element(empty).toBeVisible();
  expect(emptyStateIconColor(empty.element())).toBe(tokenRgb("text-subtle"));
});

test("shows a failed load with a retry that loads the report again, and no figures", async () => {
  const services = createServices();
  vi.mocked(services.fetchAiCostReport)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockResolvedValueOnce({ kind: "ok", value: AI_COST_BY_SUPPLIER });
  const screen = await renderScreen(services);

  await expect.element(screen.getByRole("button", { name: "Reintentar" }).first()).toBeVisible();
  await expect
    .element(screen.getByText("No pudimos abrir el costo de IA", { exact: true }).first())
    .toBeVisible();
  expect(screen.getByText("Costo total", { exact: true }).query()).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }).first());

  await expect.element(screen.getByText("Distribuidora Andina")).toBeVisible();
  expect(services.fetchAiCostReport).toHaveBeenCalledTimes(2);
});

test("ends the session when the cloud says it is over", async () => {
  const services = createServices();
  vi.mocked(services.fetchAiCostReport).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();

  await renderScreen(services, { onSessionEnded });

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("sends the person to Mi cuenta when the cloud refuses the report", async () => {
  const services = createServices();
  vi.mocked(services.fetchAiCostReport).mockResolvedValue({ kind: "forbidden" });

  await renderScreen(services);

  await expect
    .poll(() => window.location.pathname + window.location.search)
    .toBe("/?account=credentials");
});

test("downloads a spreadsheet of the groups shown, for the grouping and the period applied", async () => {
  const downloads = spyOnDownloads();
  const services = createServices();
  vi.mocked(services.fetchAiCostReport).mockResolvedValue({
    kind: "ok",
    value: INCOMPLETE_AI_COST_BY_SUPPLIER,
  });
  const screen = await renderScreen(services, {
    filters: aiCostReportFilters.parse({ group: "supplier" }),
  });
  await expect.element(costTable(screen).getByText("Distribuidora Andina")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Descargar planilla" }));

  await expect.poll(() => downloads.names).toEqual(["costo-de-ia-2026-10-01-2026-10-31.xlsx"]);
  const file = await readDownloadedXlsx(downloads.blobs[0]);
  expect(file.sheetNames).toEqual(["Resumen", "Costo de IA"]);
  expect(file.sheet(0).get("B4")?.value).toBe("Proveedor");
  expect(file.sheet(0).get("B5")?.value).toBe("3");
  expect(file.sheet(0).get("B9")?.value).toBe("3");
  const costs = file.sheet(1);
  expect(costs.get("A2")?.value).toBe("Distribuidora Andina");
  expect(costs.get("B2")?.value).toBe("1");
  expect(costs.get("C2")?.value).toBe("0.5");
  expect(costs.get("F2")?.value).toBe("3");
  expect(costs.get("A3")?.value).toBe("Almacén del Sur");
});

test("downloads the days of a report grouped by day as dates", async () => {
  const downloads = spyOnDownloads();
  const services = createServices();
  vi.mocked(services.fetchAiCostReport).mockResolvedValue({ kind: "ok", value: AI_COST_BY_DAY });
  const screen = await renderScreen(services, {
    filters: aiCostReportFilters.parse({ group: "day" }),
  });
  await expect.element(costTable(screen).getByText("03/10/2026")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Descargar planilla" }));

  await expect.poll(() => downloads.blobs.length).toBe(1);
  const file = await readDownloadedXlsx(downloads.blobs[0]);
  expect(file.sheet(0).get("B4")?.value).toBe("Día");
  expect(file.sheet(1).get("A1")?.value).toBe("Día");
  expect(file.sheet(1).get("A2")).toMatchObject({ numberFormat: "dd/mm/yyyy" });
});

test("has its download disabled while the report loads and after loading fails", async () => {
  const services = createServices();
  vi.mocked(services.fetchAiCostReport).mockReturnValue(new Promise(() => {}));
  const loading = await renderScreen(services);
  await expect.element(loading.getByRole("button", { name: "Descargar planilla" })).toBeDisabled();
  await loading.unmount();

  vi.mocked(services.fetchAiCostReport).mockResolvedValue({ kind: "failed" });
  const failed = await renderScreen(services);
  await expect.element(failed.getByRole("button", { name: "Reintentar" })).toBeVisible();
  await expect.element(failed.getByRole("button", { name: "Descargar planilla" })).toBeDisabled();
});
