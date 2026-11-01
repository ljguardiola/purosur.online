import { FieldSizeProvider, formatNumber } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { useState } from "react";
import { afterEach, beforeEach, expect, onTestFinished, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { deferred } from "../platform/test-support/deferred";
import { render } from "../shell/test-support/render-with-router";
import { type ExceptionalityFilters, exceptionalityFilters } from "./exceptionality-filters";
import { ExceptionalityScreen } from "./exceptionality-screen";
import type { ExceptionalityScreenServices } from "./exceptionality-services";
import {
  centralFiscalAddress,
  exceptionShareOf2026,
  exceptionShareOf2026WithoutBreaches,
  fiscalAddresses,
  warehouseFiscalAddress,
} from "./test-support/exception-share-fixtures";
import { createExceptionalityServices } from "./test-support/exceptionality-screen-services";

beforeEach(async () => {
  window.history.pushState(null, "", "/");
  await page.viewport(1280, 800);
  onTestFinished(() => page.viewport(414, 896));
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-15T15:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

function createServices(): ExceptionalityScreenServices {
  const services = createExceptionalityServices();
  vi.mocked(services.fetchFiscalAddresses).mockResolvedValue({
    kind: "ok",
    value: fiscalAddresses,
  });
  vi.mocked(services.fetchExceptionShareYear).mockResolvedValue({
    kind: "ok",
    value: exceptionShareOf2026,
  });
  return services;
}

type Handlers = {
  filters?: ExceptionalityFilters;
  onFiltersChange?: (filters: ExceptionalityFilters) => void;
  onSessionEnded?: () => void;
};

function ControlledScreen({
  services,
  filters: initial = exceptionalityFilters.parse({}),
  onFiltersChange = () => {},
  onSessionEnded = () => {},
}: Handlers & { services: ExceptionalityScreenServices }) {
  const [filters, setFilters] = useState(initial);
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <ExceptionalityScreen
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

function renderScreen(services: ExceptionalityScreenServices, handlers: Handlers = {}) {
  return render(<ControlledScreen services={services} {...handlers} />);
}

function rowTexts(screen: Awaited<ReturnType<typeof renderScreen>>) {
  return screen
    .getByRole("row")
    .all()
    .slice(2)
    .map((row) => row.element().textContent ?? "");
}

test("shows the eyebrow, the heading and the explanation that nothing is restricted at the counter", async () => {
  const screen = await renderScreen(createServices());

  await expect.element(screen.getByText("Caja y fiscal · Fiscal")).toBeVisible();
  await expect
    .element(screen.getByRole("heading", { name: "Excepcionalidad", level: 1 }))
    .toBeVisible();
  await expect
    .element(
      screen.getByText(
        "Un mes incumple al llegar al 5 % de comprobantes emitidos por excepción (CAEA). ARCA puede restringir el uso del CAEA; en el mostrador no se restringe nada.",
        { exact: true },
      ),
    )
    .toBeVisible();
  expect(screen.getByText(/perdi/i).query()).toBeNull();
});

test("reads the year of the first fiscal address and the current year when none is chosen", async () => {
  const services = createServices();

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Enero 2026")).toBeVisible();
  expect(services.fetchExceptionShareYear).toHaveBeenCalledWith({
    fiscalAddressId: centralFiscalAddress.id,
    year: 2026,
  });
  await expect
    .element(screen.getByRole("button", { name: /Domicilio fiscal:/ }))
    .toHaveTextContent("Domicilio fiscal: Local central");
  await expect.element(screen.getByRole("button", { name: /Año:/ })).toHaveTextContent("Año: 2026");
});

test("reads the fiscal address and the year the filters carry", async () => {
  const services = createServices();

  await renderScreen(services, {
    filters: exceptionalityFilters.parse({ fiscalAddress: warehouseFiscalAddress.id, year: 2025 }),
  });

  await expect
    .poll(() => vi.mocked(services.fetchExceptionShareYear).mock.lastCall)
    .toEqual([{ fiscalAddressId: warehouseFiscalAddress.id, year: 2025 }]);
});

test("groups the voucher counts under Comprobantes por excepción next to the month", async () => {
  const screen = await renderScreen(createServices());

  await expect.element(screen.getByText("Enero 2026")).toBeVisible();
  const group = screen.getByText("Comprobantes por excepción", { exact: true });
  await expect.element(group).toBeVisible();
  expect(group.element().getAttribute("colspan")).toBe("4");
  const headers = screen
    .getByRole("columnheader")
    .all()
    .map((header) => header.element().textContent?.trim());
  expect(headers).toEqual(["Mes", "Por excepción (CAEA)", "Total", "Porcentaje", "Estado"]);
});

test("shows each month with its vouchers by exception, its total, its share and its state", async () => {
  const screen = await renderScreen(createServices());

  await expect.element(screen.getByText("Enero 2026")).toBeVisible();
  const [january, february, march, april, may] = rowTexts(screen);
  expect(january).toBe(`Enero 2026${formatNumber(7)}${formatNumber(100)}7,0 %Incumple`);
  expect(february).toBe(`Febrero 2026${formatNumber(1)}${formatNumber(50)}2,0 %Dentro del límite`);
  expect(march).toContain("Marzo 2026");
  expect(march).toContain("6,2 %");
  expect(march).toContain("Incumple");
  expect(april).toBe(`Abril 2026${formatNumber(2)}${formatNumber(40)}5,0 %En curso`);
  expect(may).toBe(`Mayo 2026${formatNumber(0)}${formatNumber(0)}—En curso`);
  await expectNoAccessibilityViolations(screen.container);
});

test("lists the months of the year that did not comply above the table", async () => {
  const screen = await renderScreen(createServices());

  await expect
    .element(screen.getByText("Meses que incumplieron en 2026: enero, marzo", { exact: true }))
    .toBeVisible();
});

test("says no month did not comply when the cloud records none", async () => {
  const services = createServices();
  vi.mocked(services.fetchExceptionShareYear).mockResolvedValue({
    kind: "ok",
    value: exceptionShareOf2026WithoutBreaches,
  });

  const screen = await renderScreen(services);

  await expect
    .element(screen.getByText("Ningún mes incumplió en 2026", { exact: true }))
    .toBeVisible();
  expect(screen.getByText(/Meses que incumplieron/).query()).toBeNull();
});

test("shows the months of a year without vouchers with zero vouchers and no share", async () => {
  const services = createServices();
  vi.mocked(services.fetchExceptionShareYear).mockResolvedValue({
    kind: "ok",
    value: {
      ...exceptionShareOf2026,
      months: [
        {
          month: "2026-01",
          exception_count: 0,
          total_count: 0,
          share_tenths_of_percent: null,
          state: "compliant",
        },
      ],
      non_compliant_months: [],
    },
  });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Enero 2026")).toBeVisible();
  expect(rowTexts(screen)).toEqual([
    `Enero 2026${formatNumber(0)}${formatNumber(0)}—Dentro del límite`,
  ]);
});

test("offers the fiscal addresses and chooses the one picked", async () => {
  const services = createServices();
  const onFiltersChange = vi.fn();
  const screen = await renderScreen(services, { onFiltersChange });
  await expect.element(screen.getByText("Enero 2026")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: /Domicilio fiscal:/ }));
  for (const name of ["Local central", "Depósito norte"]) {
    await expect.element(screen.getByRole("option", { name })).toBeVisible();
  }
  await userEvent.click(screen.getByRole("option", { name: "Depósito norte" }));

  expect(onFiltersChange).toHaveBeenCalledWith({
    fiscalAddress: warehouseFiscalAddress.id,
    year: 2026,
  });
  await expect
    .poll(() => vi.mocked(services.fetchExceptionShareYear).mock.lastCall)
    .toEqual([{ fiscalAddressId: warehouseFiscalAddress.id, year: 2026 }]);
});

test("offers the current year and the two before it and chooses the one picked", async () => {
  const services = createServices();
  const onFiltersChange = vi.fn();
  const screen = await renderScreen(services, { onFiltersChange });
  await expect.element(screen.getByText("Enero 2026")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: /Año:/ }));
  const years = screen
    .getByRole("option")
    .all()
    .map((option) => option.element().textContent?.trim());
  expect(years).toEqual(["2026", "2025", "2024"]);
  await userEvent.click(screen.getByRole("option", { name: "2025" }));

  expect(onFiltersChange).toHaveBeenCalledWith({ fiscalAddress: "", year: 2025 });
  await expect
    .poll(() => vi.mocked(services.fetchExceptionShareYear).mock.lastCall)
    .toEqual([{ fiscalAddressId: centralFiscalAddress.id, year: 2025 }]);
});

