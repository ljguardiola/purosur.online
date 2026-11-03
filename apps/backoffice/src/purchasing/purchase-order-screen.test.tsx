import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import type { PurchaseOrderScreenServices } from "./purchase-order-services";
import {
  createServices,
  deferred,
  loaded,
  renderScreen,
  type Screen,
} from "./test-support/purchase-order-screen";
import { CANCELLED_ORDER, DRAFT_ORDER, ORDER_ID, SENT_ORDER } from "./test-support/purchase-orders";
import { AVENA_PRODUCT_ID, MIEL_PRODUCT_ID } from "./test-support/purchase-products";

const ALMENDRAS_PRODUCT_ID = "90d00000-0000-4000-8000-000000000003";

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

function line(screen: Screen, number: number) {
  return screen.getByRole("group", { name: `Línea ${number}` });
}

async function chooseFromComboBox(
  screen: Screen,
  scope: Pick<Screen, "getByRole">,
  label: RegExp,
  name: string,
) {
  await userEvent.click(scope.getByRole("combobox", { name: label }));
  await expect.element(screen.getByRole("option", { name })).toBeVisible();
  (screen.getByRole("option", { name }).element() as HTMLElement).click();
}

async function save(screen: Screen) {
  await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
}

test("shows the supplier, the creation date, the state and the expected total of the order", async () => {
  const screen = await loaded(createServices());

  await expect.element(screen.getByText("Pedidos", { exact: true }).first()).toBeVisible();
  await expect.element(screen.getByText("Distribuidora Andina").last()).toBeVisible();
  await expect.element(screen.getByText("10/03/2026")).toBeVisible();
  await expect.element(screen.getByText("Borrador")).toBeVisible();
  await expect.element(screen.getByText("$ 5.550,00").first()).toBeVisible();
  await expect.element(screen.getByText("Hay líneas sin precio de lista")).toBeVisible();
});

test("shows the day the order was created in Argentina", async () => {
  const screen = await loaded(
    createServices({
      fetchPurchaseOrder: vi.fn().mockResolvedValue({
        kind: "ok",
        value: { kind: "found", order: { ...DRAFT_ORDER, createdAt: "2026-03-10T01:30:00.000Z" } },
      }),
    }),
  );

  await expect.element(screen.getByText("09/03/2026")).toBeVisible();
});

test("shows each line of a draft with its product, packages, quantity each holds, expected package price and total", async () => {
  const screen = await loaded(createServices());

  const miel = line(screen, 1);
  await expect.element(miel.getByText("Miel pura de abeja 1 kg")).toBeVisible();
  await expect
    .element(miel.getByRole("textbox", { name: /^Cantidad de paquetes/ }))
    .toHaveValue("3");
  await expect
    .element(miel.getByRole("textbox", { name: /^Cantidad por paquete/ }))
    .toHaveValue("12");
  await expect.element(miel.getByText("$ 1.850,00")).toBeVisible();
  await expect.element(miel.getByText("$ 5.550,00")).toBeVisible();
  const avena = line(screen, 2);
  await expect.element(avena.getByText("Avena arrollada")).toBeVisible();
  await expect
    .element(avena.getByRole("textbox", { name: /^Cantidad por paquete/ }))
    .toHaveValue("25,000");
  await expect.element(avena.getByText("Sin precio de lista").first()).toBeVisible();
});

test("never asks for a price", async () => {
  const screen = await loaded(createServices());

  expect(screen.getByRole("textbox", { name: /precio/i }).query()).toBeNull();
});

test("saving sends the lines as typed and says the order was saved", async () => {
  const services = createServices();
  vi.mocked(services.editPurchaseOrderLines).mockResolvedValue({
    kind: "ok",
    order: DRAFT_ORDER,
  });
  const screen = await loaded(services);

  await userEvent.fill(
    line(screen, 1).getByRole("textbox", { name: /^Cantidad de paquetes/ }),
    "4",
  );
  await userEvent.fill(
    line(screen, 2).getByRole("textbox", { name: /^Cantidad por paquete/ }),
    "20,5",
  );
  await save(screen);

  expect(services.editPurchaseOrderLines).toHaveBeenCalledWith(ORDER_ID, {
    lines: [
      { productId: MIEL_PRODUCT_ID, packages: 4, quantityPerPackage: 12_000 },
      { productId: AVENA_PRODUCT_ID, packages: 2, quantityPerPackage: 20_500 },
    ],
  });
  await expect.element(screen.getByText("Pedido guardado").first()).toBeVisible();
});

