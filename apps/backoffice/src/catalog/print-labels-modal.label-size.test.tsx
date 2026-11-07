import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import type { PrintLabelsModalServices } from "./print-labels-modal";
import {
  createServices,
  honeyWithInternalBarcode,
  openPrintLabelsModal,
  renderModal,
  type Screen,
} from "./test-support/print-labels-modal";

beforeEach(() => {
  window.localStorage.clear();
  window.history.pushState(null, "", "/");
});

const PRINT = "Imprimir en la impresora de etiquetas";
const entries = [{ productId: honeyWithInternalBarcode.id, count: 1 }];

const printerLabels = {
  kind: "ok" as const,
  labels: [{ copies: 1, raster: { widthDots: 8, heightRows: 1, data: new Uint8Array([0xa5]) } }],
};

function servicesPrintingWith(
  outcome:
    | { kind: "printed"; printed: number }
    | { kind: "interrupted"; printed: number; total: number },
) {
  const services = createServices();
  vi.mocked(services.fetchPrinterLabels).mockResolvedValue(printerLabels);
  vi.mocked(services.printOnLabelPrinter).mockResolvedValue(outcome);
  return services;
}

async function openWithOneLabel(services: PrintLabelsModalServices) {
  const screen = await renderModal(services, { products: [honeyWithInternalBarcode] });
  return { screen, dialog: await chooseOneLabel(screen) };
}

async function chooseOneLabel(screen: Screen) {
  const dialog = await openPrintLabelsModal(screen);
  await userEvent.click(
    dialog.getByRole("button", { name: `Sumar una etiqueta a ${honeyWithInternalBarcode.name}` }),
  );
  return dialog;
}

async function enterSize(
  dialog: Awaited<ReturnType<typeof chooseOneLabel>>,
  width: string,
  height: string,
) {
  await userEvent.fill(dialog.getByRole("textbox", { name: "Ancho" }), width);
  await userEvent.fill(dialog.getByRole("textbox", { name: "Alto" }), height);
}

test("shows 50 x 30 mm the first time on a computer", async () => {
  const { dialog } = await openWithOneLabel(createServices());

  await expect.element(dialog.getByRole("textbox", { name: "Ancho" })).toHaveValue("50");
  await expect.element(dialog.getByRole("textbox", { name: "Alto" })).toHaveValue("30");
  await expect.element(dialog.getByText("mm", { exact: true }).first()).toBeVisible();
});

