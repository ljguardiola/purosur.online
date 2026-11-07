import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { afterEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { readDownloadedXlsx } from "../platform/spreadsheet/test-support/read-xlsx";
import { periodSegments } from "../shell/test-support/report-dates";
import { FRONT_REGISTER_ID } from "../shell/test-support/report-fixtures";
import { spyOnDownloads } from "../shell/test-support/spy-on-downloads";
import {
  createSalesByPaymentMethodServices,
  renderSalesByPaymentMethod,
} from "./test-support/sales-by-payment-method-screen";

afterEach(() => {
  vi.restoreAllMocks();
});

test("offers the hand-confirmed filter off, showing the sales by method and reading no hand-confirmed payment", async () => {
  const services = createSalesByPaymentMethodServices();

  const screen = await renderSalesByPaymentMethod(services);

  await expect
    .element(screen.getByRole("switch", { name: "Confirmados a mano" }))
    .not.toBeChecked();
  await expect
    .element(screen.getByRole("table", { name: "Ventas por medio de pago" }))
    .toBeVisible();
  expect(services.fetchHandConfirmedPayments).not.toHaveBeenCalled();
});

test("turning the filter on reports it and lists the hand-confirmed payments instead of the sales by method", async () => {
  const services = createSalesByPaymentMethodServices();
  const onFiltersChange = vi.fn();
  const screen = await renderSalesByPaymentMethod(services, { onFiltersChange });
  await expect
    .element(screen.getByRole("table", { name: "Ventas por medio de pago" }))
    .toBeVisible();

  await userEvent.click(screen.getByText("Confirmados a mano", { exact: true }));

  await expect
    .element(screen.getByRole("table", { name: "Pagos confirmados a mano", exact: true }))
    .toBeVisible();
  await expect.element(screen.getByText("Beto").first()).toBeVisible();
  expect(screen.getByRole("table", { name: "Ventas por medio de pago" }).query()).toBeNull();
  expect(onFiltersChange).toHaveBeenLastCalledWith(
    expect.objectContaining({ handConfirmed: true }),
  );
  await expect.element(screen.getByRole("switch", { name: "Confirmados a mano" })).toBeChecked();
  await expectNoAccessibilityViolations(screen.container);
});

test("turning the filter off lists the sales by method again", async () => {
  const services = createSalesByPaymentMethodServices();
  const screen = await renderSalesByPaymentMethod(services, { filters: { handConfirmed: true } });
  await expect.element(screen.getByText("Beto").first()).toBeVisible();

  await userEvent.click(screen.getByText("Confirmados a mano", { exact: true }));

  await expect
    .element(screen.getByRole("table", { name: "Ventas por medio de pago" }))
    .toBeVisible();
});

test("asks the cloud only for the hand-confirmed payments of the range, the register and the method the URL names", async () => {
  const services = createSalesByPaymentMethodServices();

  await renderSalesByPaymentMethod(services, {
    filters: {
      handConfirmed: true,
      from: "2026-10-02",
      to: "2026-10-05",
      register: FRONT_REGISTER_ID,
      method: "TRANSFER",
    },
  });

  await expect
    .poll(() => vi.mocked(services.fetchHandConfirmedPayments).mock.lastCall)
    .toEqual([
      { from: "2026-10-02", to: "2026-10-05", register_id: FRONT_REGISTER_ID, method: "TRANSFER" },
    ]);
  expect(services.fetchSalesByPaymentMethod).not.toHaveBeenCalled();
});

test("shows the range the cloud answered for the hand-confirmed payments", async () => {
  const screen = await renderSalesByPaymentMethod(createSalesByPaymentMethodServices(), {
    filters: { handConfirmed: true },
  });

  await expect.poll(() => periodSegments(screen).slice(0, 3)).toEqual(["1", "10", "2026"]);
});

test("asks the cloud again for the method chosen beside the filter", async () => {
  const services = createSalesByPaymentMethodServices();
  const onFiltersChange = vi.fn();
  const screen = await renderSalesByPaymentMethod(services, {
    filters: { handConfirmed: true },
    onFiltersChange,
  });
  await expect.element(screen.getByText("Beto").first()).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: /Medio:/ }));
  await userEvent.click(screen.getByRole("option", { name: "Transferencia" }));

  await expect
    .poll(() => vi.mocked(services.fetchHandConfirmedPayments).mock.lastCall)
    .toEqual([{ method: "TRANSFER" }]);
  expect(onFiltersChange).toHaveBeenLastCalledWith(
    expect.objectContaining({ handConfirmed: true, method: "TRANSFER" }),
  );
});

test("downloads the hand-confirmed payments spreadsheet while the filter is on", async () => {
  const downloads = spyOnDownloads();
  const screen = await renderSalesByPaymentMethod(createSalesByPaymentMethodServices(), {
    filters: { handConfirmed: true },
  });
  await expect.element(screen.getByText("Beto").first()).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Descargar planilla" }));

  await expect
    .poll(() => downloads.names)
    .toEqual(["pagos-confirmados-a-mano-2026-10-01-2026-10-07.xlsx"]);
  const file = await readDownloadedXlsx(downloads.blobs[0]);
  expect(file.sheetNames).toEqual(["Resumen", "Por cajero", "Detalle de pagos"]);
});
