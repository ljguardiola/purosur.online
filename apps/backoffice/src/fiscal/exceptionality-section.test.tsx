import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import type { CloudData } from "../platform/use-cloud-query";
import { render } from "../shell/test-support/render-with-router";
import { ExceptionalitySection, type ExceptionalitySectionProps } from "./exceptionality-section";
import type { FiscalAddress } from "./fiscal-addresses-api";
import type { ExceptionShareYearRead } from "./fiscal-queries";
import {
  centralFiscalAddress,
  exceptionShareOf2026,
  fiscalAddresses,
  warehouseFiscalAddress,
} from "./test-support/exception-share-fixtures";

function loaded<T>(value: T): CloudData<T> {
  return { status: "loaded", value, refreshing: false };
}

const foundYear = loaded<ExceptionShareYearRead>({ kind: "found", year: exceptionShareOf2026 });

function renderSection(props: Partial<ExceptionalitySectionProps> = {}) {
  return render(
    <FieldSizeProvider size="backoffice">
      <main>
        <ExceptionalitySection
          addresses={loaded<FiscalAddress[]>(fiscalAddresses)}
          read={foundYear}
          fiscalAddressId={centralFiscalAddress.id}
          onFiscalAddressChange={() => {}}
          onYearChange={() => {}}
          {...props}
        />
      </main>
    </FieldSizeProvider>,
  );
}

test("shows the fiscal address and the year it is handed, with the months of that year", async () => {
  const screen = await renderSection();

  await expect.element(screen.getByText("Enero 2026")).toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: /Domicilio fiscal:/ }))
    .toHaveTextContent("Domicilio fiscal: Local central");
  await expect.element(screen.getByRole("button", { name: /Año:/ })).toHaveTextContent("Año: 2026");
  await expectNoAccessibilityViolations(screen.container);
});

test("hands back the fiscal address picked", async () => {
  const onFiscalAddressChange = vi.fn();
  const screen = await renderSection({ onFiscalAddressChange });

  await userEvent.click(screen.getByRole("button", { name: /Domicilio fiscal:/ }));
  await userEvent.click(screen.getByRole("option", { name: "Depósito norte" }));

  expect(onFiscalAddressChange).toHaveBeenCalledWith(warehouseFiscalAddress.id);
});

test("hands back the year picked as a number", async () => {
  const onYearChange = vi.fn();
  const screen = await renderSection({
    onYearChange,
    read: loaded<ExceptionShareYearRead>({
      kind: "found",
      year: { ...exceptionShareOf2026, selectable_years: [2026, 2025] },
    }),
  });

  await userEvent.click(screen.getByRole("button", { name: /Año:/ }));
  await userEvent.click(screen.getByRole("option", { name: "2025" }));

  expect(onYearChange).toHaveBeenCalledWith(2025);
});

test("keeps the year filter of the last answer while the next year loads", async () => {
  const screen = await renderSection({
    read: { status: "loading", lastValue: { kind: "found", year: exceptionShareOf2026 } },
  });

  await expect.element(screen.getByRole("button", { name: /Año:/ })).toHaveTextContent("Año: 2026");
  await expect
    .element(screen.getByRole("table", { name: "Excepcionalidad por mes" }))
    .toHaveAttribute("aria-busy", "true");
  expect(screen.getByText(/Meses que incumplieron|Ningún mes incumplió/).query()).toBeNull();
});

test("shows the empty state of no fiscal address, with no filter", async () => {
  const screen = await renderSection({
    addresses: loaded<FiscalAddress[]>([]),
    read: { status: "loading" },
    fiscalAddressId: undefined,
  });

  await expect.element(screen.getByText("No hay domicilios fiscales")).toBeVisible();
  expect(screen.getByRole("button", { name: /Domicilio fiscal:/ }).query()).toBeNull();
});

test("tells the fiscal address is not found when the read finds none", async () => {
  const screen = await renderSection({
    read: loaded<ExceptionShareYearRead>({ kind: "not_found" }),
  });

  await expect.element(screen.getByText("No encontramos ese domicilio fiscal")).toBeVisible();
});

test("shows the failure of the fiscal addresses, and Reintentar asks again", async () => {
  const retry = vi.fn();
  const screen = await renderSection({
    addresses: { status: "failed", retry },
    read: { status: "loading" },
    fiscalAddressId: undefined,
  });
  await expect.element(screen.getByText("No pudimos abrir la excepcionalidad")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  expect(retry).toHaveBeenCalledOnce();
});
