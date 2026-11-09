import type { PurchaseSummary } from "@purosur/contracts";
import { beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { chooseProduct } from "./test-support/purchase-lines-fill";
import { createPanelServices, type Panel, renderPanel } from "./test-support/purchase-panel";
import { compraDeMiel } from "./test-support/purchases";

beforeEach(async () => {
  await page.viewport(1280, 900);
  window.history.pushState(null, "", "/");
});

const [lineDeMiel] = compraDeMiel.lines;
if (!lineDeMiel) {
  throw new Error("test setup: the purchase has no line");
}

const CORRECT_COST = "Corregir el costo de Miel pura de abeja 1 kg";
const CORRECT_EXPIRY = "Corregir el vencimiento de Miel pura de abeja 1 kg";
const CORRECT_QUANTITY = "Corregir la cantidad de Miel pura de abeja 1 kg";

const corrected: PurchaseSummary = { ...compraDeMiel, purchasedOn: "2026-09-13" };

async function chooseFromMenu(screen: Panel, item: string) {
  await userEvent.click(screen.getByRole("button", { name: "Más acciones" }));
  await userEvent.click(page.getByRole("menuitem", { name: item }));
}

async function renderCorrecting(services = createPanelServices()) {
  const onCorrected = vi.fn();
  const onCorrectionStarted = vi.fn();
  const onStale = vi.fn();
  const screen = await renderPanel(services, { onCorrected, onCorrectionStarted, onStale });
  await expect.element(screen.getByRole("table", { name: "Productos de la compra" })).toBeVisible();
  return { screen, onCorrected, onCorrectionStarted, onStale };
}

test("announces a correction is starting when one is chosen", async () => {
  const { screen, onCorrectionStarted } = await renderCorrecting();

  await userEvent.click(screen.getByRole("button", { name: CORRECT_COST }));

  expect(onCorrectionStarted).toHaveBeenCalledTimes(1);
});

test("corrects the line's expiry, closes the modal and reports the correction", async () => {
  const services = createPanelServices();
  vi.mocked(services.correctPurchaseLineExpiry).mockResolvedValue({
    kind: "ok",
    purchase: corrected,
  });
  const { screen, onCorrected } = await renderCorrecting(services);

  await userEvent.click(screen.getByRole("button", { name: CORRECT_EXPIRY }));
  const dialog = screen.getByRole("dialog");
  await expect
    .element(dialog.getByRole("heading", { name: "Miel pura de abeja 1 kg" }))
    .toBeVisible();
  await userEvent.click(dialog.getByRole("button", { name: "Guardar el vencimiento" }));

  await expect.poll(() => onCorrected.mock.calls).toEqual([["expiryCorrected", corrected]]);
  expect(screen.getByRole("dialog").query()).toBeNull();
  expect(services.correctPurchaseLineExpiry).toHaveBeenCalledWith(compraDeMiel.id, lineDeMiel.id, {
    expiresOn: "2027-01-31",
  });
});

test("keeps the expiry modal open and reports nothing when the cloud refuses the correction", async () => {
  const services = createPanelServices();
  vi.mocked(services.correctPurchaseLineExpiry).mockResolvedValue({ kind: "failed" });
  const { screen, onCorrected } = await renderCorrecting(services);

  await userEvent.click(screen.getByRole("button", { name: CORRECT_EXPIRY }));
  await userEvent.click(
    screen.getByRole("dialog").getByRole("button", { name: "Guardar el vencimiento" }),
  );

  await expect.element(screen.getByText("No se corrigió el vencimiento")).toBeVisible();
  expect(onCorrected).not.toHaveBeenCalled();
});

test("corrects the line's cost, closes the modal and reports the correction", async () => {
  const services = createPanelServices();
  vi.mocked(services.correctPurchaseLineCost).mockResolvedValue({
    kind: "ok",
    purchase: corrected,
  });
  const { screen, onCorrected } = await renderCorrecting(services);

  await userEvent.click(screen.getByRole("button", { name: CORRECT_COST }));
  const dialog = screen.getByRole("dialog");
  await expect
    .element(dialog.getByRole("heading", { name: "Miel pura de abeja 1 kg" }))
    .toBeVisible();
  await userEvent.click(dialog.getByRole("button", { name: "Guardar el costo" }));

  await expect.poll(() => onCorrected.mock.calls).toEqual([["costCorrected", corrected]]);
  expect(screen.getByRole("dialog").query()).toBeNull();
  expect(services.correctPurchaseLineCost).toHaveBeenCalledWith(compraDeMiel.id, lineDeMiel.id, {
    costPaidCents: 7_200_00,
  });
});

test("keeps the cost modal open and reports nothing when the cloud refuses the correction", async () => {
  const services = createPanelServices();
  vi.mocked(services.correctPurchaseLineCost).mockResolvedValue({ kind: "failed" });
  const { screen, onCorrected } = await renderCorrecting(services);

  await userEvent.click(screen.getByRole("button", { name: CORRECT_COST }));
  await userEvent.click(
    screen.getByRole("dialog").getByRole("button", { name: "Guardar el costo" }),
  );

  await expect.element(screen.getByText("No se corrigió el costo")).toBeVisible();
  expect(onCorrected).not.toHaveBeenCalled();
});

test("corrects the line's quantity, closes the modal and reports the correction", async () => {
  const services = createPanelServices();
  vi.mocked(services.correctPurchaseLineQuantity).mockResolvedValue({
    kind: "ok",
    purchase: corrected,
  });
  const { screen, onCorrected } = await renderCorrecting(services);

  await userEvent.click(screen.getByRole("button", { name: CORRECT_QUANTITY }));
  const dialog = screen.getByRole("dialog");
  await expect
    .element(dialog.getByRole("heading", { name: "Miel pura de abeja 1 kg" }))
    .toBeVisible();
  const packages = dialog.getByRole("textbox", { name: /^Cantidad de paquetes/ });
  await userEvent.clear(packages);
  await userEvent.type(packages, "3");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar la cantidad" }));

  await expect.poll(() => onCorrected.mock.calls).toEqual([["quantityCorrected", corrected]]);
  expect(screen.getByRole("dialog").query()).toBeNull();
  expect(services.correctPurchaseLineQuantity).toHaveBeenCalledWith(
    compraDeMiel.id,
    lineDeMiel.id,
    { loadedBy: "packages", packages: 3 },
  );
});

test("keeps the quantity modal open and reports nothing when the cloud refuses the correction", async () => {
  const services = createPanelServices();
  vi.mocked(services.correctPurchaseLineQuantity).mockResolvedValue({ kind: "failed" });
  const { screen, onCorrected } = await renderCorrecting(services);

  await userEvent.click(screen.getByRole("button", { name: CORRECT_QUANTITY }));
  await userEvent.click(
    screen.getByRole("dialog").getByRole("button", { name: "Guardar la cantidad" }),
  );

  await expect.element(screen.getByText("No se corrigió la cantidad")).toBeVisible();
  expect(onCorrected).not.toHaveBeenCalled();
});

test("splits the expiry of some units from Más acciones, closes the modal and reports the correction", async () => {
  const services = createPanelServices();
  vi.mocked(services.splitPurchaseLineExpiry).mockResolvedValue({
    kind: "ok",
    purchase: corrected,
  });
  const { screen, onCorrected, onCorrectionStarted } = await renderCorrecting(services);

  await chooseFromMenu(screen, "Dar otro vencimiento a algunas unidades");
  const dialog = screen.getByRole("dialog");
  await expect
    .element(dialog.getByRole("heading", { name: "Miel pura de abeja 1 kg" }))
    .toBeVisible();
  await userEvent.type(dialog.getByRole("textbox", { name: /^Cantidad/ }), "1");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar el vencimiento" }));

  await expect.poll(() => onCorrected.mock.calls).toEqual([["expirySplit", corrected]]);
  expect(onCorrectionStarted).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("dialog").query()).toBeNull();
  expect(services.splitPurchaseLineExpiry).toHaveBeenCalledWith(compraDeMiel.id, lineDeMiel.id, {
    quantity: 1_000,
    expiresOn: "2027-01-31",
  });
});

