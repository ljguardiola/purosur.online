import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { useState } from "react";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { type ReportFilters, reportFiltersSearch } from "../shell/report-filters-search";
import { render } from "../shell/test-support/render-with-router";
import { dateSegments } from "../shell/test-support/report-dates";
import { FRONT_REGISTER_ID } from "../shell/test-support/report-fixtures";
import {
  createReportRegisterFilterServices,
  type ReportRegisterFilterServices,
  reportRegisterFieldForTests,
} from "../shell/test-support/report-register-filter";
import { HandTypedWeightsScreen } from "./hand-typed-weights-screen";
import type { HandTypedWeightsScreenServices } from "./hand-typed-weights-services";
import {
  handTypedWeightsReport,
  noHandTypedWeightsReport,
  singleTypedWeightReport,
} from "./test-support/hand-typed-weights-fixtures";

function createServices(): HandTypedWeightsScreenServices {
  const services = { fetchHandTypedWeights: vi.fn() };
  services.fetchHandTypedWeights.mockResolvedValue({ kind: "ok", value: handTypedWeightsReport });
  return services;
}

type Handlers = {
  filters?: ReportFilters;
  onFiltersChange?: (filters: ReportFilters) => void;
  onSessionEnded?: () => void;
};

function ControlledScreen({
  services,
  filters: initial = reportFiltersSearch.parse({}),
  onFiltersChange = () => {},
  onSessionEnded = () => {},
  registerServices,
}: Handlers & {
  services: HandTypedWeightsScreenServices;
  registerServices: ReportRegisterFilterServices;
}) {
  const [filters, setFilters] = useState(initial);
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <HandTypedWeightsScreen
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
  services: HandTypedWeightsScreenServices,
  {
    registerServices = createReportRegisterFilterServices(),
    ...handlers
  }: Handlers & { registerServices?: ReportRegisterFilterServices } = {},
) {
  return render(
    <ControlledScreen services={services} registerServices={registerServices} {...handlers} />,
  );
}

test("names the report and its figures", async () => {
  const screen = await renderScreen(createServices());

  await expect
    .element(screen.getByRole("heading", { name: "Pesos tipeados a mano", level: 1 }))
    .toBeVisible();
  await expect.element(screen.getByText("Reportes · Ventas", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("Líneas pesadas")).toBeVisible();
  await expect.element(screen.getByText("42", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("Tipeadas a mano").first()).toBeVisible();
  await expect.element(screen.getByText("9", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("Más tipeadas")).toBeVisible();
  await expect.element(screen.getByText("6 líneas")).toBeVisible();
  await expectNoAccessibilityViolations(screen.container);
});

test("shows the cashiers under their own heading, before the sessions", async () => {
  const screen = await renderScreen(createServices());

  await expect.element(screen.getByRole("heading", { name: "Por cajero", level: 2 })).toBeVisible();
  const headings = screen
    .getByRole("heading", { level: 2 })
    .elements()
    .map((heading) => heading.textContent);
  expect(headings).toEqual(["Por cajero", "Por sesión"]);
});

test("shows each cashier with the lines weighed and the ones typed by hand, as the cloud ordered them", async () => {
  const screen = await renderScreen(createServices());

  const table = screen.getByRole("table", { name: "Pesos tipeados a mano por cajero" });
  for (const header of ["Cajero", "Pesadas", "Tipeadas a mano"]) {
    await expect.element(table.getByRole("columnheader", { name: header })).toBeVisible();
  }
  const beto = table.getByRole("row", { name: /Beto/ });
  await expect.element(beto.getByText("10", { exact: true })).toBeVisible();
  await expect.element(beto.getByText("6", { exact: true })).toBeVisible();
  const names = table
    .getByRole("row")
    .elements()
    .map((row) => ["Beto", "Sin identificar", "Ana"].find((n) => row.textContent?.startsWith(n)))
    .filter((name) => name !== undefined);
  expect(names).toEqual(["Beto", "Sin identificar", "Ana"]);
});

test("shows each session with its register, its opening and its lines", async () => {
  const screen = await renderScreen(createServices());

  const table = screen.getByRole("table", { name: "Pesos tipeados a mano por sesión" });
  for (const header of ["Caja", "Apertura", "Pesadas", "Tipeadas a mano"]) {
    await expect.element(table.getByRole("columnheader", { name: header })).toBeVisible();
  }
  const first = table.getByRole("row", { name: /Caja principal/ });
  await expect.element(first.getByText("06/10/2026")).toBeVisible();
  await expect.element(first.getByText("08:30")).toBeVisible();
  await expect.element(first.getByText("12", { exact: true })).toBeVisible();
  await expect.element(first.getByText("8", { exact: true })).toBeVisible();
  const second = table.getByRole("row", { name: /Caja del fondo/ });
  await expect.element(second.getByText("05/10/2026")).toBeVisible();
  await expect.element(second.getByText("18:05")).toBeVisible();
});

test("calls a cashier no user matches Sin identificar", async () => {
  const screen = await renderScreen(createServices());

  await expect
    .element(
      screen
        .getByRole("table")
        .first()
        .getByRole("row", { name: /Sin identificar/ }),
    )
    .toBeVisible();
});

test("counts a single typed line as 1 línea", async () => {
  const services = createServices();
  vi.mocked(services.fetchHandTypedWeights).mockResolvedValue({
    kind: "ok",
    value: singleTypedWeightReport,
  });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("1 línea", { exact: true })).toBeVisible();
});

test("asks the cloud with no range when the URL has none, and shows the range it answered", async () => {
  const services = createServices();

  const screen = await renderScreen(services);

  await expect.poll(() => dateSegments(screen, "Desde")).toEqual(["1", "10", "2026"]);
  expect(dateSegments(screen, "Hasta")).toEqual(["7", "10", "2026"]);
  expect(services.fetchHandTypedWeights).toHaveBeenCalledWith({});
});

test("asks the cloud for the range and the register the URL names", async () => {
  const services = createServices();

  await renderScreen(services, {
    filters: reportFiltersSearch.parse({
      from: "2026-10-02",
      to: "2026-10-05",
      register: FRONT_REGISTER_ID,
    }),
  });

  await expect
    .poll(() => vi.mocked(services.fetchHandTypedWeights).mock.lastCall)
    .toEqual([{ from: "2026-10-02", to: "2026-10-05", register_id: FRONT_REGISTER_ID }]);
});

test("asks the cloud again for the register chosen in the filters", async () => {
  const services = createServices();
  const screen = await renderScreen(services);
  await expect.element(screen.getByRole("table").first().getByText("Beto")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: /Caja:/ }));
  await userEvent.click(screen.getByRole("option", { name: "Caja principal" }));

  await expect
    .poll(() => vi.mocked(services.fetchHandTypedWeights).mock.lastCall)
    .toEqual([{ register_id: FRONT_REGISTER_ID }]);
});

