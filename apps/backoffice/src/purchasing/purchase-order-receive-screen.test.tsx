import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { StubProductCreationModal } from "../platform/test-support/creation-parts";
import { OUTDATED_TAB_ADVICE, openAsOutdatedTab } from "../platform/test-support/release-monitor";
import { ADMINISTRATOR_ACCESS } from "../shell/test-support/backoffice-access";
import { render } from "../shell/test-support/render-with-router";
import { PurchaseOrderReceiveScreen } from "./purchase-order-receive-screen";
import type { PurchaseOrderReceiveScreenServices } from "./purchase-order-receive-services";
import { ORDER_ID, RECEIPT_DRAFT, RECEIPT_PURCHASE_ID } from "./test-support/purchase-orders";
import { AVENA_PRODUCT_ID, MIEL_PRODUCT_ID } from "./test-support/purchase-products";
import { purchaseChoicesFrom } from "./test-support/purchases";

beforeEach(() => {
  window.history.pushState(null, "", `/purchase-orders/${ORDER_ID}/receive`);
});

function createServices(
  overrides: Partial<PurchaseOrderReceiveScreenServices> = {},
): PurchaseOrderReceiveScreenServices {
  return {
    fetchPurchaseOrderReceiptDraft: vi
      .fn()
      .mockResolvedValue({ kind: "ok", value: { kind: "found", draft: RECEIPT_DRAFT } }),
    fetchPurchaseChoices: vi.fn().mockResolvedValue({ kind: "ok", value: purchaseChoicesFrom([]) }),
    receivePurchaseOrder: vi.fn(),
    ...overrides,
  };
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function renderScreen(
  services: PurchaseOrderReceiveScreenServices,
  onSessionEnded: () => void = () => {},
) {
  return render(
    <FieldSizeProvider size="backoffice">
      <main>
        <PurchaseOrderReceiveScreen
          orderId={ORDER_ID}
          access={ADMINISTRATOR_ACCESS}
          productCreationModal={StubProductCreationModal}
          services={services}
          onSessionEnded={onSessionEnded}
        />
      </main>
    </FieldSizeProvider>,
  );
}

type Screen = Awaited<ReturnType<typeof renderScreen>>;

async function opened(services = createServices()) {
  const screen = await renderScreen(services);
  await expect
    .element(
      screen.getByRole("heading", { name: "Recibir pedido a Distribuidora Andina", level: 1 }),
    )
    .toBeVisible();
  await expect.element(line(screen, 1)).toBeVisible();
  return screen;
}

function line(screen: Screen, number: number) {
  return screen.getByRole("group", { name: `Línea ${number}` });
}

async function chooseReceiptType(screen: Screen, name: string) {
  await userEvent.click(screen.getByRole("button", { name: /Tipo de comprobante/ }));
  await userEvent.click(screen.getByRole("option", { name }));
}

async function completeReceipt(screen: Screen) {
  await chooseReceiptType(screen, "Sin comprobante");
  await userEvent.fill(line(screen, 2).getByRole("textbox", { name: /^Costo por kg/ }), "2.000");
}

async function register(screen: Screen) {
  await userEvent.click(screen.getByRole("button", { name: "Registrar la recepción" }));
}

test("prefills one line per line of the draft, loaded the way the draft loads it, with the list cost as the cost", async () => {
  const screen = await opened();

  const miel = line(screen, 1);
  await expect
    .element(miel.getByRole("combobox", { name: /^Producto/ }))
    .toHaveValue("Miel pura de abeja 1 kg");
  await expect
    .element(miel.getByRole("textbox", { name: /^Cantidad de paquetes/ }))
    .toHaveValue("3");
  await expect
    .element(miel.getByRole("textbox", { name: /^Cantidad por paquete/ }))
    .toHaveValue("12");
  await expect
    .element(miel.getByRole("textbox", { name: /^Costo por paquete/ }))
    .toHaveValue("1.850,00");
  const avena = line(screen, 2);
  await expect.element(avena.getByRole("textbox", { name: /^Cantidad/ })).toHaveValue("12,500");
  await expect.element(avena.getByRole("textbox", { name: /^Costo por kg/ })).toHaveValue("");
  expect(line(screen, 3).query()).toBeNull();
});

test("shows the order's supplier, which cannot be chosen, and dates the receipt today", async () => {
  const screen = await opened();

  await expect.element(screen.getByText("Distribuidora Andina").last()).toBeVisible();
  expect(screen.getByRole("combobox", { name: /^Proveedor/ }).query()).toBeNull();
  const date = screen
    .getByRole("group", { name: /^Fecha de compra/ })
    .getByRole("spinbutton")
    .all()
    .map((segment) => segment.element().textContent);
  expect(date).toEqual(["16", "9", "2026"]);
});

test("registers the receipt as a purchase without a supplier, as corrected, then goes back to the order with a confirmation to show", async () => {
  const services = createServices();
  vi.mocked(services.receivePurchaseOrder).mockResolvedValue({
    kind: "ok",
    receipt: { purchaseId: RECEIPT_PURCHASE_ID, state: "PARTIALLY_RECEIVED" },
  });
  const screen = await opened(services);
  await userEvent.fill(
    line(screen, 1).getByRole("textbox", { name: /^Cantidad de paquetes/ }),
    "2",
  );
  await completeReceipt(screen);

  await register(screen);

  expect(services.receivePurchaseOrder).toHaveBeenCalledWith(ORDER_ID, {
    purchasedOn: "2026-09-16",
    receiptType: "sin_comprobante",
    receiptNumber: null,
    note: null,
    lines: [
      {
        loadedBy: "packages",
        productId: MIEL_PRODUCT_ID,
        packages: 2,
        quantityPerPackage: 12_000,
        costPaidCents: 185_000,
        expiresOn: null,
      },
      {
        loadedBy: "quantity",
        productId: AVENA_PRODUCT_ID,
        quantity: 12_500,
        costPaidCents: 200_000,
        expiresOn: null,
      },
    ],
  });
  await expect
    .poll(() => window.location.pathname + window.location.search)
    .toBe(`/purchase-orders?order=${ORDER_ID}`);
  expect(window.history.state).toMatchObject({ purchaseOrderReceived: true });
});

test("removes a line and adds another like on any purchase", async () => {
  const services = createServices();
  vi.mocked(services.receivePurchaseOrder).mockResolvedValue({ kind: "failed" });
  const screen = await opened(services);

  await userEvent.click(line(screen, 1).getByRole("button", { name: "Quitar línea" }));
  expect(line(screen, 2).query()).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Agregar línea" }));
  await expect.element(line(screen, 2)).toBeVisible();
});

test("asks for what is missing without asking the cloud", async () => {
  const services = createServices();
  const screen = await opened(services);

  await register(screen);

  await expect.element(screen.getByText("Elegí el tipo de comprobante.")).toBeVisible();
  expect(services.receivePurchaseOrder).not.toHaveBeenCalled();
});

test.each([
  [{ kind: "not_found" }, "Este pedido ya no existe", "Volvé a los pedidos para ver los actuales."],
  [
    { kind: "not_receivable" },
    "Este pedido ya no se puede recibir",
    "Volvé al pedido para ver su estado actual.",
  ],
  [
    { kind: "nothing_ordered_received" },
    "Ningún producto cargado estaba en el pedido",
    "Cargá al menos un producto que se haya pedido.",
  ],
  [
    { kind: "supplier_not_found" },
    "El proveedor del pedido ya no está disponible",
    "No se puede registrar la recepción.",
  ],
  [
    { kind: "supplier_inactive" },
    "El proveedor del pedido ya no está activo",
    "Reactivalo en Proveedores para registrar la recepción.",
  ],
] as const)(
  "explains the refusal %j and stays on the form",
  async (outcome, title, description) => {
    const services = createServices();
    vi.mocked(services.receivePurchaseOrder).mockResolvedValue(outcome);
    const screen = await opened(services);
    await completeReceipt(screen);

    await register(screen);

    await expect.element(screen.getByText(title)).toBeVisible();
    await expect.element(screen.getByText(description)).toBeVisible();
    expect(window.location.pathname).toBe(`/purchase-orders/${ORDER_ID}/receive`);
  },
);

test("reads the order's receipt draft again after a refusal that says the order changed", async () => {
  const services = createServices();
  vi.mocked(services.receivePurchaseOrder).mockResolvedValue({ kind: "not_receivable" });
  const screen = await opened(services);
  await completeReceipt(screen);

  await register(screen);

  await expect
    .element(screen.getByText("Este pedido ya no se puede recibir").first())
    .toBeVisible();
  await expect
    .poll(() => vi.mocked(services.fetchPurchaseOrderReceiptDraft).mock.calls.length)
    .toBeGreaterThan(1);
});

test("shows the refusal of a product at its line", async () => {
  const services = createServices();
  vi.mocked(services.receivePurchaseOrder).mockResolvedValue({
    kind: "line_refused",
    reason: "product_inactive",
    lineIndex: 1,
  });
  const screen = await opened(services);
  await completeReceipt(screen);

  await register(screen);

  await expect
    .element(line(screen, 2).getByText("Este producto ya no está activo.").first())
    .toBeVisible();
});

test("shows a notice when the receipt could not be registered, and stays on the form", async () => {
  const services = createServices();
  vi.mocked(services.receivePurchaseOrder).mockResolvedValue({ kind: "failed" });
  const screen = await opened(services);
  await completeReceipt(screen);

  await register(screen);

  await expect.element(screen.getByText("No se registró la recepción")).toBeVisible();
  await expect.element(screen.getByText("Volvé a intentarlo.")).toBeVisible();
});

test("shows the time to wait when the cloud rate-limits the receipt", async () => {
  const services = createServices();
  vi.mocked(services.receivePurchaseOrder).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 120,
  });
  const screen = await opened(services);
  await completeReceipt(screen);

  await register(screen);

  await expect.element(screen.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(screen.getByText("Se puede volver a intentar en 2 minutos.")).toBeVisible();
});

