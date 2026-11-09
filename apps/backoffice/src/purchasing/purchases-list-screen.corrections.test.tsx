import type { PurchaseSummary } from "@purosur/contracts";
import { beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { accessWith } from "../shell/test-support/backoffice-access";
import { lineExpiryCorrection } from "./test-support/purchase-changes";
import { chooseProduct, fillQuantityLine } from "./test-support/purchase-lines-fill";
import { compraDeAvena, compraDeMiel } from "./test-support/purchases";
import {
  createServices,
  loaded,
  type Screen,
  type ScreenOptions,
} from "./test-support/purchases-list-screen";
import type { PurchasesListScreenServices } from "./purchases-list-services";

beforeEach(async () => {
  await page.viewport(1280, 900);
  window.history.pushState(null, "", "/");
});

const [lineDeMiel] = compraDeMiel.lines;
if (!lineDeMiel) {
  throw new Error("test setup: the purchase has no line");
}

const corrected: PurchaseSummary = { ...compraDeMiel, purchasedOn: "2026-09-13" };

const ADD_LINES = "Agregar productos a la compra de Distribuidora Andina";
const CORRECT_HEADER = "Corregir los datos de la compra de Distribuidora Andina";
const CORRECT_COST = "Corregir el costo de Miel pura de abeja 1 kg";
const CORRECT_EXPIRY = "Corregir el vencimiento de Miel pura de abeja 1 kg";
const CORRECT_QUANTITY = "Corregir la cantidad de Miel pura de abeja 1 kg";
const SEE_CHANGES = "Ver los cambios de la compra de Distribuidora Andina";

function names(screen: Screen, label: RegExp): string[] {
  return screen
    .getByRole("button", { name: label })
    .all()
    .map((button) => button.element().getAttribute("aria-label") ?? "");
}

async function loadedWithPanel(services: PurchasesListScreenServices, options: ScreenOptions = {}) {
  const screen = await loaded(services, { openPurchase: compraDeMiel.id, ...options });
  await expect.element(screen.getByRole("complementary")).toBeVisible();
  return screen;
}

test("offers, to who may record purchases, the changes, the products to add and the data to correct of each purchase, and nothing else", async () => {
  const screen = await loaded(createServices());

  await expect
    .poll(() => names(screen, /^Ver los cambios/))
    .toEqual([SEE_CHANGES, "Ver los cambios de la compra de Granos del Valle"]);
  await expect
    .poll(() => names(screen, /^Agregar productos/))
    .toEqual([ADD_LINES, "Agregar productos a la compra de Granos del Valle"]);
  await expect
    .poll(() => names(screen, /^Corregir los datos/))
    .toEqual([CORRECT_HEADER, "Corregir los datos de la compra de Granos del Valle"]);
  expect(names(screen, /^(Corregir el|Corregir la|Dar otro|Cambiar|Quitar)/)).toEqual([]);
  expect(screen.getByRole("button", { name: "Más acciones" }).query()).toBeNull();
});

test("offers only the changes of a purchase to who may not record purchases", async () => {
  const screen = await loaded(createServices(), { access: accessWith("stock_area") });

  await expect.poll(() => names(screen, /^Ver los cambios/)).toHaveLength(2);
  expect(names(screen, /^(Agregar|Corregir|Dar otro|Cambiar|Quitar)/)).toEqual([]);
});

test("opens the changes of the purchase and closes them", async () => {
  const services = createServices();
  const screen = await loaded(services);

  await userEvent.click(screen.getByRole("button", { name: SEE_CHANGES }));

  const dialog = screen.getByRole("dialog");
  await expect.element(dialog.getByRole("heading", { name: "Cambios de la compra" })).toBeVisible();
  await expect.element(dialog.getByText("Sin cambios")).toBeVisible();
  expect(services.fetchPurchaseChanges).toHaveBeenCalledWith(compraDeMiel.id);
  await userEvent.click(dialog.getByRole("button", { name: "Cerrar" }).last());
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
});

test("shows the changes of the purchase with the product of each line", async () => {
  const services = createServices();
  vi.mocked(services.fetchPurchaseChanges).mockResolvedValue({
    kind: "ok",
    value: [lineExpiryCorrection],
  });
  const screen = await loaded(services);

  await userEvent.click(screen.getByRole("button", { name: SEE_CHANGES }));

  await expect
    .element(screen.getByRole("dialog").getByText("Vencimiento de Miel pura de abeja 1 kg"))
    .toBeVisible();
});

test("adds products to the purchase, closes the modal, reads the purchases again and confirms", async () => {
  const services = createServices();
  vi.mocked(services.addPurchaseLines).mockResolvedValue({ kind: "ok", purchase: compraDeMiel });
  const screen = await loaded(services);

  await userEvent.click(screen.getByRole("button", { name: ADD_LINES }));
  const dialog = screen.getByRole("dialog");
  await fillQuantityLine(screen, dialog, {
    product: "Avena arrollada",
    quantity: "10",
    cost: "1.800",
  });
  await userEvent.click(dialog.getByRole("button", { name: "Agregar los productos" }));

  await expect.element(screen.getByText("Productos agregados")).toBeVisible();
  await expect.element(screen.getByText("El stock ya refleja lo recibido.")).toBeVisible();
  expect(screen.getByRole("dialog").query()).toBeNull();
  expect(services.addPurchaseLines).toHaveBeenCalledWith(
    compraDeMiel.id,
    expect.objectContaining({ lines: [expect.objectContaining({ quantity: 10_000 })] }),
  );
  await expect.poll(() => vi.mocked(services.fetchPurchases).mock.calls.length).toBe(2);
});

test("corrects the purchase's header, closes the modal, reads the purchases again and confirms", async () => {
  const services = createServices();
  vi.mocked(services.correctPurchaseHeader).mockResolvedValue({ kind: "ok", purchase: corrected });
  const screen = await loaded(services);

  await userEvent.click(screen.getByRole("button", { name: CORRECT_HEADER }));
  const dialog = screen.getByRole("dialog");
  await expect.element(dialog.getByRole("heading", { name: "Distribuidora Andina" })).toBeVisible();
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.element(screen.getByText("Datos corregidos")).toBeVisible();
  await expect
    .element(screen.getByText("La compra de Distribuidora Andina del 13/09/2026."))
    .toBeVisible();
  expect(screen.getByText("La compra ya muestra los datos corregidos.").query()).toBeNull();
  expect(screen.getByRole("dialog").query()).toBeNull();
  expect(services.correctPurchaseHeader).toHaveBeenCalledWith(
    compraDeMiel.id,
    expect.objectContaining({ purchasedOn: "2026-09-14", receiptType: "factura_b" }),
  );
  await expect.poll(() => vi.mocked(services.fetchPurchases).mock.calls.length).toBe(2);
});

async function chooseFromMenu(screen: Screen, item: string) {
  await userEvent.click(screen.getByRole("button", { name: "Más acciones" }));
  await userEvent.click(page.getByRole("menuitem", { name: item }));
}

test("corrects the line's expiry from the panel, reads the purchases again and confirms", async () => {
  const services = createServices();
  vi.mocked(services.correctPurchaseLineExpiry).mockResolvedValue({
    kind: "ok",
    purchase: compraDeMiel,
  });
  const screen = await loadedWithPanel(services);

  await userEvent.click(screen.getByRole("button", { name: CORRECT_EXPIRY }));
  await userEvent.click(
    screen.getByRole("dialog").getByRole("button", { name: "Guardar el vencimiento" }),
  );

  await expect.element(screen.getByText("Vencimiento corregido")).toBeVisible();
  await expect
    .element(screen.getByText("Las alertas y los listados usan la fecha corregida."))
    .toBeVisible();
  expect(screen.getByRole("dialog").query()).toBeNull();
  expect(services.correctPurchaseLineExpiry).toHaveBeenCalledWith(compraDeMiel.id, lineDeMiel.id, {
    expiresOn: "2027-01-31",
  });
  await expect.poll(() => vi.mocked(services.fetchPurchases).mock.calls.length).toBe(2);
});

test("corrects the line's cost from the panel, reads the purchases again and confirms without claiming the last cost moved", async () => {
  const services = createServices();
  vi.mocked(services.correctPurchaseLineCost).mockResolvedValue({
    kind: "ok",
    purchase: compraDeMiel,
  });
  const screen = await loadedWithPanel(services);

  await userEvent.click(screen.getByRole("button", { name: CORRECT_COST }));
  await userEvent.click(
    screen.getByRole("dialog").getByRole("button", { name: "Guardar el costo" }),
  );

  await expect.element(screen.getByText("Costo corregido")).toBeVisible();
  await expect
    .element(
      screen.getByText(
        "El stock que queda de la compra usa el costo corregido; las ventas ya hechas conservan el suyo.",
      ),
    )
    .toBeVisible();
  expect(screen.getByRole("dialog").query()).toBeNull();
  await expect.poll(() => vi.mocked(services.fetchPurchases).mock.calls.length).toBe(2);
});

test("corrects the line's quantity from the panel, reads the purchases again and confirms without claiming a count was moved", async () => {
  const services = createServices();
  vi.mocked(services.correctPurchaseLineQuantity).mockResolvedValue({
    kind: "ok",
    purchase: compraDeMiel,
  });
  const screen = await loadedWithPanel(services);

  await userEvent.click(screen.getByRole("button", { name: CORRECT_QUANTITY }));
  const dialog = screen.getByRole("dialog");
  const packages = dialog.getByRole("textbox", { name: /^Cantidad de paquetes/ });
  await userEvent.clear(packages);
  await userEvent.type(packages, "3");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar la cantidad" }));

  await expect.element(screen.getByText("Cantidad corregida")).toBeVisible();
  await expect
    .element(
      screen.getByText(
        "El stock de la línea sigue la cantidad corregida, salvo que un conteo posterior ya la haya contado.",
      ),
    )
    .toBeVisible();
  expect(screen.getByRole("dialog").query()).toBeNull();
  await expect.poll(() => vi.mocked(services.fetchPurchases).mock.calls.length).toBe(2);
});

test("splits the expiry of some units from the panel, reads the purchases again and confirms", async () => {
  const services = createServices();
  vi.mocked(services.splitPurchaseLineExpiry).mockResolvedValue({
    kind: "ok",
    purchase: compraDeMiel,
  });
  const screen = await loadedWithPanel(services);

  await chooseFromMenu(screen, "Dar otro vencimiento a algunas unidades");
  const dialog = screen.getByRole("dialog");
  await userEvent.type(dialog.getByRole("textbox", { name: /^Cantidad/ }), "1");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar el vencimiento" }));

  await expect.element(screen.getByText("Vencimiento corregido")).toBeVisible();
  await expect
    .element(screen.getByText("Las unidades elegidas quedaron en un lote con la fecha corregida."))
    .toBeVisible();
  await expect.poll(() => vi.mocked(services.fetchPurchases).mock.calls.length).toBe(2);
});

test("changes the line's product from the panel, reads the purchases again and confirms", async () => {
  const services = createServices();
  vi.mocked(services.changePurchaseLineProduct).mockResolvedValue({
    kind: "ok",
    purchase: compraDeMiel,
  });
  const screen = await loadedWithPanel(services);

  await chooseFromMenu(screen, "Cambiar el producto");
  const dialog = screen.getByRole("dialog");
  await chooseProduct(screen, dialog, "Avena arrollada");
  await userEvent.click(dialog.getByRole("button", { name: "Cambiar el producto" }));

  await expect.element(screen.getByText("Producto cambiado")).toBeVisible();
  await expect
    .element(screen.getByText("El lote de la línea pasó al producto nuevo, con sus unidades."))
    .toBeVisible();
  await expect.poll(() => vi.mocked(services.fetchPurchases).mock.calls.length).toBe(2);
});

test("removes the line from the panel, reads the purchases again and confirms", async () => {
  const services = createServices();
  vi.mocked(services.removePurchaseLine).mockResolvedValue({ kind: "ok", purchase: compraDeMiel });
  const screen = await loadedWithPanel(services);

  await chooseFromMenu(screen, "Quitar de la compra");
  await userEvent.click(
    screen.getByRole("dialog").getByRole("button", { name: "Quitar el producto" }),
  );

  await expect.element(screen.getByText("Producto quitado")).toBeVisible();
  await expect.element(screen.getByText("Sus unidades ya no cuentan en el stock.")).toBeVisible();
  await expect.poll(() => vi.mocked(services.fetchPurchases).mock.calls.length).toBe(2);
});

test("keeps the purchases unread when the cloud refuses a correction of the panel", async () => {
  const services = createServices();
  vi.mocked(services.correctPurchaseLineCost).mockResolvedValue({ kind: "failed" });
  const screen = await loadedWithPanel(services);

  await userEvent.click(screen.getByRole("button", { name: CORRECT_COST }));
  await userEvent.click(
    screen.getByRole("dialog").getByRole("button", { name: "Guardar el costo" }),
  );

  await expect.element(screen.getByText("No se corrigió el costo")).toBeVisible();
  expect(screen.getByText("Costo corregido").query()).toBeNull();
  expect(services.fetchPurchases).toHaveBeenCalledTimes(1);
});

test("reports the confirmation gone once it is dismissed", async () => {
  const services = createServices();
  vi.mocked(services.correctPurchaseLineExpiry).mockResolvedValue({
    kind: "ok",
    purchase: compraDeAvena,
  });
  const screen = await loadedWithPanel(services);
  await userEvent.click(screen.getByRole("button", { name: CORRECT_EXPIRY }));
  await userEvent.click(
    screen.getByRole("dialog").getByRole("button", { name: "Guardar el vencimiento" }),
  );
  await expect.element(screen.getByText("Vencimiento corregido")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Cerrar" }).last());

  await expect.poll(() => screen.getByText("Vencimiento corregido").query()).toBeNull();
});

test("replaces the confirmation of a purchase just registered, reporting it gone", async () => {
  const services = createServices();
  vi.mocked(services.correctPurchaseLineExpiry).mockResolvedValue({
    kind: "ok",
    purchase: compraDeMiel,
  });
  const onNoticeDismissed = vi.fn();
  const screen = await loadedWithPanel(services, { registered: true, onNoticeDismissed });
  await expect.element(screen.getByText("Compra registrada")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: CORRECT_EXPIRY }));
  await userEvent.click(
    screen.getByRole("dialog").getByRole("button", { name: "Guardar el vencimiento" }),
  );

  await expect.element(screen.getByText("Vencimiento corregido")).toBeVisible();
  expect(onNoticeDismissed).toHaveBeenCalledTimes(1);
});

