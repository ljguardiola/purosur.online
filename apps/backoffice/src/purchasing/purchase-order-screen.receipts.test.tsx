import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { accessWith } from "../shell/test-support/backoffice-access";
import { createServices, loaded } from "./test-support/purchase-order-screen";
import {
  CANCELLED_ORDER,
  ORDER_ID,
  PARTIALLY_RECEIVED_ORDER,
  RECEIVED_ORDER,
  SENT_ORDER,
} from "./test-support/purchase-orders";

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

function servicesFor(order: typeof SENT_ORDER) {
  return createServices({
    fetchPurchaseOrder: vi.fn().mockResolvedValue({
      kind: "ok",
      value: { kind: "found", order },
    }),
  });
}

const RECEIVER = accessWith("purchase_order_reads", "purchase_order_receipts");
const MANAGER = accessWith("purchase_order_reads", "purchase_orders");

test("a sent order the cloud answers is receivable offers Recibir pedido, which opens the receipt", async () => {
  const onReceive = vi.fn();
  const screen = await loaded(servicesFor(SENT_ORDER), { access: RECEIVER, onReceive });

  await userEvent.click(screen.getByRole("button", { name: "Recibir pedido" }));

  expect(onReceive).toHaveBeenCalledTimes(1);
});

test("offers Recibir pedido while the order is partially received and the cloud says it is receivable", async () => {
  const screen = await loaded(servicesFor(PARTIALLY_RECEIVED_ORDER), { access: RECEIVER });

  await expect.element(screen.getByText("Recibido en parte")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Recibir pedido" })).toBeVisible();
});

test("decides whether to offer Recibir pedido from the cloud's answer, not from the state", async () => {
  const screen = await loaded(servicesFor({ ...SENT_ORDER, receivable: false }), {
    access: RECEIVER,
  });

  await expect.element(screen.getByRole("table", { name: "Líneas del pedido" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Recibir pedido" }).query()).toBeNull();
});

test("offers no Recibir pedido to whoever may only read purchase orders", async () => {
  const screen = await loaded(servicesFor(SENT_ORDER), {
    access: accessWith("purchase_order_reads"),
  });

  await expect.element(screen.getByRole("table", { name: "Líneas del pedido" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Recibir pedido" }).query()).toBeNull();
});

test("a received order reads Recibido and offers neither receiving nor cancelling", async () => {
  const screen = await loaded(servicesFor(RECEIVED_ORDER), { access: RECEIVER });

  await expect.element(screen.getByText("Recibido", { exact: true }).first()).toBeVisible();
  expect(screen.getByRole("button", { name: "Recibir pedido" }).query()).toBeNull();
  expect(screen.getByRole("button", { name: "Cancelar pedido" }).query()).toBeNull();
});

test("a partially received order still offers its cancellation when the cloud allows it", async () => {
  const screen = await loaded(servicesFor(PARTIALLY_RECEIVED_ORDER), { access: MANAGER });

  await expect.element(screen.getByRole("button", { name: "Cancelar pedido" })).toBeVisible();
});

test("cancelling a partially received order says what is missing can no longer be received", async () => {
  const services = servicesFor(PARTIALLY_RECEIVED_ORDER);
  vi.mocked(services.cancelPurchaseOrder).mockResolvedValue({ kind: "ok", order: CANCELLED_ORDER });
  const screen = await loaded(services, { access: MANAGER });
  vi.mocked(services.fetchPurchaseOrder).mockResolvedValue({
    kind: "ok",
    value: { kind: "found", order: { ...CANCELLED_ORDER, id: ORDER_ID } },
  });

  await userEvent.click(screen.getByRole("button", { name: "Cancelar pedido" }));
  await userEvent.click(
    screen.getByRole("dialog").getByRole("button", { name: "Cancelar pedido" }),
  );

  await expect.element(screen.getByText("Pedido cancelado").first()).toBeVisible();
  await expect.element(screen.getByText("Ya no se puede recibir lo que falta.")).toBeVisible();
  expect(screen.getByText("Ya no se puede compartir.").query()).toBeNull();
});

test("shows, beside each line of an order with receipts, what was received and what is still outstanding", async () => {
  const screen = await loaded(servicesFor(PARTIALLY_RECEIVED_ORDER), { access: RECEIVER });

  const table = screen.getByRole("table", { name: "Líneas del pedido" });
  await expect.element(table.getByRole("columnheader", { name: "Recibido" })).toBeVisible();
  await expect.element(table.getByRole("columnheader", { name: "Pendiente" })).toBeVisible();
  const miel = table.getByRole("row", { name: /Miel pura de abeja 1 kg/ });
  await expect.element(miel.getByRole("cell").nth(5)).toHaveTextContent("24 u");
  await expect.element(miel.getByRole("cell").nth(6)).toHaveTextContent("12 u");
  const avena = table.getByRole("row", { name: /Avena arrollada/ });
  await expect.element(avena.getByRole("cell").nth(5)).toHaveTextContent("40 kg");
  await expect.element(avena.getByRole("cell").nth(6)).toHaveTextContent("10 kg");
});

test("shows no received or outstanding columns and no receipts for an order nothing was received of", async () => {
  const screen = await loaded(servicesFor(SENT_ORDER), { access: RECEIVER });

  await expect.element(screen.getByRole("table", { name: "Líneas del pedido" })).toBeVisible();
  expect(screen.getByRole("columnheader", { name: "Recibido" }).query()).toBeNull();
  expect(screen.getByRole("columnheader", { name: "Pendiente" }).query()).toBeNull();
  expect(screen.getByRole("heading", { name: "Recepciones" }).query()).toBeNull();
});

test("links each receipt to the purchases for whoever records purchases", async () => {
  const onOpenPurchases = vi.fn();
  const screen = await loaded(servicesFor(PARTIALLY_RECEIVED_ORDER), {
    access: accessWith("purchase_order_reads", "purchases"),
    onOpenPurchases,
  });

  await userEvent.click(screen.getByRole("button", { name: "Ver compras" }));

  expect(onOpenPurchases).toHaveBeenCalledTimes(1);
});

test("offers no link to the purchases to whoever may not record them", async () => {
  const screen = await loaded(servicesFor(PARTIALLY_RECEIVED_ORDER), { access: RECEIVER });

  await expect.element(screen.getByRole("heading", { name: "Recepciones" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Ver compras" }).query()).toBeNull();
});

test("says the receipt was registered when the person comes back from it, and clears the mark when dismissed", async () => {
  const onNoticeDismissed = vi.fn();
  const screen = await loaded(servicesFor(PARTIALLY_RECEIVED_ORDER), {
    access: RECEIVER,
    received: true,
    onNoticeDismissed,
  });

  await expect.element(screen.getByText("Recepción registrada")).toBeVisible();
  await expect.element(screen.getByText("Se creó la compra con lo que llegó.")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: /Cerrar/ }));
  expect(onNoticeDismissed).toHaveBeenCalled();
});

test("has no accessibility violations with the lines received and the receipts listed", async () => {
  const screen = await loaded(servicesFor(PARTIALLY_RECEIVED_ORDER), {
    access: accessWith("purchase_order_reads", "purchase_order_receipts", "purchases"),
  });

  await expect.element(screen.getByRole("heading", { name: "Recepciones" })).toBeVisible();
  await expectNoAccessibilityViolations(screen.container);
});