test("asks for the purchases again when the lot of a split has fewer units than asked", async () => {
  const services = createPanelServices();
  vi.mocked(services.splitPurchaseLineExpiry).mockResolvedValue({ kind: "not_enough_in_lot" });
  const { screen, onCorrected, onStale } = await renderCorrecting(services);

  await chooseFromMenu(screen, "Dar otro vencimiento a algunas unidades");
  const dialog = screen.getByRole("dialog");
  await userEvent.type(dialog.getByRole("textbox", { name: /^Cantidad/ }), "10");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar el vencimiento" }));

  await expect
    .element(
      dialog.getByText(
        "Solo se puede dar otra fecha a menos unidades de las que quedan en el lote.",
      ),
    )
    .toBeVisible();
  expect(onStale).toHaveBeenCalledTimes(1);
  expect(onCorrected).not.toHaveBeenCalled();
});

test("asks for the purchases again when the lot of a quantity correction has fewer units than asked", async () => {
  const services = createPanelServices();
  vi.mocked(services.correctPurchaseLineQuantity).mockResolvedValue({ kind: "not_enough_in_lot" });
  const { screen, onCorrected, onStale } = await renderCorrecting(services);

  await userEvent.click(screen.getByRole("button", { name: CORRECT_QUANTITY }));
  const dialog = screen.getByRole("dialog");
  const packages = dialog.getByRole("textbox", { name: /^Cantidad de paquetes/ });
  await userEvent.clear(packages);
  await userEvent.type(packages, "1");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar la cantidad" }));

  await expect
    .element(
      dialog.getByText("Las unidades que ya salieron del lote no se pueden quitar de la compra."),
    )
    .toBeVisible();
  expect(onStale).toHaveBeenCalledTimes(1);
  expect(onCorrected).not.toHaveBeenCalled();
});

