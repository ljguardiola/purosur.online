import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import type { PrintLabelsModalServices } from "./print-labels-modal";
import {
  createServices,
  honeyWithInternalBarcode,
  labelPrinterPort,
  openPrintLabelsModal,
  renderModal,
  type Screen,
} from "./test-support/print-labels-modal";

beforeEach(() => {
  window.localStorage.clear();
  window.history.pushState(null, "", "/");
});

const PRINT = "Imprimir en la impresora de etiquetas";

const printerLabels = {
  kind: "ok" as const,
  labels: [{ copies: 2, raster: { widthDots: 8, heightRows: 1, data: new Uint8Array([0xa5]) } }],
};

async function openWithOneLabel(
  services: PrintLabelsModalServices,
  options: Partial<Parameters<typeof renderModal>[1]> = {},
) {
  const screen = await renderModal(services, { products: [honeyWithInternalBarcode], ...options });
  const dialog = await openPrintLabelsModal(screen);
  await userEvent.click(
    dialog.getByRole("button", { name: `Sumar una etiqueta a ${honeyWithInternalBarcode.name}` }),
  );
  return { screen, dialog };
}

type PrinterOutcome = Awaited<ReturnType<PrintLabelsModalServices["printOnLabelPrinter"]>>;
type PrinterChoice = Awaited<ReturnType<PrintLabelsModalServices["chooseLabelPrinter"]>>;

function servicesPrintingWith(outcome: PrinterOutcome) {
  const services = createServices();
  vi.mocked(services.fetchPrinterLabels).mockResolvedValue(printerLabels);
  vi.mocked(services.printOnLabelPrinter).mockResolvedValue(outcome);
  return services;
}

function servicesChoosing(choice: PrinterChoice) {
  const services = createServices();
  vi.mocked(services.chooseLabelPrinter).mockResolvedValue(choice);
  return services;
}

test("offers the label printer and the A4 sheet beside Cancelar", async () => {
  const { dialog } = await openWithOneLabel(createServices());

  await expect.element(dialog.getByRole("button", { name: PRINT })).toBeEnabled();
  await expect.element(dialog.getByRole("button", { name: "Descargar la hoja A4" })).toBeEnabled();
  await expect.element(dialog.getByRole("button", { name: "Cancelar" })).toBeEnabled();
});

test("disables both outputs while no label is chosen", async () => {
  const screen = await renderModal(createServices(), { products: [honeyWithInternalBarcode] });
  const dialog = await openPrintLabelsModal(screen);

  await expect.element(dialog.getByRole("button", { name: PRINT })).toBeDisabled();
  await expect.element(dialog.getByRole("button", { name: "Descargar la hoja A4" })).toBeDisabled();
});

test("describes both outputs in the preview", async () => {
  const { dialog } = await openWithOneLabel(createServices());

  await expect
    .element(
      dialog.getByText(
        "Etiquetas de 50 × 30 mm en la impresora de etiquetas, o una hoja A4 para cualquier impresora común.",
      ),
    )
    .toBeVisible();
});

const BROWSER_WITHOUT_PRINTER =
  "Este navegador no puede usar la impresora de etiquetas. Abrí el backoffice en Chrome o descargá la hoja A4.";

test("says on the printer button why the browser cannot use the label printer", async () => {
  const services = createServices({ labelPrinterAvailable: () => false });
  const { screen, dialog } = await openWithOneLabel(services);

  const printButton = dialog.getByRole("button", { name: PRINT });
  await expect.element(printButton).toHaveAttribute("aria-disabled", "true");
  await userEvent.hover(printButton);
  await expect.element(screen.getByRole("tooltip")).toHaveTextContent(BROWSER_WITHOUT_PRINTER);
  await expect.element(dialog.getByRole("button", { name: "Descargar la hoja A4" })).toBeEnabled();
});

test("adds no notice of its own when the browser cannot use the label printer", async () => {
  const services = createServices({ labelPrinterAvailable: () => false });
  const { dialog } = await openWithOneLabel(services);

  expect(
    dialog.getByText("Este navegador no puede usar la impresora de etiquetas").query(),
  ).toBeNull();
});

