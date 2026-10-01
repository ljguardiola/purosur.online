import type { ProductSummary } from "@purosur/contracts";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { honey } from "./test-support/products";
import {
  createServices,
  mockLoaded,
  renderScreen,
  type Screen,
} from "./test-support/products-list-screen";

// A valid check-digit value in the GS1 restricted-circulation range.
const honeyWithInternalBarcode: ProductSummary = {
  ...honey,
  id: "product-20",
  barcodes: ["2000000000015"],
  labelCode: "2000000000015",
};
async function openPrintLabelsModal(screen: Screen) {
  await userEvent.click(screen.getByRole("button", { name: "Imprimir etiquetas" }));
  return screen.getByRole("dialog");
}

test("the header button opens the print labels modal", async () => {
  const services = createServices();
  mockLoaded(services, [honeyWithInternalBarcode]);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Miel pura de abeja 1 kg")).toBeVisible();

  const dialog = await openPrintLabelsModal(screen);

  await expect.element(dialog.getByRole("heading", { name: "Imprimir etiquetas" })).toBeVisible();
});

test("reloading the changed product list keeps the screen's own status filter", async () => {
  const services = createServices();
  mockLoaded(services, [honeyWithInternalBarcode]);
  vi.mocked(services.printLabels).mockResolvedValue({ kind: "product_not_found" });
  const screen = await renderScreen(services);
  await userEvent.click(screen.getByRole("button", { name: "Estado: Activos" }));
  await userEvent.click(screen.getByRole("option", { name: "Todos" }));
  await expect.element(screen.getByText("1 producto", { exact: true })).toBeVisible();
  const dialog = await openPrintLabelsModal(screen);
  await userEvent.click(
    dialog.getByRole("button", { name: `Sumar una etiqueta a ${honeyWithInternalBarcode.name}` }),
  );
  await userEvent.click(dialog.getByRole("button", { name: "Descargar la hoja para imprimir" }));
  await expect.element(dialog.getByText("La lista de productos cambió")).toBeVisible();

  await userEvent.click(dialog.getByRole("button", { name: "Recargar la lista" }));

  await expect.poll(() => dialog.getByText("La lista de productos cambió").query()).toBeNull();
  expect(services.fetchProducts).toHaveBeenLastCalledWith("all");
});

test("disables the print labels button while the products are still loading", async () => {
  const services = createServices();
  vi.mocked(services.fetchProducts).mockReturnValue(new Promise(() => {}));
  vi.mocked(services.fetchCategories).mockResolvedValue({ kind: "ok", value: [] });

  const screen = await renderScreen(services);

  await expect.element(screen.getByRole("button", { name: "Imprimir etiquetas" })).toBeDisabled();
});

test("disables the print labels button when the products fail to load", async () => {
  const services = createServices();
  vi.mocked(services.fetchProducts).mockResolvedValue({ kind: "failed" });
  vi.mocked(services.fetchCategories).mockResolvedValue({ kind: "ok", value: [] });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("No pudimos abrir los productos")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Imprimir etiquetas" })).toBeDisabled();
});

test("disables the print labels button while loading the products is rate limited", async () => {
  const services = createServices();
  vi.mocked(services.fetchProducts).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 120,
  });
  vi.mocked(services.fetchCategories).mockResolvedValue({ kind: "ok", value: [] });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Imprimir etiquetas" })).toBeDisabled();
});

test("a reload that fails leaves the list failed, with its retry, instead of the print modal", async () => {
  const services = createServices();
  mockLoaded(services, [honeyWithInternalBarcode]);
  vi.mocked(services.printLabels).mockResolvedValue({ kind: "product_not_found" });
  const screen = await renderScreen(services);
  const dialog = await openPrintLabelsModal(screen);
  await userEvent.click(
    dialog.getByRole("button", { name: `Sumar una etiqueta a ${honeyWithInternalBarcode.name}` }),
  );
  await userEvent.click(dialog.getByRole("button", { name: "Descargar la hoja para imprimir" }));
  await expect.element(dialog.getByText("La lista de productos cambió")).toBeVisible();

  vi.mocked(services.fetchProducts).mockResolvedValueOnce({ kind: "failed" });
  await userEvent.click(dialog.getByRole("button", { name: "Recargar la lista" }));

  await expect.element(screen.getByText("No pudimos abrir los productos")).toBeVisible();
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
});

test("the print modal a failed reload closed stays closed once the list loads again", async () => {
  const services = createServices();
  mockLoaded(services, [honeyWithInternalBarcode]);
  vi.mocked(services.printLabels).mockResolvedValue({ kind: "product_not_found" });
  const screen = await renderScreen(services);
  const dialog = await openPrintLabelsModal(screen);
  await userEvent.click(
    dialog.getByRole("button", { name: `Sumar una etiqueta a ${honeyWithInternalBarcode.name}` }),
  );
  await userEvent.click(dialog.getByRole("button", { name: "Descargar la hoja para imprimir" }));
  vi.mocked(services.fetchProducts).mockResolvedValueOnce({ kind: "failed" });
  await userEvent.click(dialog.getByRole("button", { name: "Recargar la lista" }));
  await expect.element(screen.getByText("No pudimos abrir los productos")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect
    .element(
      screen.getByRole("table", { name: "Productos" }).getByText(honeyWithInternalBarcode.name),
    )
    .toBeVisible();
  expect(screen.getByRole("dialog").query()).toBeNull();
});