test("prints at the size entered and shows it in the preview", async () => {
  const services = servicesPrintingWith({ kind: "printed", printed: 1 });
  const { screen, dialog } = await openWithOneLabel(services);

  await enterSize(dialog, "70", "50");
  await expect
    .element(dialog.getByText(/^Etiquetas de 70 × 50 mm en la impresora de etiquetas/))
    .toBeVisible();
  await userEvent.click(dialog.getByRole("button", { name: PRINT }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  expect(services.fetchPrinterLabels).toHaveBeenCalledWith(entries, { widthMm: 70, heightMm: 50 });
});

test("opens again with the size of the last print that came out", async () => {
  const services = servicesPrintingWith({ kind: "printed", printed: 1 });
  const { screen, dialog } = await openWithOneLabel(services);
  await enterSize(dialog, "40", "25");
  await userEvent.click(dialog.getByRole("button", { name: PRINT }));
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();

  const reopened = await openPrintLabelsModal(screen);

  await expect.element(reopened.getByRole("textbox", { name: "Ancho" })).toHaveValue("40");
  await expect.element(reopened.getByRole("textbox", { name: "Alto" })).toHaveValue("25");
});

test("does not remember a size whose print was interrupted", async () => {
  const services = servicesPrintingWith({ kind: "interrupted", printed: 0, total: 1 });
  const { screen, dialog } = await openWithOneLabel(services);
  await enterSize(dialog, "40", "25");
  await userEvent.click(dialog.getByRole("button", { name: PRINT }));
  await expect.element(dialog.getByText("La impresión se interrumpió")).toBeVisible();
  await userEvent.click(dialog.getByRole("button", { name: "Cancelar" }));

  const reopened = await openPrintLabelsModal(screen);

  await expect.element(reopened.getByRole("textbox", { name: "Ancho" })).toHaveValue("50");
  await expect.element(reopened.getByRole("textbox", { name: "Alto" })).toHaveValue("30");
});

test("names the allowed width and prints nothing when the width is out of range", async () => {
  const services = servicesPrintingWith({ kind: "printed", printed: 1 });
  const { dialog } = await openWithOneLabel(services);
  await enterSize(dialog, "80", "30");

  await userEvent.click(dialog.getByRole("button", { name: PRINT }));

  await expect.element(dialog.getByText("El ancho va de 25 a 70 mm.")).toBeVisible();
  expect(services.chooseLabelPrinter).not.toHaveBeenCalled();
  expect(services.fetchPrinterLabels).not.toHaveBeenCalled();
  expect(services.printOnLabelPrinter).not.toHaveBeenCalled();
  expect(window.localStorage.length).toBe(0);
});

test("names the allowed height and prints nothing when the height is out of range", async () => {
  const services = servicesPrintingWith({ kind: "printed", printed: 1 });
  const { dialog } = await openWithOneLabel(services);
  await enterSize(dialog, "50", "10");

  await userEvent.click(dialog.getByRole("button", { name: PRINT }));

  await expect.element(dialog.getByText("El alto va de 15 a 70 mm.")).toBeVisible();
  expect(services.fetchPrinterLabels).not.toHaveBeenCalled();
});

test("refuses a size that is not a whole number of millimetres", async () => {
  const services = servicesPrintingWith({ kind: "printed", printed: 1 });
  const { dialog } = await openWithOneLabel(services);
  await enterSize(dialog, "50,5", "30");

  await userEvent.click(dialog.getByRole("button", { name: PRINT }));

  await expect
    .element(dialog.getByText("Ingresá el ancho en milímetros enteros, de 25 a 70 mm."))
    .toBeVisible();
  expect(dialog.getByText("El ancho va de 25 a 70 mm.").query()).toBeNull();
  expect(services.fetchPrinterLabels).not.toHaveBeenCalled();
});

test("shows the cloud's refusal of the size on the size field, not as a failure", async () => {
  const services = servicesPrintingWith({ kind: "printed", printed: 1 });
  vi.mocked(services.fetchPrinterLabels).mockResolvedValue({
    kind: "validation_failed",
    field: "size",
  });
  const { dialog } = await openWithOneLabel(services);

  await userEvent.click(dialog.getByRole("button", { name: PRINT }));

  await expect.element(dialog.getByText("Revisá el ancho.")).toBeVisible();
  expect(dialog.getByText("No se pudo preparar la impresión").query()).toBeNull();
  expect(services.printOnLabelPrinter).not.toHaveBeenCalled();
  await expect.element(dialog.getByRole("button", { name: PRINT })).toBeEnabled();
});

test("shows a failure notice when the cloud refuses a part of the request no field holds", async () => {
  const services = servicesPrintingWith({ kind: "printed", printed: 1 });
  vi.mocked(services.fetchPrinterLabels).mockResolvedValue({
    kind: "validation_failed",
    field: "labels",
  });
  const { dialog } = await openWithOneLabel(services);

  await userEvent.click(dialog.getByRole("button", { name: PRINT }));

  await expect.element(dialog.getByText("No se pudo preparar la impresión")).toBeVisible();
});

test("shows no size in the preview while the fields hold one that cannot be printed", async () => {
  const { dialog } = await openWithOneLabel(createServices());

  await enterSize(dialog, "80", "30");

  await expect
    .element(dialog.getByText(/^Etiquetas en la impresora de etiquetas, o una hoja A4/))
    .toBeVisible();
  expect(dialog.getByText(/50 × 30 mm/).query()).toBeNull();
});

test("downloads the A4 sheet whatever the size fields hold", async () => {
  const services = createServices();
  vi.mocked(services.printLabels).mockResolvedValue({ kind: "failed" });
  const { dialog } = await openWithOneLabel(services);
  await enterSize(dialog, "80", "");

  await userEvent.click(dialog.getByRole("button", { name: "Descargar la hoja A4" }));

  await expect.poll(() => vi.mocked(services.printLabels).mock.calls.length).toBe(1);
  expect(services.printLabels).toHaveBeenCalledWith(entries);
  expect(dialog.getByText("El ancho va de 25 a 70 mm.").query()).toBeNull();
});