test("clears the confirmation when another correction starts", async () => {
  const services = createServices();
  vi.mocked(services.correctPurchaseLineExpiry).mockResolvedValue({
    kind: "ok",
    purchase: compraDeMiel,
  });
  const screen = await loadedWithPanel(services);
  await userEvent.click(screen.getByRole("button", { name: CORRECT_EXPIRY }));
  await userEvent.click(
    screen.getByRole("dialog").getByRole("button", { name: "Guardar el vencimiento" }),
  );
  await expect.element(screen.getByText("Vencimiento corregido")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: CORRECT_COST }));

  await expect.poll(() => screen.getByText("Vencimiento corregido").query()).toBeNull();
});

test("shows what remains in the lot once the purchases are read again after a split without enough units", async () => {
  const services = createServices();
  vi.mocked(services.splitPurchaseLineExpiry).mockResolvedValue({ kind: "not_enough_in_lot" });
  const screen = await loadedWithPanel(services);
  vi.mocked(services.fetchPurchases).mockResolvedValue({
    kind: "ok",
    value: [{ ...compraDeMiel, lines: [{ ...lineDeMiel, remainingInLot: 3_000 }] }, compraDeAvena],
  });

  await chooseFromMenu(screen, "Dar otro vencimiento a algunas unidades");
  const dialog = screen.getByRole("dialog");
  await expect.element(dialog.getByText("Quedan 18 u en el lote")).toBeVisible();
  await userEvent.type(dialog.getByRole("textbox", { name: /^Cantidad/ }), "10");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar el vencimiento" }));

  await expect.element(dialog.getByText("Quedan 3 u en el lote")).toBeVisible();
  await expect.element(dialog.getByRole("textbox", { name: /^Cantidad/ })).toHaveValue("10");
  expect(screen.getByText("Vencimiento corregido").query()).toBeNull();
  expect(services.fetchPurchases).toHaveBeenCalledTimes(2);
});