test("keeps the previous rows, marked as updating, while another register loads", async () => {
  const services = createServices();
  const screen = await renderScreen(services);
  await expect.element(screen.getByRole("table").first().getByText("Beto")).toBeVisible();
  vi.mocked(services.fetchHandTypedWeights).mockReturnValue(new Promise(() => {}));

  await userEvent.click(screen.getByRole("button", { name: /Caja:/ }));
  await userEvent.click(screen.getByRole("option", { name: "Caja principal" }));

  await expect
    .element(screen.getByRole("table", { name: "Pesos tipeados a mano por cajero" }))
    .toHaveAttribute("aria-busy", "true");
  await expect.element(screen.getByRole("table").first().getByText("Beto")).toBeVisible();
  await expect.element(screen.getByText("6 líneas")).toBeVisible();
});

test("shows placeholders while the report loads", async () => {
  const services = createServices();
  vi.mocked(services.fetchHandTypedWeights).mockReturnValue(new Promise(() => {}));

  const screen = await renderScreen(services);

  for (const name of ["Pesos tipeados a mano por cajero", "Pesos tipeados a mano por sesión"]) {
    await expect.element(screen.getByRole("table", { name })).toHaveAttribute("aria-busy", "true");
  }
  await expect.element(screen.getByText("Líneas pesadas")).toBeVisible();
  expect(screen.getByText("42", { exact: true }).query()).toBeNull();
});

test("says nothing was weighed in the period, with no cashier, when there are no lines", async () => {
  const services = createServices();
  vi.mocked(services.fetchHandTypedWeights).mockResolvedValue({
    kind: "ok",
    value: noHandTypedWeightsReport,
  });

  const screen = await renderScreen(services);

  await expect
    .element(screen.getByText("No hay productos pesados en este período").first())
    .toBeVisible();
  expect(screen.getByText("—", { exact: true }).elements()).toHaveLength(1);
});

test("says the register weighed nothing in the period when one is chosen and none were", async () => {
  const services = createServices();
  vi.mocked(services.fetchHandTypedWeights).mockResolvedValue({
    kind: "ok",
    value: noHandTypedWeightsReport,
  });

  const screen = await renderScreen(services, {
    filters: reportFiltersSearch.parse({ register: FRONT_REGISTER_ID }),
  });

  await expect
    .element(screen.getByText("No hay productos pesados en esta caja en este período").first())
    .toBeVisible();
});

test("shows a failed load with a retry that loads the report again", async () => {
  const services = createServices();
  vi.mocked(services.fetchHandTypedWeights)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockResolvedValueOnce({ kind: "ok", value: handTypedWeightsReport });
  const screen = await renderScreen(services);

  await expect
    .element(screen.getByText("No pudimos abrir el reporte de pesos tipeados a mano"))
    .toBeVisible();
  expect(screen.getByRole("table").query()).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByRole("table").first().getByText("Beto")).toBeVisible();
  expect(services.fetchHandTypedWeights).toHaveBeenCalledTimes(2);
});

test("ends the session when the cloud says it is over", async () => {
  const services = createServices();
  vi.mocked(services.fetchHandTypedWeights).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();

  await renderScreen(services, { onSessionEnded });

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("navigates to Mi cuenta when the report request comes back forbidden", async () => {
  const services = createServices();
  vi.mocked(services.fetchHandTypedWeights).mockResolvedValue({ kind: "forbidden" });

  await renderScreen(services);

  await expect.poll(() => window.location.pathname).toBe("/account");
});
