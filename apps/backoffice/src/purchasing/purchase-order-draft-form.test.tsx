import type { PurchaseOrderDetail } from "@purosur/contracts";
import { FieldSizeProvider } from "@purosur/ui";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { OUTDATED_TAB_ADVICE, openAsOutdatedTab } from "../platform/test-support/release-monitor";
import { render } from "../shell/test-support/render-with-router";
import { PurchaseOrderDraftForm } from "./purchase-order-draft-form";
import type { PurchaseOrderPanelServices } from "./purchase-order-panel-services";
import { DRAFT_ORDER, ORDER_ID } from "./test-support/purchase-orders";
import {
  AVENA_PRODUCT_ID,
  MIEL_PRODUCT_ID,
  purchasableProducts,
} from "./test-support/purchase-products";

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

type EditPurchaseOrderLines = PurchaseOrderPanelServices["editPurchaseOrderLines"];

function renderForm({
  order = DRAFT_ORDER,
  editPurchaseOrderLines = vi.fn<EditPurchaseOrderLines>(),
  onSaved = () => {},
  onNotEditable = () => {},
  onCancelOrder = () => {},
  onShareOrder = () => {},
  onSessionEnded = () => {},
}: {
  order?: PurchaseOrderDetail;
  editPurchaseOrderLines?: EditPurchaseOrderLines;
  onSaved?: () => void;
  onNotEditable?: () => void;
  onCancelOrder?: () => void;
  onShareOrder?: () => void;
  onSessionEnded?: () => void;
} = {}) {
  return render(
    <FieldSizeProvider size="backoffice">
      <main>
        <PurchaseOrderDraftForm
          order={order}
          products={purchasableProducts}
          productsStatus="loaded"
          services={{ editPurchaseOrderLines }}
          onSaved={onSaved}
          onNotEditable={onNotEditable}
          onCancelOrder={onCancelOrder}
          onShareOrder={onShareOrder}
          onSessionEnded={onSessionEnded}
        />
      </main>
    </FieldSizeProvider>,
  );
}

type Screen = Awaited<ReturnType<typeof renderForm>>;

function line(screen: Screen, number: number) {
  return screen.getByRole("group", { name: `Línea ${number}` });
}

async function save(screen: Screen) {
  await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
}

test("saving sends the lines as typed and reports the order saved", async () => {
  const editPurchaseOrderLines = vi
    .fn<EditPurchaseOrderLines>()
    .mockResolvedValue({ kind: "ok", order: DRAFT_ORDER });
  const onSaved = vi.fn();
  const screen = await renderForm({ editPurchaseOrderLines, onSaved });

  await userEvent.fill(
    line(screen, 1).getByRole("textbox", { name: /^Cantidad de paquetes/ }),
    "4",
  );
  await save(screen);

  expect(editPurchaseOrderLines).toHaveBeenCalledWith(ORDER_ID, {
    lines: [
      { productId: MIEL_PRODUCT_ID, packages: 4, quantityPerPackage: 12_000 },
      { productId: AVENA_PRODUCT_ID, packages: 2, quantityPerPackage: 25_000 },
    ],
  });
  await expect.poll(() => onSaved.mock.calls.length).toBe(1);
});

test("shows the lines the cloud saved once saving succeeds", async () => {
  const saved = {
    ...DRAFT_ORDER,
    lines: DRAFT_ORDER.lines.map((orderLine) => ({ ...orderLine, packages: 7 })),
  };
  const editPurchaseOrderLines = vi
    .fn<EditPurchaseOrderLines>()
    .mockResolvedValue({ kind: "ok", order: saved });
  const screen = await renderForm({ editPurchaseOrderLines });

  await save(screen);

  await expect
    .element(line(screen, 1).getByRole("textbox", { name: /^Cantidad de paquetes/ }))
    .toHaveValue("7");
});

test("reports an order that can no longer be edited, without a notice of its own", async () => {
  const editPurchaseOrderLines = vi
    .fn<EditPurchaseOrderLines>()
    .mockResolvedValue({ kind: "not_editable" });
  const onNotEditable = vi.fn();
  const screen = await renderForm({ editPurchaseOrderLines, onNotEditable });

  await save(screen);

  await expect.poll(() => onNotEditable.mock.calls.length).toBe(1);
  expect(screen.getByText("Este pedido ya no se puede editar").query()).toBeNull();
});

test.each([
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
  const editPurchaseOrderLines = vi.fn<EditPurchaseOrderLines>().mockResolvedValue(outcome);
  const screen = await renderForm({ editPurchaseOrderLines });

  await save(screen);

  await expect.element(screen.getByText(title)).toBeVisible();
  await expect.element(screen.getByText(description)).toBeVisible();
});