test("reads the order again after saving", async () => {
  const services = createServices();
  vi.mocked(services.editPurchaseOrderLines).mockResolvedValue({
    kind: "ok",
    order: DRAFT_ORDER,
  });
  const screen = await loaded(services);
  const edited = {
    ...DRAFT_ORDER,
    lines: DRAFT_ORDER.lines.map((orderLine) => ({ ...orderLine, packages: 9 })),
  };
  vi.mocked(services.fetchPurchaseOrder).mockResolvedValue({
    kind: "ok",
    value: { kind: "found", order: edited },
  });

  await save(screen);

  await expect.element(screen.getByText("Pedido guardado").first()).toBeVisible();
  await expect.poll(() => vi.mocked(services.fetchPurchaseOrder).mock.calls.length).toBe(2);
});

test("adds a product that is not in the order yet and saves it", async () => {
  const services = createServices();
  vi.mocked(services.editPurchaseOrderLines).mockResolvedValue({
    kind: "ok",
    order: DRAFT_ORDER,
  });
  const screen = await loaded(services);

  await userEvent.click(screen.getByRole("button", { name: "Agregar línea" }));
  const added = line(screen, 3);
  await userEvent.click(added.getByRole("combobox", { name: /^Producto/ }));
  expect(screen.getByRole("option", { name: "Miel pura de abeja 1 kg" }).query()).toBeNull();
  await chooseFromComboBox(screen, added, /^Producto/, "Almendras peladas");
  await userEvent.fill(added.getByRole("textbox", { name: /^Cantidad de paquetes/ }), "2");
  await userEvent.fill(added.getByRole("textbox", { name: /^Cantidad por paquete/ }), "5");
  await expect.element(added.getByText("Se calcula al guardar")).toBeVisible();
  await save(screen);

  expect(services.editPurchaseOrderLines).toHaveBeenCalledWith(ORDER_ID, {
    lines: [
      { productId: MIEL_PRODUCT_ID, packages: 3, quantityPerPackage: 12_000 },
      { productId: AVENA_PRODUCT_ID, packages: 2, quantityPerPackage: 25_000 },
      { productId: ALMENDRAS_PRODUCT_ID, packages: 2, quantityPerPackage: 5_000 },
    ],
  });
});

test("removes a line and saves the rest", async () => {
  const services = createServices();
  vi.mocked(services.editPurchaseOrderLines).mockResolvedValue({
    kind: "ok",
    order: DRAFT_ORDER,
  });
  const screen = await loaded(services);

  await userEvent.click(line(screen, 2).getByRole("button", { name: "Quitar línea" }));
  await save(screen);

  expect(services.editPurchaseOrderLines).toHaveBeenCalledWith(ORDER_ID, {
    lines: [{ productId: MIEL_PRODUCT_ID, packages: 3, quantityPerPackage: 12_000 }],
  });
});

test("names the first line whose values cannot be read and sends nothing", async () => {
  const services = createServices();
  const screen = await loaded(services);

  await userEvent.fill(
    line(screen, 2).getByRole("textbox", { name: /^Cantidad de paquetes/ }),
    "abc",
  );
  await save(screen);

  await expect
    .element(screen.getByText("Línea 2: Ingresá cuántos paquetes pedir, en un número entero."))
    .toBeVisible();
  expect(services.editPurchaseOrderLines).not.toHaveBeenCalled();
});

test("asks for a line when every line was removed, as the cloud refuses an empty order", async () => {
  const services = createServices();
  vi.mocked(services.editPurchaseOrderLines).mockResolvedValue({
    kind: "validation_failed",
    field: "lines",
  });
  const screen = await loaded(services);

  await userEvent.click(line(screen, 2).getByRole("button", { name: "Quitar línea" }));
  await userEvent.click(line(screen, 1).getByRole("button", { name: "Quitar línea" }));
  await save(screen);

  await expect.element(screen.getByText("Agregá al menos una línea.")).toBeVisible();
});