test("opens the own account panel when the receipt is forbidden, and ends the session when it finds none", async () => {
  const services = createServices();
  vi.mocked(services.receivePurchaseOrder).mockResolvedValueOnce({ kind: "forbidden" });
  const onSessionEnded = vi.fn();
  const screen = await renderScreen(services, onSessionEnded);
  await expect.element(line(screen, 1)).toBeVisible();
  await completeReceipt(screen);

  await register(screen);
  await expect
    .poll(() => window.location.pathname + window.location.search)
    .toBe("/?account=credentials");

  vi.mocked(services.receivePurchaseOrder).mockResolvedValueOnce({ kind: "unauthenticated" });
  await register(screen);
  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("tells an outdated tab to reload because the backoffice was updated when the receipt is refused", async () => {
  openAsOutdatedTab();
  const services = createServices();
  vi.mocked(services.receivePurchaseOrder).mockResolvedValue({ kind: "failed" });
  const screen = await opened(services);
  await completeReceipt(screen);

  await register(screen);

  await expect.element(screen.getByText(OUTDATED_TAB_ADVICE)).toBeVisible();
});

test("cancel goes back to the order", async () => {
  const screen = await opened();

  await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));

  await expect
    .poll(() => window.location.pathname + window.location.search)
    .toBe(`/purchase-orders?order=${ORDER_ID}`);
  expect(window.history.state).not.toMatchObject({ purchaseOrderReceived: true });
});