test("says the browser cannot use the label printer when choosing one finds no Web Serial", async () => {
  const { dialog } = await openWithOneLabel(servicesChoosing({ kind: "unavailable" }));

  await userEvent.click(dialog.getByRole("button", { name: PRINT }));

  await expect
    .element(dialog.getByText("Este navegador no puede usar la impresora de etiquetas"))
    .toBeVisible();
  await expect.element(dialog.getByRole("button", { name: "Descargar la hoja A4" })).toBeEnabled();
});

test("does not warn about the printer when the browser can use it", async () => {
  const { dialog } = await openWithOneLabel(createServices());

  expect(
    dialog.getByText("Este navegador no puede usar la impresora de etiquetas").query(),
  ).toBeNull();
});

test("sends the chosen labels to the printer and closes the modal once they are printed", async () => {
  const services = servicesPrintingWith({ kind: "printed", printed: 2 });
  const { screen, dialog } = await openWithOneLabel(services);

  await userEvent.click(dialog.getByRole("button", { name: PRINT }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  expect(services.fetchPrinterLabels).toHaveBeenCalledWith(
    [{ productId: honeyWithInternalBarcode.id, count: 1 }],
    { widthMm: 50, heightMm: 30 },
  );
  expect(services.printOnLabelPrinter).toHaveBeenCalledWith(labelPrinterPort, printerLabels.labels);
  expect(services.printLabels).not.toHaveBeenCalled();
});

test("asks for the printer as soon as the button is pressed, before asking the cloud", async () => {
  const services = createServices();
  vi.mocked(services.chooseLabelPrinter).mockReturnValue(new Promise(() => {}));
  const { dialog } = await openWithOneLabel(services);

  await userEvent.click(dialog.getByRole("button", { name: PRINT }));

  expect(services.chooseLabelPrinter).toHaveBeenCalledTimes(1);
  expect(services.fetchPrinterLabels).not.toHaveBeenCalled();
});

test("says no printer was chosen, never asks the cloud and keeps the A4 sheet available", async () => {
  const services = servicesChoosing({ kind: "no-printer" });
  const { dialog } = await openWithOneLabel(services);

  await userEvent.click(dialog.getByRole("button", { name: PRINT }));

  await expect.element(dialog.getByText("No se eligió ninguna impresora")).toBeVisible();
  expect(services.fetchPrinterLabels).not.toHaveBeenCalled();
  await expect
    .element(dialog.getByText("Conectá la impresora de etiquetas por USB y volvé a intentar."))
    .toBeVisible();
  await expect.element(dialog.getByRole("button", { name: PRINT })).toBeEnabled();
  await expect.element(dialog.getByRole("button", { name: "Descargar la hoja A4" })).toBeEnabled();
});

test("says the printer could not be reached when choosing it fails, without blaming other programs", async () => {
  const services = servicesChoosing({ kind: "chooser-failed" });
  const { dialog } = await openWithOneLabel(services);

  await userEvent.click(dialog.getByRole("button", { name: PRINT }));

  await expect.element(dialog.getByText("No se pudo conectar con la impresora")).toBeVisible();
  await expect.element(dialog.getByText("Probá de nuevo.")).toBeVisible();
  expect(
    dialog.getByText("Cerrá otros programas que la estén usando y volvé a intentar.").query(),
  ).toBeNull();
  expect(services.fetchPrinterLabels).not.toHaveBeenCalled();
  await expect.element(dialog.getByRole("button", { name: "Descargar la hoja A4" })).toBeEnabled();
});

test("says the printer could not be reached when it does not open", async () => {
  const { dialog } = await openWithOneLabel(servicesPrintingWith({ kind: "not-opened" }));

  await userEvent.click(dialog.getByRole("button", { name: PRINT }));

  await expect.element(dialog.getByText("No se pudo conectar con la impresora")).toBeVisible();
  await expect
    .element(dialog.getByText("Cerrá otros programas que la estén usando y volvé a intentar."))
    .toBeVisible();
  await expect.element(dialog.getByRole("button", { name: "Descargar la hoja A4" })).toBeEnabled();
});

test("says how many labels were printed when the print is interrupted", async () => {
  const { dialog } = await openWithOneLabel(
    servicesPrintingWith({ kind: "interrupted", printed: 3, total: 1200 }),
  );

  await userEvent.click(dialog.getByRole("button", { name: PRINT }));

  await expect.element(dialog.getByText("La impresión se interrumpió")).toBeVisible();
  await expect.element(dialog.getByText("Se imprimieron 3 de 1.200 etiquetas.")).toBeVisible();
  await expect.element(dialog.getByRole("button", { name: "Descargar la hoja A4" })).toBeEnabled();
});

test("says printing failed and keeps the A4 sheet available when the printer cannot be used", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrinterLabels).mockResolvedValue(printerLabels);
  vi.mocked(services.printOnLabelPrinter).mockRejectedValue(
    new TypeError("Failed to fetch dynamically imported module"),
  );
  const { dialog } = await openWithOneLabel(services);

  await userEvent.click(dialog.getByRole("button", { name: PRINT }));

  await expect
    .element(dialog.getByText("No se pudo imprimir en la impresora de etiquetas"))
    .toBeVisible();
  await expect.element(dialog.getByRole("button", { name: "Descargar la hoja A4" })).toBeEnabled();
  await expect.element(dialog.getByRole("button", { name: PRINT })).toBeEnabled();
  await expect.element(dialog.getByRole("button", { name: "Cancelar" })).toBeEnabled();
});