test("shows what remains in the lot once the purchases are read again after a quantity correction without enough units", async () => {
  const services = createServices();
  vi.mocked(services.correctPurchaseLineQuantity).mockResolvedValue({ kind: "not_enough_in_lot" });
  const screen = await loadedWithPanel(services);
  vi.mocked(services.fetchPurchases).mockResolvedValue({
    kind: "ok",
    value: [{ ...compraDeMiel, lines: [{ ...lineDeMiel, remainingInLot: 3_000 }] }, compraDeAvena],
  });

  await userEvent.click(screen.getByRole("button", { name: CORRECT_QUANTITY }));
  const dialog = screen.getByRole("dialog");
  await expect
    .element(dialog.getByText("Cada paquete trae 12 u · Quedan 18 u en el lote"))
    .toBeVisible();
  const packages = dialog.getByRole("textbox", { name: /^Cantidad de paquetes/ });
  await userEvent.clear(packages);
  await userEvent.type(packages, "1");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar la cantidad" }));

  await expect
    .element(dialog.getByText("Cada paquete trae 12 u · Quedan 3 u en el lote"))
    .toBeVisible();
  await expect.element(packages).toHaveValue("1");
  expect(screen.getByText("Cantidad corregida").query()).toBeNull();
  expect(services.fetchPurchases).toHaveBeenCalledTimes(2);
});