test("clears the notice once the lines change", async () => {
  const editPurchaseOrderLines = vi
    .fn<EditPurchaseOrderLines>()
    .mockResolvedValue({ kind: "failed" });
  const screen = await renderForm({ editPurchaseOrderLines });
  await save(screen);
  await expect.element(screen.getByText("No se guardó el pedido")).toBeVisible();

  await userEvent.fill(
    line(screen, 1).getByRole("textbox", { name: /^Cantidad de paquetes/ }),
    "5",
  );

  expect(screen.getByText("No se guardó el pedido").query()).toBeNull();
});

test("names the first line whose values cannot be read and sends nothing", async () => {
  const editPurchaseOrderLines = vi.fn<EditPurchaseOrderLines>();
  const screen = await renderForm({ editPurchaseOrderLines });

  await userEvent.fill(
    line(screen, 2).getByRole("textbox", { name: /^Cantidad de paquetes/ }),
    "0",
  );
  await save(screen);

  await expect
    .element(
      screen.getByText(
        "Línea 2: Ingresá cuántos paquetes pedir, en un número entero mayor a cero.",
      ),
    )
    .toBeVisible();
  expect(editPurchaseOrderLines).not.toHaveBeenCalled();
});

test("lands a refusal of the lines on the lines", async () => {
  const editPurchaseOrderLines = vi
    .fn<EditPurchaseOrderLines>()
    .mockResolvedValue({ kind: "validation_failed", field: "lines" });
  const screen = await renderForm({ editPurchaseOrderLines });

  await save(screen);

  await expect
    .element(screen.getByText("Revisá los paquetes y la cantidad por paquete de las líneas."))
    .toBeVisible();
});

test("ends the session when saving finds no open session", async () => {
  const editPurchaseOrderLines = vi
    .fn<EditPurchaseOrderLines>()
    .mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const screen = await renderForm({ editPurchaseOrderLines, onSessionEnded });

  await save(screen);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("opens the own account panel when saving comes back forbidden", async () => {
  const editPurchaseOrderLines = vi
    .fn<EditPurchaseOrderLines>()
    .mockResolvedValue({ kind: "forbidden" });
  const screen = await renderForm({ editPurchaseOrderLines });

  await save(screen);

  await expect
    .poll(() => window.location.pathname + window.location.search)
    .toBe("/?account=credentials");
});

test("asks the screen to cancel the order", async () => {
  const onCancelOrder = vi.fn();
  const screen = await renderForm({ onCancelOrder });

  await userEvent.click(screen.getByRole("button", { name: "Cancelar pedido" }));

  expect(onCancelOrder).toHaveBeenCalledTimes(1);
});

test("offers no cancellation when the cloud answers the order cannot be cancelled", async () => {
  const screen = await renderForm({ order: { ...DRAFT_ORDER, cancellable: false } });

  await expect.element(screen.getByRole("button", { name: "Guardar" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Cancelar pedido" }).query()).toBeNull();
});

test("asks the screen to share the order", async () => {
  const onShareOrder = vi.fn();
  const screen = await renderForm({ onShareOrder });

  await userEvent.click(screen.getByRole("button", { name: "Compartir pedido" }));

  expect(onShareOrder).toHaveBeenCalledTimes(1);
});

test("keeps sharing locked, saying why, while the lines hold unsaved changes", async () => {
  const onShareOrder = vi.fn();
  const screen = await renderForm({ onShareOrder });

  await userEvent.fill(
    line(screen, 1).getByRole("textbox", { name: /^Cantidad de paquetes/ }),
    "5",
  );
  const share = screen.getByRole("button", { name: "Compartir pedido" });
  await expect.element(share).toHaveAttribute("aria-disabled", "true");
  share.element().dispatchEvent(new MouseEvent("click", { bubbles: true }));
  (share.element() as HTMLElement).focus();

  await expect
    .element(screen.getByRole("tooltip"))
    .toHaveTextContent("Guardá los cambios antes de compartir el pedido.");
  expect(onShareOrder).not.toHaveBeenCalled();
});

test("offers no sharing when the cloud answers the order cannot be shared", async () => {
  const screen = await renderForm({ order: { ...DRAFT_ORDER, documentShareable: false } });

  await expect.element(screen.getByRole("button", { name: "Guardar" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Compartir pedido" }).query()).toBeNull();
});

test("tells an outdated tab to reload because the backoffice was updated when saving is refused", async () => {
  openAsOutdatedTab();
  const editPurchaseOrderLines = vi
    .fn<EditPurchaseOrderLines>()
    .mockResolvedValue({ kind: "failed" });
  const screen = await renderForm({ editPurchaseOrderLines });

  await save(screen);

  await expect.element(screen.getByText("No se guardó el pedido")).toBeVisible();
  await expect.element(screen.getByText(OUTDATED_TAB_ADVICE)).toBeVisible();
});