test("shows a placeholder while the draft loads, with no way to register and a way back", async () => {
  const pending =
    deferred<
      Awaited<ReturnType<PurchaseOrderReceiveScreenServices["fetchPurchaseOrderReceiptDraft"]>>
    >();
  const services = createServices({
    fetchPurchaseOrderReceiptDraft: vi.fn().mockReturnValue(pending.promise),
  });
  const screen = await renderScreen(services);

  await expect
    .element(screen.getByRole("heading", { name: "Recibir pedido", level: 1 }))
    .toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Volver al pedido" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Registrar la recepción" }).query()).toBeNull();
});

test("the way back from a draft that is not ready goes to the order", async () => {
  const services = createServices({
    fetchPurchaseOrderReceiptDraft: vi.fn().mockReturnValue(new Promise(() => {})),
  });
  const screen = await renderScreen(services);

  await userEvent.click(screen.getByRole("button", { name: "Volver al pedido" }));

  await expect
    .poll(() => window.location.pathname + window.location.search)
    .toBe(`/purchase-orders?order=${ORDER_ID}`);
});

test("shows a load error with a retry action that reads the draft again", async () => {
  const services = createServices();
  vi.mocked(services.fetchPurchaseOrderReceiptDraft).mockResolvedValueOnce({ kind: "failed" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No pudimos abrir la recepción")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(line(screen, 1)).toBeVisible();
});

test("says the order no longer exists when the cloud has none", async () => {
  const services = createServices({
    fetchPurchaseOrderReceiptDraft: vi
      .fn()
      .mockResolvedValue({ kind: "ok", value: { kind: "not_found" } }),
  });
  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Este pedido ya no existe")).toBeVisible();
  expect(screen.getByRole("button", { name: "Registrar la recepción" }).query()).toBeNull();
});

test("says the order can no longer be received when the cloud answers so", async () => {
  const services = createServices({
    fetchPurchaseOrderReceiptDraft: vi
      .fn()
      .mockResolvedValue({ kind: "ok", value: { kind: "not_receivable" } }),
  });
  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Este pedido ya no se puede recibir")).toBeVisible();
  expect(screen.getByRole("button", { name: "Registrar la recepción" }).query()).toBeNull();
});

test("keeps the register action disabled while the purchase choices load, and after they fail to load", async () => {
  const services = createServices();
  const choices = deferred<Awaited<ReturnType<typeof services.fetchPurchaseChoices>>>();
  vi.mocked(services.fetchPurchaseChoices).mockReturnValueOnce(choices.promise);
  const screen = await renderScreen(services);

  await expect
    .element(screen.getByRole("button", { name: "Registrar la recepción" }))
    .toBeDisabled();

  choices.resolve({ kind: "failed" });
  await expect
    .element(screen.getByText("No pudimos abrir el formulario de recepción"))
    .toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "Registrar la recepción" }))
    .toBeDisabled();
});

test("opens the own account panel when the draft comes back forbidden, and ends the session when it finds none", async () => {
  await renderScreen(
    createServices({
      fetchPurchaseOrderReceiptDraft: vi.fn().mockResolvedValue({ kind: "forbidden" }),
    }),
  );
  await expect
    .poll(() => window.location.pathname + window.location.search)
    .toBe("/?account=credentials");

  const onSessionEnded = vi.fn();
  await renderScreen(
    createServices({
      fetchPurchaseOrderReceiptDraft: vi.fn().mockResolvedValue({ kind: "unauthenticated" }),
    }),
    onSessionEnded,
  );
  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("has no accessibility violations once loaded", async () => {
  const screen = await opened();

  await expectNoAccessibilityViolations(screen.container);
});
