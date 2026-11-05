import type { PurchaseSummary } from "@purosur/contracts";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { accessWith } from "../shell/test-support/backoffice-access";
import { lineExpiryCorrection } from "./test-support/purchase-changes";
import { fillQuantityLine } from "./test-support/purchase-lines-fill";
import { compraDeAvena, compraDeMiel } from "./test-support/purchases";
import { createServices, loaded, type Screen } from "./test-support/purchases-list-screen";

beforeEach(() => {
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
const SPLIT_EXPIRY = "Dar otro vencimiento a algunas unidades de Miel pura de abeja 1 kg";
const SEE_CHANGES = "Ver los cambios de la compra de Distribuidora Andina";

function names(screen: Screen, label: RegExp): string[] {
  return screen
    .getByRole("button", { name: label })
    .all()
    .map((button) => button.element().getAttribute("aria-label") ?? "");
}

test("offers, to who may record purchases, each purchase's actions and each line's expiry correction", async () => {
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
  await expect
    .poll(() => names(screen, /^Corregir el vencimiento/))
    .toEqual([CORRECT_EXPIRY, "Corregir el vencimiento de Avena arrollada"]);
  await expect
    .poll(() => names(screen, /^Dar otro vencimiento/))
    .toEqual([SPLIT_EXPIRY, "Dar otro vencimiento a algunas unidades de Avena arrollada"]);
  await expect
    .poll(() => names(screen, /^Corregir el costo/))
    .toEqual([CORRECT_COST, "Corregir el costo de Avena arrollada"]);
});

test("offers only the changes of a purchase to who may not record purchases", async () => {
  const screen = await loaded(createServices(), { access: accessWith("stock_area") });

  await expect.poll(() => names(screen, /^Ver los cambios/)).toHaveLength(2);
  expect(names(screen, /^(Agregar|Corregir|Dar otro)/)).toEqual([]);
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

test("corrects the line's expiry, closes the modal, reads the purchases again and confirms", async () => {
  const services = createServices();
  vi.mocked(services.correctPurchaseLineExpiry).mockResolvedValue({
    kind: "ok",
    purchase: compraDeMiel,
  });
  const screen = await loaded(services);

  await userEvent.click(screen.getByRole("button", { name: CORRECT_EXPIRY }));
  const dialog = screen.getByRole("dialog");
  await expect
    .element(dialog.getByRole("heading", { name: "Miel pura de abeja 1 kg" }))
    .toBeVisible();
  await userEvent.click(dialog.getByRole("button", { name: "Guardar el vencimiento" }));

  await expect.element(screen.getByText("Vencimiento corregido")).toBeVisible();
  expect(screen.getByRole("dialog").query()).toBeNull();
  expect(services.correctPurchaseLineExpiry).toHaveBeenCalledWith(compraDeMiel.id, lineDeMiel.id, {
    expiresOn: "2027-01-31",
  });
  await expect.poll(() => vi.mocked(services.fetchPurchases).mock.calls.length).toBe(2);
});

test("corrects the line's cost, closes the modal, reads the purchases again and confirms without claiming the last cost moved", async () => {
  const services = createServices();
  vi.mocked(services.correctPurchaseLineCost).mockResolvedValue({
    kind: "ok",
    purchase: compraDeMiel,
  });
  const screen = await loaded(services);

  await userEvent.click(screen.getByRole("button", { name: CORRECT_COST }));
  const dialog = screen.getByRole("dialog");
  await expect
    .element(dialog.getByRole("heading", { name: "Miel pura de abeja 1 kg" }))
    .toBeVisible();
  await userEvent.click(dialog.getByRole("button", { name: "Guardar el costo" }));

  await expect.element(screen.getByText("Costo corregido")).toBeVisible();
  await expect
    .element(
      screen.getByText(
        "El stock que queda de la compra usa el costo corregido; las ventas ya hechas conservan el suyo.",
      ),
    )
    .toBeVisible();
  expect(screen.getByRole("dialog").query()).toBeNull();
  expect(services.correctPurchaseLineCost).toHaveBeenCalledWith(compraDeMiel.id, lineDeMiel.id, {
    costPaidCents: 7_200_00,
  });
  await expect.poll(() => vi.mocked(services.fetchPurchases).mock.calls.length).toBe(2);
});

test("keeps the cost modal open and the purchases unread when the cloud refuses the correction", async () => {
  const services = createServices();
  vi.mocked(services.correctPurchaseLineCost).mockResolvedValue({ kind: "failed" });
  const screen = await loaded(services);

  await userEvent.click(screen.getByRole("button", { name: CORRECT_COST }));
  await userEvent.click(
    screen.getByRole("dialog").getByRole("button", { name: "Guardar el costo" }),
  );

  await expect.element(screen.getByText("No se corrigió el costo")).toBeVisible();
  expect(screen.getByText("Costo corregido").query()).toBeNull();
  expect(services.fetchPurchases).toHaveBeenCalledTimes(1);
});

test("keeps the modal open and the purchases unread when the cloud refuses the correction", async () => {
  const services = createServices();
  vi.mocked(services.correctPurchaseLineExpiry).mockResolvedValue({ kind: "failed" });
  const screen = await loaded(services);

  await userEvent.click(screen.getByRole("button", { name: CORRECT_EXPIRY }));
  await userEvent.click(
    screen.getByRole("dialog").getByRole("button", { name: "Guardar el vencimiento" }),
  );

  await expect.element(screen.getByText("No se corrigió el vencimiento")).toBeVisible();
  expect(screen.getByText("Vencimiento corregido").query()).toBeNull();
  expect(services.fetchPurchases).toHaveBeenCalledTimes(1);
});

test("reports the confirmation gone once it is dismissed", async () => {
  const services = createServices();
  vi.mocked(services.correctPurchaseLineExpiry).mockResolvedValue({
    kind: "ok",
    purchase: compraDeAvena,
  });
  const screen = await loaded(services);
  await userEvent.click(screen.getByRole("button", { name: CORRECT_EXPIRY }));
  await userEvent.click(
    screen.getByRole("dialog").getByRole("button", { name: "Guardar el vencimiento" }),
  );
  await expect.element(screen.getByText("Vencimiento corregido")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Cerrar" }));

  await expect.poll(() => screen.getByText("Vencimiento corregido").query()).toBeNull();
});

test("replaces the confirmation of a purchase just registered, reporting it gone", async () => {
  const services = createServices();
  vi.mocked(services.correctPurchaseLineExpiry).mockResolvedValue({
    kind: "ok",
    purchase: compraDeMiel,
  });
  const onNoticeDismissed = vi.fn();
  const screen = await loaded(services, { registered: true, onNoticeDismissed });
  await expect.element(screen.getByText("Compra registrada")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: CORRECT_EXPIRY }));
  await userEvent.click(
    screen.getByRole("dialog").getByRole("button", { name: "Guardar el vencimiento" }),
  );

  await expect.element(screen.getByText("Vencimiento corregido")).toBeVisible();
  expect(onNoticeDismissed).toHaveBeenCalledTimes(1);
});

test("splits the expiry of some units of a line, closes the modal, reads the purchases again and confirms", async () => {
  const services = createServices();
  vi.mocked(services.splitPurchaseLineExpiry).mockResolvedValue({
    kind: "ok",
    purchase: compraDeMiel,
  });
  const screen = await loaded(services);

  await userEvent.click(screen.getByRole("button", { name: SPLIT_EXPIRY }));
  const dialog = screen.getByRole("dialog");
  await expect
    .element(dialog.getByRole("heading", { name: "Miel pura de abeja 1 kg" }))
    .toBeVisible();
  await userEvent.type(dialog.getByRole("textbox", { name: /^Cantidad/ }), "1");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar el vencimiento" }));

  await expect.element(screen.getByText("Vencimiento corregido")).toBeVisible();
  expect(screen.getByRole("dialog").query()).toBeNull();
  expect(services.splitPurchaseLineExpiry).toHaveBeenCalledWith(compraDeMiel.id, lineDeMiel.id, {
    quantity: 1_000,
    expiresOn: "2027-01-31",
  });
  await expect.poll(() => vi.mocked(services.fetchPurchases).mock.calls.length).toBe(2);
});

test("keeps the split modal open and the purchases unread when the lot has no more units to split", async () => {
  const services = createServices();
  vi.mocked(services.splitPurchaseLineExpiry).mockResolvedValue({ kind: "not_enough_in_lot" });
  const screen = await loaded(services);

  await userEvent.click(screen.getByRole("button", { name: SPLIT_EXPIRY }));
  const dialog = screen.getByRole("dialog");
  await userEvent.type(dialog.getByRole("textbox", { name: /^Cantidad/ }), "30");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar el vencimiento" }));

  await expect
    .element(
      dialog.getByText(
        "Solo se puede dar otra fecha a menos unidades de las que quedan en el lote.",
      ),
    )
    .toBeVisible();
  expect(screen.getByText("Vencimiento corregido").query()).toBeNull();
  expect(services.fetchPurchases).toHaveBeenCalledTimes(1);
});