test("downloads the A4 sheet after the label printer failed", async () => {
  const services = servicesChoosing({ kind: "no-printer" });
  vi.mocked(services.printLabels).mockResolvedValue({ kind: "failed" });
  const { dialog } = await openWithOneLabel(services);
  await userEvent.click(dialog.getByRole("button", { name: PRINT }));
  await expect.element(dialog.getByText("No se eligió ninguna impresora")).toBeVisible();

  await userEvent.click(dialog.getByRole("button", { name: "Descargar la hoja A4" }));

  await expect.poll(() => vi.mocked(services.printLabels).mock.calls.length).toBe(1);
  await expect.element(dialog.getByText("No se pudo generar la hoja")).toBeVisible();
});

test("a later attempt replaces the previous printer notice", async () => {
  const services = servicesPrintingWith({ kind: "not-opened" });
  vi.mocked(services.chooseLabelPrinter).mockResolvedValueOnce({ kind: "no-printer" });
  const { dialog } = await openWithOneLabel(services);
  await userEvent.click(dialog.getByRole("button", { name: PRINT }));
  await expect.element(dialog.getByText("No se eligió ninguna impresora")).toBeVisible();

  await userEvent.click(dialog.getByRole("button", { name: PRINT }));

  await expect.element(dialog.getByText("No se pudo conectar con la impresora")).toBeVisible();
  expect(dialog.getByText("No se eligió ninguna impresora").query()).toBeNull();
});

test("shows a failure notice and never reaches the printer when the cloud fails", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrinterLabels).mockResolvedValue({ kind: "failed" });
  const { dialog } = await openWithOneLabel(services);

  await userEvent.click(dialog.getByRole("button", { name: PRINT }));

  await expect.element(dialog.getByText("No se pudo preparar la impresión")).toBeVisible();
  expect(services.printOnLabelPrinter).not.toHaveBeenCalled();
  await expect.element(dialog.getByRole("button", { name: "Descargar la hoja A4" })).toBeEnabled();
});

test("shows the rate limit notice when the cloud limits the request", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrinterLabels).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 90,
  });
  const { dialog } = await openWithOneLabel(services);

  await userEvent.click(dialog.getByRole("button", { name: PRINT }));

  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(dialog.getByText("Se puede volver a intentar en 2 minutos.")).toBeVisible();
});

test.each(["product_not_found", "product_without_internal_barcode"] as const)(
  "offers to reload the list when the cloud answers %s",
  async (kind) => {
    const services = createServices();
    vi.mocked(services.fetchPrinterLabels).mockResolvedValue({ kind });
    const { dialog } = await openWithOneLabel(services);

    await userEvent.click(dialog.getByRole("button", { name: PRINT }));

    await expect.element(dialog.getByText("La lista de productos cambió")).toBeVisible();
    await expect.element(dialog.getByRole("button", { name: "Recargar la lista" })).toBeVisible();
    expect(services.printOnLabelPrinter).not.toHaveBeenCalled();
  },
);

test("ends the session when the cloud answers unauthenticated", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrinterLabels).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const { dialog } = await openWithOneLabel(services, { onSessionEnded });

  await userEvent.click(dialog.getByRole("button", { name: PRINT }));

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("navigates to Mi cuenta when the cloud answers forbidden", async () => {
  window.history.pushState(null, "", "/products");
  const services = createServices();
  vi.mocked(services.fetchPrinterLabels).mockResolvedValue({ kind: "forbidden" });
  const { dialog } = await openWithOneLabel(services);

  await userEvent.click(dialog.getByRole("button", { name: PRINT }));

  await expect
    .poll(() => window.location.pathname + window.location.search)
    .toBe("/?account=credentials");
});