test("shows the table loading while the fiscal addresses load", async () => {
  const services = createServices();
  const firstLoad = deferred<Awaited<ReturnType<typeof services.fetchFiscalAddresses>>>();
  vi.mocked(services.fetchFiscalAddresses).mockReturnValueOnce(firstLoad.promise);

  const screen = await renderScreen(services);

  await expect
    .element(screen.getByRole("table", { name: "Excepcionalidad por mes" }))
    .toHaveAttribute("aria-busy", "true");
  expect(services.fetchExceptionShareYear).not.toHaveBeenCalled();
});

test("shows the table loading while the year loads", async () => {
  const services = createServices();
  const yearLoad = deferred<Awaited<ReturnType<typeof services.fetchExceptionShareYear>>>();
  vi.mocked(services.fetchExceptionShareYear).mockReturnValueOnce(yearLoad.promise);

  const screen = await renderScreen(services);

  await expect
    .element(screen.getByRole("table", { name: "Excepcionalidad por mes" }))
    .toHaveAttribute("aria-busy", "true");
  expect(screen.getByText(/Meses que incumplieron|Ningún mes incumplió/).query()).toBeNull();
});

test("shows a load error with a retry action that starts again from the loading placeholder", async () => {
  const services = createServices();
  const retry = deferred<Awaited<ReturnType<typeof services.fetchExceptionShareYear>>>();
  vi.mocked(services.fetchExceptionShareYear)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockReturnValueOnce(retry.promise);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No pudimos abrir la excepcionalidad")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect
    .element(screen.getByRole("table", { name: "Excepcionalidad por mes" }))
    .toHaveAttribute("aria-busy", "true");
  retry.resolve({ kind: "ok", value: exceptionShareOf2026 });
  await expect.element(screen.getByText("Enero 2026")).toBeVisible();
});