test("shows what remains in the lot of the line as the purchase now says", async () => {
  const services = createPanelServices();
  const { screen } = await renderCorrecting(services);
  await userEvent.click(screen.getByRole("button", { name: CORRECT_QUANTITY }));

  await expect
    .element(screen.getByText("Cada paquete trae 12 u · Quedan 18 u en el lote"))
    .toBeVisible();
});

test("changes the line's product from Más acciones, closes the modal and reports the correction", async () => {
  const services = createPanelServices();
  vi.mocked(services.changePurchaseLineProduct).mockResolvedValue({
    kind: "ok",
    purchase: corrected,
  });
  const { screen, onCorrected } = await renderCorrecting(services);

  await chooseFromMenu(screen, "Cambiar el producto");
  const dialog = screen.getByRole("dialog");
  await expect
    .element(dialog.getByRole("heading", { name: "Miel pura de abeja 1 kg" }))
    .toBeVisible();
  await chooseProduct(screen, dialog, "Avena arrollada");
  await userEvent.click(dialog.getByRole("button", { name: "Cambiar el producto" }));

  await expect.poll(() => onCorrected.mock.calls).toEqual([["productChanged", corrected]]);
  expect(screen.getByRole("dialog").query()).toBeNull();
  expect(services.changePurchaseLineProduct).toHaveBeenCalledWith(compraDeMiel.id, lineDeMiel.id, {
    productId: "90d00000-0000-4000-8000-000000000002",
  });
});

test("asks for the purchases again and keeps the product modal open when a unit already left the lot", async () => {
  const services = createPanelServices();
  vi.mocked(services.changePurchaseLineProduct).mockResolvedValue({ kind: "units_left_lot" });
  const { screen, onCorrected, onStale } = await renderCorrecting(services);

  await chooseFromMenu(screen, "Cambiar el producto");
  const dialog = screen.getByRole("dialog");
  await chooseProduct(screen, dialog, "Avena arrollada");
  await userEvent.click(dialog.getByRole("button", { name: "Cambiar el producto" }));

  await expect
    .element(
      dialog.getByText(
        "Ya salieron unidades del lote de esta línea; corregí el stock con un ajuste.",
      ),
    )
    .toBeVisible();
  expect(onStale).toHaveBeenCalledTimes(1);
  expect(onCorrected).not.toHaveBeenCalled();
});

test("keeps the product modal open and reports nothing when the cloud fails", async () => {
  const services = createPanelServices();
  vi.mocked(services.changePurchaseLineProduct).mockResolvedValue({ kind: "failed" });
  const { screen, onCorrected, onStale } = await renderCorrecting(services);

  await chooseFromMenu(screen, "Cambiar el producto");
  const dialog = screen.getByRole("dialog");
  await chooseProduct(screen, dialog, "Avena arrollada");
  await userEvent.click(dialog.getByRole("button", { name: "Cambiar el producto" }));

  await expect.element(screen.getByText("No se cambió el producto")).toBeVisible();
  expect(onCorrected).not.toHaveBeenCalled();
  expect(onStale).not.toHaveBeenCalled();
});

test("removes the line from Más acciones, closes the modal and reports the correction", async () => {
  const services = createPanelServices();
  vi.mocked(services.removePurchaseLine).mockResolvedValue({ kind: "ok", purchase: corrected });
  const { screen, onCorrected } = await renderCorrecting(services);

  await chooseFromMenu(screen, "Quitar de la compra");
  const dialog = screen.getByRole("dialog");
  await expect
    .element(
      dialog.getByRole("heading", { name: '¿Quitar "Miel pura de abeja 1 kg" de la compra?' }),
    )
    .toBeVisible();
  await userEvent.click(dialog.getByRole("button", { name: "Quitar el producto" }));

  await expect.poll(() => onCorrected.mock.calls).toEqual([["lineRemoved", corrected]]);
  expect(screen.getByRole("dialog").query()).toBeNull();
  expect(services.removePurchaseLine).toHaveBeenCalledWith(compraDeMiel.id, lineDeMiel.id);
});

test("asks for the purchases again and keeps the removal modal open when it is the only line", async () => {
  const services = createPanelServices();
  vi.mocked(services.removePurchaseLine).mockResolvedValue({ kind: "last_line" });
  const { screen, onCorrected, onStale } = await renderCorrecting(services);

  await chooseFromMenu(screen, "Quitar de la compra");
  await userEvent.click(
    screen.getByRole("dialog").getByRole("button", { name: "Quitar el producto" }),
  );

  await expect
    .element(
      screen.getByRole("dialog").getByText("Es la única línea de la compra; no se puede quitar."),
    )
    .toBeVisible();
  expect(onStale).toHaveBeenCalledTimes(1);
  expect(onCorrected).not.toHaveBeenCalled();
});