test.each([
  [
    { kind: "not_editable" },
    "Este pedido ya no se puede editar",
    "Actualizamos el pedido con su estado actual.",
  ],
  [{ kind: "not_found" }, "Este pedido ya no existe", "Volvé a la lista de pedidos."],
  [
    { kind: "product_not_purchasable" },
    "Un producto del pedido ya no está disponible",
    "Quitalo del pedido o elegí otro.",
  ],
  [{ kind: "failed" }, "No se guardó el pedido", "Volvé a intentarlo."],
  [
    { kind: "rate_limited", retryAfterSeconds: 60 },
    "Demasiadas solicitudes",
    "Se puede volver a intentar en 1 minuto.",
  ],
] as const)("shows %j when saving", async (outcome, title, description) => {
  const services = createServices();
  vi.mocked(services.editPurchaseOrderLines).mockResolvedValue(outcome);
  const screen = await loaded(services);

  await save(screen);

  await expect.element(screen.getByText(title)).toBeVisible();
  await expect.element(screen.getByText(description)).toBeVisible();
});

test("reads the order again when saving finds it no longer editable, and keeps saying why nothing was saved", async () => {
  const services = createServices();
  vi.mocked(services.editPurchaseOrderLines).mockResolvedValue({ kind: "not_editable" });
  const screen = await loaded(services);
  vi.mocked(services.fetchPurchaseOrder).mockResolvedValue({
    kind: "ok",
    value: { kind: "found", order: { ...CANCELLED_ORDER, id: ORDER_ID } },
  });

  await save(screen);

  await expect.element(screen.getByText("Cancelado")).toBeVisible();
  expect(screen.getByRole("button", { name: "Guardar" }).query()).toBeNull();
  await expect.element(screen.getByText("Este pedido ya no se puede editar")).toBeVisible();
  await expect
    .element(screen.getByText("Actualizamos el pedido con su estado actual."))
    .toBeVisible();
});