test("shows the same load error when the fiscal addresses fail, and retrying reads them again", async () => {
  const services = createServices();
  vi.mocked(services.fetchFiscalAddresses)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockResolvedValueOnce({ kind: "ok", value: fiscalAddresses });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No pudimos abrir la excepcionalidad")).toBeVisible();
  expect(services.fetchExceptionShareYear).not.toHaveBeenCalled();

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByText("Enero 2026")).toBeVisible();
});

test("tells the cloud is busy when the year comes back rate limited", async () => {
  const services = createServices();
  vi.mocked(services.fetchExceptionShareYear).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 30,
  });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Demasiadas solicitudes")).toBeVisible();
});

test("shows an empty state when there is no fiscal address", async () => {
  const services = createServices();
  vi.mocked(services.fetchFiscalAddresses).mockResolvedValue({ kind: "ok", value: [] });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("No hay domicilios fiscales")).toBeVisible();
  expect(services.fetchExceptionShareYear).not.toHaveBeenCalled();
  expect(screen.getByText(/Meses que incumplieron|Ningún mes incumplió/).query()).toBeNull();
  await expectNoAccessibilityViolations(screen.container);
});

test("tells the fiscal address is not found when the cloud does not know it", async () => {
  const services = createServices();
  vi.mocked(services.fetchExceptionShareYear).mockResolvedValue({ kind: "not_found" });

  const screen = await renderScreen(services, {
    filters: exceptionalityFilters.parse({ fiscalAddress: "fiscal-address-gone" }),
  });

  await expect.element(screen.getByText("No encontramos ese domicilio fiscal")).toBeVisible();
  expect(screen.getByText(/Meses que incumplieron|Ningún mes incumplió/).query()).toBeNull();
});

test("navigates to Mi cuenta when the year comes back forbidden", async () => {
  window.history.pushState(null, "", "/exceptionality");
  const services = createServices();
  vi.mocked(services.fetchExceptionShareYear).mockResolvedValue({ kind: "forbidden" });

  await renderScreen(services);

  await expect.poll(() => window.location.pathname).toBe("/account");
});

test("ends the session when the fiscal addresses find no open session", async () => {
  const services = createServices();
  vi.mocked(services.fetchFiscalAddresses).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();

  await renderScreen(services, { onSessionEnded });

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("ends the session when the year finds no open session", async () => {
  const services = createServices();
  vi.mocked(services.fetchExceptionShareYear).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();

  await renderScreen(services, { onSessionEnded });

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});