test("disables every button while the labels are being prepared", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrinterLabels).mockReturnValue(new Promise(() => {}));
  const { dialog } = await openWithOneLabel(services);

  await userEvent.click(dialog.getByRole("button", { name: PRINT }));

  await expect.element(dialog.getByRole("button", { name: PRINT })).toBeDisabled();
  await expect.element(dialog.getByRole("button", { name: "Descargar la hoja A4" })).toBeDisabled();
  await expect.element(dialog.getByRole("button", { name: "Cancelar" })).toBeDisabled();
});

test("disables every button while the printer is printing", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrinterLabels).mockResolvedValue(printerLabels);
  vi.mocked(services.printOnLabelPrinter).mockReturnValue(new Promise(() => {}));
  const { dialog } = await openWithOneLabel(services);

  await userEvent.click(dialog.getByRole("button", { name: PRINT }));

  await expect.poll(() => vi.mocked(services.printOnLabelPrinter).mock.calls.length).toBe(1);
  await expect.element(dialog.getByRole("button", { name: PRINT })).toBeDisabled();
  await expect.element(dialog.getByRole("button", { name: "Descargar la hoja A4" })).toBeDisabled();
});

function servicesWithPendingPrint() {
  const services = createServices();
  vi.mocked(services.fetchPrinterLabels).mockResolvedValue(printerLabels);
  let resolvePrint: (outcome: PrinterOutcome) => void = () => {};
  vi.mocked(services.printOnLabelPrinter).mockReturnValue(
    new Promise((resolve) => {
      resolvePrint = resolve;
    }),
  );
  return { services, resolvePrint: (outcome: PrinterOutcome) => resolvePrint(outcome) };
}

test("cannot be closed while the printer is printing", async () => {
  const { services } = servicesWithPendingPrint();
  const { screen, dialog } = await openWithOneLabel(services);

  await userEvent.click(dialog.getByRole("button", { name: PRINT }));
  await expect.poll(() => vi.mocked(services.printOnLabelPrinter).mock.calls.length).toBe(1);

  expect(dialog.getByRole("button", { name: "Cerrar" }).query()).toBeNull();
  await expect.element(dialog.getByRole("button", { name: "Cancelar" })).toBeDisabled();
  await userEvent.keyboard("{Escape}");
  await screen.settle();
  expect(screen.getByRole("dialog").query()).not.toBeNull();
});

test("shows how many labels were printed once a print it could not be closed during stops", async () => {
  const { services, resolvePrint } = servicesWithPendingPrint();
  const { dialog } = await openWithOneLabel(services);
  await userEvent.click(dialog.getByRole("button", { name: PRINT }));
  await expect.poll(() => vi.mocked(services.printOnLabelPrinter).mock.calls.length).toBe(1);

  resolvePrint({ kind: "interrupted", printed: 1, total: 2 });

  await expect.element(dialog.getByText("Se imprimieron 1 de 2 etiquetas.")).toBeVisible();
  await expect.element(dialog.getByRole("button", { name: "Cerrar" })).toBeEnabled();
});

async function printThenCloseAndReopen(screen: Screen, requestSent: () => unknown) {
  const firstDialog = screen.getByRole("dialog");
  await userEvent.click(firstDialog.getByRole("button", { name: PRINT }));
  await expect.poll(requestSent).toBe(1);
  await userEvent.click(firstDialog.getByRole("button", { name: "Cerrar" }));
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  return openPrintLabelsModal(screen);
}

test("ignores prepared labels that arrive after the modal was closed and opened again", async () => {
  const services = createServices();
  let resolveFetch: (outcome: typeof printerLabels) => void = () => {};
  vi.mocked(services.fetchPrinterLabels).mockReturnValue(
    new Promise((resolve) => {
      resolveFetch = resolve;
    }),
  );
  const { screen } = await openWithOneLabel(services);
  await printThenCloseAndReopen(
    screen,
    () => vi.mocked(services.fetchPrinterLabels).mock.calls.length,
  );

  resolveFetch(printerLabels);
  await screen.settle();

  expect(services.printOnLabelPrinter).not.toHaveBeenCalled();
});