test("reads the purchases again when a unit already left the lot of a line whose product is changed", async () => {
  const services = createServices();
  vi.mocked(services.changePurchaseLineProduct).mockResolvedValue({ kind: "units_left_lot" });
  const screen = await loadedWithPanel(services);

  await chooseFromMenu(screen, "Cambiar el producto");
  const dialog = screen.getByRole("dialog");
  await chooseProduct(screen, dialog, "Avena arrollada");
  await userEvent.click(dialog.getByRole("button", { name: "Cambiar el producto" }));

  await expect.element(dialog.getByText(/^Ya salieron unidades del lote/)).toBeVisible();
  await expect.poll(() => vi.mocked(services.fetchPurchases).mock.calls.length).toBe(2);
});

test("reads the purchases again when the line to remove is the only one", async () => {
  const services = createServices();
  vi.mocked(services.removePurchaseLine).mockResolvedValue({ kind: "last_line" });
  const screen = await loadedWithPanel(services);

  await chooseFromMenu(screen, "Quitar de la compra");
  await userEvent.click(
    screen.getByRole("dialog").getByRole("button", { name: "Quitar el producto" }),
  );

  await expect
    .element(
      screen.getByRole("dialog").getByText("Es la única línea de la compra; no se puede quitar."),
    )
    .toBeVisible();
  await expect.poll(() => vi.mocked(services.fetchPurchases).mock.calls.length).toBe(2);
});