test("ends the session when saving finds no open session", async () => {
  const services = createServices();
  vi.mocked(services.editPurchaseOrderLines).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const screen = await loaded(services, { onSessionEnded });

  await save(screen);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("navigates to Mi cuenta when saving comes back forbidden", async () => {
  window.history.pushState(null, "", "/purchase-orders");
  const services = createServices();
  vi.mocked(services.editPurchaseOrderLines).mockResolvedValue({ kind: "forbidden" });
  const screen = await loaded(services);

  await save(screen);

  await expect.poll(() => window.location.pathname).toBe("/account");
});

test("cancelling the order asks first, then cancels it and shows it cancelled", async () => {
  const services = createServices();
  vi.mocked(services.cancelPurchaseOrder).mockResolvedValue({ kind: "ok", order: CANCELLED_ORDER });
  const screen = await loaded(services);
  vi.mocked(services.fetchPurchaseOrder).mockResolvedValue({
    kind: "ok",
    value: { kind: "found", order: { ...CANCELLED_ORDER, id: ORDER_ID } },
  });

  await userEvent.click(screen.getByRole("button", { name: "Cancelar pedido" }));
  expect(services.cancelPurchaseOrder).not.toHaveBeenCalled();
  const dialog = screen.getByRole("dialog");
  await expect
    .element(dialog.getByRole("heading", { name: "¿Cancelar el pedido a Distribuidora Andina?" }))
    .toBeVisible();
  await userEvent.click(dialog.getByRole("button", { name: "Cancelar pedido" }));

  expect(services.cancelPurchaseOrder).toHaveBeenCalledWith(ORDER_ID);
  await expect.element(screen.getByText("Pedido cancelado").first()).toBeVisible();
  await expect.element(screen.getByText("Ya no se puede compartir.")).toBeVisible();
  await expect.element(screen.getByText("Cancelado").first()).toBeVisible();
  expect(screen.getByRole("dialog").query()).toBeNull();
  expect(screen.getByRole("button", { name: "Guardar" }).query()).toBeNull();
});

test("a cancelled order is read-only: its lines are shown in a table with no inputs and no actions", async () => {
  const services = createServices({
    fetchPurchaseOrder: vi.fn().mockResolvedValue({
      kind: "ok",
      value: { kind: "found", order: CANCELLED_ORDER },
    }),
  });
  const screen = await loaded(services);

  await expect.element(screen.getByText("Cancelado")).toBeVisible();
  const table = screen.getByRole("table", { name: "Líneas del pedido" });
  await expect.element(table.getByText("Miel pura de abeja 1 kg")).toBeVisible();
  await expect.element(table.getByText("$ 1.850,00")).toBeVisible();
  await expect.element(table.getByText("Sin precio de lista").first()).toBeVisible();
  expect(screen.getByRole("textbox").query()).toBeNull();
  expect(screen.getByRole("button", { name: "Guardar" }).query()).toBeNull();
  expect(screen.getByRole("button", { name: "Cancelar pedido" }).query()).toBeNull();
  expect(screen.getByRole("button", { name: "Agregar línea" }).query()).toBeNull();
});

test("decides whether the lines are editable from the cloud's answer, not from the state", async () => {
  const services = createServices({
    fetchPurchaseOrder: vi.fn().mockResolvedValue({
      kind: "ok",
      value: { kind: "found", order: { ...DRAFT_ORDER, editable: false, cancellable: false } },
    }),
  });
  const screen = await loaded(services);

  await expect.element(screen.getByRole("table", { name: "Líneas del pedido" })).toBeVisible();
  expect(screen.getByRole("textbox").query()).toBeNull();
  expect(screen.getByRole("button", { name: "Cancelar pedido" }).query()).toBeNull();
});

test("offers no cancellation when the cloud answers the order cannot be cancelled", async () => {
  const services = createServices({
    fetchPurchaseOrder: vi.fn().mockResolvedValue({
      kind: "ok",
      value: { kind: "found", order: { ...DRAFT_ORDER, cancellable: false } },
    }),
  });
  const screen = await loaded(services);

  await expect.element(screen.getByRole("button", { name: "Guardar" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Cancelar pedido" }).query()).toBeNull();
});

test("shows the totals the cloud answers", async () => {
  const services = createServices({
    fetchPurchaseOrder: vi.fn().mockResolvedValue({
      kind: "ok",
      value: {
        kind: "found",
        order: {
          ...CANCELLED_ORDER,
          expectedTotalCents: 777_000,
          hasUnpricedLine: false,
          lines: [{ ...DRAFT_ORDER.lines[0], expectedTotalCents: 666_000 }],
        },
      },
    }),
  });
  const screen = await loaded(services);

  await expect.element(screen.getByText("$ 7.770,00")).toBeVisible();
  await expect.element(screen.getByText("$ 6.660,00")).toBeVisible();
  expect(screen.getByText("Hay líneas sin precio de lista").query()).toBeNull();
});

test("offers no way to add a product while the products fail to load, and keeps the rest editable", async () => {
  const services = createServices({
    fetchPurchaseChoices: vi.fn().mockResolvedValue({ kind: "failed" }),
  });
  const screen = await loaded(services);

  await expect.element(screen.getByRole("button", { name: "Agregar línea" })).toBeDisabled();
  await expect
    .element(line(screen, 1).getByRole("textbox", { name: /^Cantidad de paquetes/ }))
    .toBeEnabled();
});

test("the back action goes to the orders", async () => {
  const onBack = vi.fn();
  const screen = await loaded(createServices(), { onBack });

  await userEvent.click(screen.getByRole("button", { name: "Volver a los pedidos" }));

  expect(onBack).toHaveBeenCalledTimes(1);
});

test("says the order no longer exists when the cloud has none", async () => {
  const services = createServices({
    fetchPurchaseOrder: vi.fn().mockResolvedValue({ kind: "ok", value: { kind: "not_found" } }),
  });
  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Este pedido ya no existe")).toBeVisible();
  expect(screen.getByRole("button", { name: "Guardar" }).query()).toBeNull();
});

test("shows a placeholder while the order loads, with no actions", async () => {
  const pending =
    deferred<Awaited<ReturnType<PurchaseOrderScreenServices["fetchPurchaseOrder"]>>>();
  const services = createServices({ fetchPurchaseOrder: vi.fn().mockReturnValue(pending.promise) });
  const screen = await renderScreen(services);

  await expect.element(screen.getByRole("heading", { name: "Pedido", level: 1 })).toBeVisible();
  expect(screen.getByRole("button", { name: "Guardar" }).query()).toBeNull();
  expect(screen.getByRole("button", { name: "Cancelar pedido" }).query()).toBeNull();
});

test("shows a load error with a retry action", async () => {
  const services = createServices();
  vi.mocked(services.fetchPurchaseOrder)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockResolvedValueOnce({ kind: "ok", value: { kind: "found", order: DRAFT_ORDER } });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No pudimos abrir el pedido")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByRole("button", { name: "Guardar" })).toBeVisible();
});

test("ends the session when the order comes back unauthenticated", async () => {
  const services = createServices({
    fetchPurchaseOrder: vi.fn().mockResolvedValue({ kind: "unauthenticated" }),
  });
  const onSessionEnded = vi.fn();
  await renderScreen(services, { onSessionEnded });

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("navigates to Mi cuenta when the order comes back forbidden", async () => {
  window.history.pushState(null, "", "/purchase-orders");
  const services = createServices({
    fetchPurchaseOrder: vi.fn().mockResolvedValue({ kind: "forbidden" }),
  });
  await renderScreen(services);

  await expect.poll(() => window.location.pathname).toBe("/account");
});

test("has no accessibility violations as a draft and with the cancel question open", async () => {
  const services = createServices();
  const screen = await loaded(services);

  await expectNoAccessibilityViolations(screen.container);
  await userEvent.click(screen.getByRole("button", { name: "Cancelar pedido" }));
  await expectNoAccessibilityViolations(document.body);
});

test("has no accessibility violations once cancelled", async () => {
  const services = createServices({
    fetchPurchaseOrder: vi.fn().mockResolvedValue({
      kind: "ok",
      value: { kind: "found", order: CANCELLED_ORDER },
    }),
  });
  const screen = await loaded(services);

  await expectNoAccessibilityViolations(screen.container);
});

function sentServices(overrides: Partial<PurchaseOrderScreenServices> = {}) {
  return createServices({
    fetchPurchaseOrder: vi.fn().mockResolvedValue({
      kind: "ok",
      value: { kind: "found", order: SENT_ORDER },
    }),
    ...overrides,
  });
}

test("a sent order reads Enviado, is read-only and offers its cancellation", async () => {
  const screen = await loaded(sentServices());

  await expect.element(screen.getByText("Enviado")).toBeVisible();
  await expect.element(screen.getByRole("table", { name: "Líneas del pedido" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Guardar" }).query()).toBeNull();
  await expect.element(screen.getByRole("button", { name: "Cancelar pedido" })).toBeVisible();
});

test("cancelling a sent order asks first, then cancels it and shows it cancelled", async () => {
  const services = sentServices();
  vi.mocked(services.cancelPurchaseOrder).mockResolvedValue({ kind: "ok", order: CANCELLED_ORDER });
  const screen = await loaded(services);
  vi.mocked(services.fetchPurchaseOrder).mockResolvedValue({
    kind: "ok",
    value: { kind: "found", order: { ...CANCELLED_ORDER, id: ORDER_ID } },
  });

  await userEvent.click(screen.getByRole("button", { name: "Cancelar pedido" }));
  expect(services.cancelPurchaseOrder).not.toHaveBeenCalled();
  await userEvent.click(
    screen.getByRole("dialog").getByRole("button", { name: "Cancelar pedido" }),
  );

  expect(services.cancelPurchaseOrder).toHaveBeenCalledWith(ORDER_ID);
  await expect.element(screen.getByText("Pedido cancelado").first()).toBeVisible();
  await expect.element(screen.getByText("Ya no se puede compartir.")).toBeVisible();
  await expect.element(screen.getByText("Cancelado").first()).toBeVisible();
});

test("offers no cancellation of a read-only order the cloud answers cannot be cancelled", async () => {
  const screen = await loaded(
    sentServices({
      fetchPurchaseOrder: vi.fn().mockResolvedValue({
        kind: "ok",
        value: { kind: "found", order: { ...SENT_ORDER, cancellable: false } },
      }),
    }),
  );

  await expect.element(screen.getByRole("table", { name: "Líneas del pedido" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Cancelar pedido" }).query()).toBeNull();
});

test("Compartir pedido opens the sharing of a draft", async () => {
  const draft = await loaded(createServices());
  await userEvent.click(draft.getByRole("button", { name: "Compartir pedido" }));
  await expect
    .element(draft.getByRole("dialog").getByRole("heading", { name: "Compartir pedido" }))
    .toBeVisible();
  await expect.element(draft.getByText(/Pedido a Distribuidora Andina/).last()).toBeVisible();
});

test("Compartir pedido opens the sharing of a sent order, which offers no marking as sent", async () => {
  const screen = await loaded(sentServices());

  await userEvent.click(screen.getByRole("button", { name: "Compartir pedido" }));

  const dialog = screen.getByRole("dialog");
  await expect.element(dialog.getByRole("button", { name: "Descargar PDF" })).toBeVisible();
  expect(dialog.getByRole("button", { name: "Marcar como enviado" }).query()).toBeNull();
});

test("a cancelled order offers no sharing", async () => {
  const screen = await loaded(
    createServices({
      fetchPurchaseOrder: vi.fn().mockResolvedValue({
        kind: "ok",
        value: { kind: "found", order: CANCELLED_ORDER },
      }),
    }),
  );

  await expect.element(screen.getByText("Cancelado")).toBeVisible();
  expect(screen.getByRole("button", { name: "Compartir pedido" }).query()).toBeNull();
});

test("decides whether the order may be shared from the cloud's answer, not from the state", async () => {
  const screen = await loaded(
    sentServices({
      fetchPurchaseOrder: vi.fn().mockResolvedValue({
        kind: "ok",
        value: { kind: "found", order: { ...SENT_ORDER, documentShareable: false } },
      }),
    }),
  );

  await expect.element(screen.getByText("Enviado")).toBeVisible();
  expect(screen.getByRole("button", { name: "Compartir pedido" }).query()).toBeNull();
});

test("marking as sent closes the sharing, says so and shows the order sent", async () => {
  const services = createServices();
  vi.mocked(services.sharePurchaseOrder).mockResolvedValue({ kind: "ok", order: SENT_ORDER });
  const screen = await loaded(services);
  vi.mocked(services.fetchPurchaseOrder).mockResolvedValue({
    kind: "ok",
    value: { kind: "found", order: SENT_ORDER },
  });

  await userEvent.click(screen.getByRole("button", { name: "Compartir pedido" }));
  await userEvent.click(
    screen.getByRole("dialog").getByRole("button", { name: "Marcar como enviado" }),
  );

  expect(services.sharePurchaseOrder).toHaveBeenCalledWith(ORDER_ID);
  await expect.element(screen.getByText("Pedido marcado como enviado")).toBeVisible();
  await expect.element(screen.getByText("Ya no se puede editar.")).toBeVisible();
  await expect.element(screen.getByText("Enviado").first()).toBeVisible();
  expect(screen.getByRole("dialog").query()).toBeNull();
  expect(screen.getByRole("button", { name: "Guardar" }).query()).toBeNull();
});

test("reads the order again when sharing finds it no longer shareable", async () => {
  const services = createServices();
  vi.mocked(services.sharePurchaseOrder).mockResolvedValue({ kind: "not_shareable" });
  const screen = await loaded(services);
  vi.mocked(services.fetchPurchaseOrder).mockResolvedValue({
    kind: "ok",
    value: { kind: "found", order: SENT_ORDER },
  });

  await userEvent.click(screen.getByRole("button", { name: "Compartir pedido" }));
  const dialog = screen.getByRole("dialog");
  await userEvent.click(dialog.getByRole("button", { name: "Marcar como enviado" }));
  await userEvent.click(dialog.getByRole("button", { name: "Actualizar el pedido" }));

  await expect.element(screen.getByText("Enviado").first()).toBeVisible();
  expect(screen.getByRole("dialog").query()).toBeNull();
});

test("shows the supplier's item under each product of a read-only order that has one", async () => {
  const screen = await loaded(sentServices());

  const table = screen.getByRole("table", { name: "Líneas del pedido" });
  await expect
    .element(table.getByText("Artículo del proveedor: MIEL-1K · Miel pura x 12 frascos"))
    .toBeVisible();
  expect(table.getByText(/^Artículo del proveedor:/).elements()).toHaveLength(1);
});

test("shows only the description when the supplier's item has no code", async () => {
  const [first, second] = DRAFT_ORDER.lines;
  if (!first || !second) {
    throw new Error("fixture needs two lines");
  }
  const screen = await loaded(
    sentServices({
      fetchPurchaseOrder: vi.fn().mockResolvedValue({
        kind: "ok",
        value: {
          kind: "found",
          order: {
            ...SENT_ORDER,
            lines: [
              { ...first, supplierItem: { code: null, description: "Miel x frasco" } },
              second,
            ],
          },
        },
      }),
    }),
  );

  await expect.element(screen.getByText("Artículo del proveedor: Miel x frasco")).toBeVisible();
});

test("has no accessibility violations as a sent order and with the sharing open", async () => {
  const screen = await loaded(sentServices());

  await expectNoAccessibilityViolations(screen.container);
  await userEvent.click(screen.getByRole("button", { name: "Compartir pedido" }));
  await expect
    .element(screen.getByRole("dialog").getByText("Pedido a Distribuidora Andina"))
    .toBeVisible();
  await expectNoAccessibilityViolations(document.body);
});
