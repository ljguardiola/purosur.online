import { CalendarDate } from "@internationalized/date";
import { ANOTHER_FICTIONAL_CUIT, FICTIONAL_CUIT } from "@purosur/domain/fiscal/test-support";
import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { afterEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { NewPurchaseScreen } from "./new-purchase-screen";
import type { NewPurchaseScreenServices } from "./new-purchase-services";
import { bolsaDeAvena, cajaDeMiel } from "./test-support/packagings";
import { compraDeAvena, purchaseChoicesFrom } from "./test-support/purchases";
import { suppliersWithCuits } from "./test-support/suppliers";

const TODAY = new CalendarDate(2026, 9, 16);
const { andina, granos } = suppliersWithCuits(FICTIONAL_CUIT, ANOTHER_FICTIONAL_CUIT);
const purchaseChoices = purchaseChoicesFrom([andina, granos]);

afterEach(() => {
  window.history.pushState(null, "", "/");
});

function createServices(
  overrides: Partial<NewPurchaseScreenServices> = {},
): NewPurchaseScreenServices {
  return {
    fetchPurchaseChoices: vi.fn().mockResolvedValue({ kind: "ok", value: purchaseChoices }),
    registerPurchase: vi.fn(),
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

function renderScreen(services: NewPurchaseScreenServices, onSessionEnded: () => void = () => {}) {
  return render(
    <FieldSizeProvider size="backoffice">
      <main>
        <NewPurchaseScreen services={services} onSessionEnded={onSessionEnded} today={TODAY} />
      </main>
    </FieldSizeProvider>,
  );
}

type Screen = Awaited<ReturnType<typeof renderScreen>>;

async function opened(services: NewPurchaseScreenServices = createServices()) {
  const screen = await renderScreen(services);
  await expect.element(screen.getByRole("combobox", { name: /^Proveedor/ })).toBeVisible();
  return screen;
}

type Scope = Pick<Screen, "getByRole">;

// A locator click scrolls the option into view first, and the scroll event closes the list.
async function chooseFromComboBox(screen: Screen, scope: Scope, label: RegExp, name: string) {
  await userEvent.click(scope.getByRole("combobox", { name: label }));
  await expect.element(screen.getByRole("option", { name })).toBeVisible();
  (screen.getByRole("option", { name }).element() as HTMLElement).click();
}

async function chooseFromSelect(screen: Screen, scope: Scope, label: RegExp, name: string) {
  await userEvent.click(scope.getByRole("button", { name: label }));
  await userEvent.click(screen.getByRole("option", { name }));
}

function line(screen: Screen, number: number) {
  return screen.getByRole("group", { name: `Línea ${number}` });
}

async function fillHeader(screen: Screen) {
  await chooseFromComboBox(screen, screen, /^Proveedor/, "Granos del Valle");
  await chooseFromSelect(screen, screen, /Tipo de comprobante/, "Sin comprobante");
}

async function fillQuantityLine(screen: Screen, number = 1) {
  const group = line(screen, number);
  await chooseFromComboBox(screen, group, /^Producto/, "Avena arrollada");
  await userEvent.fill(group.getByRole("textbox", { name: /^Cantidad/ }), "12,5");
  await userEvent.fill(group.getByRole("textbox", { name: /^Costo por kg/ }), "2.000");
}

async function register(screen: Screen) {
  await userEvent.click(screen.getByRole("button", { name: "Registrar la compra" }));
}

const avenaLine = {
  loadedBy: "quantity",
  productId: bolsaDeAvena.productId,
  quantity: 12_500,
  costPaidCents: 200_000,
  lotNumber: null,
  expiresOn: null,
} as const;

test("shows the breadcrumb, the heading and the header fields, with today as the purchase date", async () => {
  const screen = await opened();

  await expect.element(screen.getByText("Stock").first()).toBeVisible();
  await expect
    .element(screen.getByRole("heading", { name: "Registrar compra", level: 1 }))
    .toBeVisible();
  await expect.element(screen.getByRole("button", { name: /Tipo de comprobante/ })).toBeVisible();
  await expect
    .element(screen.getByRole("textbox", { name: /^Número de comprobante/ }))
    .toBeVisible();
  await expect.element(screen.getByRole("textbox", { name: /^Nota/ })).toBeVisible();
  expect(
    screen
      .getByRole("group", { name: /^Fecha de compra/ })
      .getByRole("spinbutton")
      .all()
      .map((segment) => segment.element().textContent),
  ).toEqual(["16", "9", "2026"]);
  await expect.element(line(screen, 1)).toBeVisible();
});

test("says there is no supplier to choose, keeping the register action disabled", async () => {
  const services = createServices({
    fetchPurchaseChoices: vi
      .fn()
      .mockResolvedValue({ kind: "ok", value: { ...purchaseChoices, suppliers: [] } }),
  });
  const screen = await renderScreen(services);

  await expect.element(screen.getByText("No hay proveedores activos")).toBeVisible();
  expect(screen.getByRole("combobox", { name: /^Proveedor/ }).query()).toBeNull();
  await expect.element(screen.getByRole("button", { name: "Registrar la compra" })).toBeDisabled();
});

test("says there is no product to buy, keeping the register action disabled", async () => {
  const services = createServices({
    fetchPurchaseChoices: vi.fn().mockResolvedValue({
      kind: "ok",
      value: { ...purchaseChoices, products: [], packagings: [] },
    }),
  });
  const screen = await renderScreen(services);

  await expect.element(screen.getByText("No hay productos activos")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Registrar la compra" })).toBeDisabled();
});

test("says a product has no active packaging to load a line by", async () => {
  const screen = await opened();
  const group = line(screen, 1);
  await chooseFromComboBox(screen, group, /^Producto/, "Almendras peladas");

  await userEvent.click(group.getByText("Presentación", { exact: true }).last());

  await expect
    .element(group.getByText("Este producto no tiene presentaciones activas").first())
    .toBeVisible();
});

test("registers a purchase with a line loaded by quantity, then goes back to the list with a confirmation to show", async () => {
  window.history.pushState(null, "", "/purchases/new");
  const services = createServices();
  vi.mocked(services.registerPurchase).mockResolvedValue({ kind: "ok", purchase: compraDeAvena });
  const screen = await opened(services);

  await fillHeader(screen);
  await userEvent.fill(screen.getByRole("textbox", { name: /^Nota/ }), "Entrega de la tarde");
  await fillQuantityLine(screen);
  await register(screen);

  expect(services.registerPurchase).toHaveBeenCalledWith({
    supplierId: granos.id,
    purchasedOn: "2026-09-16",
    receiptType: "sin_comprobante",
    receiptNumber: null,
    note: "Entrega de la tarde",
    lines: [avenaLine],
  });
  await expect.poll(() => window.location.pathname).toBe("/purchases");
  expect(window.history.state).toMatchObject({ purchaseRegistered: true });
});

test("registers a purchase with a line loaded by packaging, the lot and its expiry", async () => {
  const services = createServices();
  vi.mocked(services.registerPurchase).mockResolvedValue({ kind: "ok", purchase: compraDeAvena });
  const screen = await opened(services);
  await chooseFromComboBox(screen, screen, /^Proveedor/, "Distribuidora Andina");
  await chooseFromSelect(screen, screen, /Tipo de comprobante/, "Factura B");
  await userEvent.fill(
    screen.getByRole("textbox", { name: /^Número de comprobante/ }),
    "0001-00001234",
  );
  const group = line(screen, 1);
  await chooseFromComboBox(screen, group, /^Producto/, "Miel pura de abeja 1 kg");

  await userEvent.click(group.getByText("Presentación", { exact: true }).last());
  await chooseFromSelect(screen, group, /Presentación/, "Caja x 12 (12 u)");
  await userEvent.fill(group.getByRole("textbox", { name: /^Cantidad de presentaciones/ }), "2");
  await userEvent.fill(group.getByRole("textbox", { name: /^Costo por presentación/ }), "7.200");
  await userEvent.fill(group.getByRole("textbox", { name: /^Lote/ }), "L-17");
  await userEvent.click(
    group
      .getByRole("group", { name: /^Vencimiento/ })
      .getByRole("spinbutton")
      .first(),
  );
  await userEvent.keyboard("31012027");
  await register(screen);

  expect(services.registerPurchase).toHaveBeenCalledWith({
    supplierId: andina.id,
    purchasedOn: "2026-09-16",
    receiptType: "factura_b",
    receiptNumber: "0001-00001234",
    note: null,
    lines: [
      {
        loadedBy: "packaging",
        productId: cajaDeMiel.productId,
        packagingId: cajaDeMiel.id,
        packages: 2,
        costPaidCents: 720_000,
        lotNumber: "L-17",
        expiresOn: "2027-01-31",
      },
    ],
  });
});

test("adds a line, and removes any line while another remains", async () => {
  const screen = await opened();
  await expect
    .element(line(screen, 1).getByRole("button", { name: "Quitar línea" }))
    .toBeDisabled();

  await userEvent.click(screen.getByRole("button", { name: "Agregar línea" }));
  await expect.element(line(screen, 2)).toBeVisible();
  await userEvent.click(line(screen, 1).getByRole("button", { name: "Quitar línea" }));

  expect(line(screen, 2).query()).toBeNull();
  await expect.element(line(screen, 1)).toBeVisible();
});

test("registers every line, in the order they were entered", async () => {
  const services = createServices();
  vi.mocked(services.registerPurchase).mockResolvedValue({ kind: "ok", purchase: compraDeAvena });
  const screen = await opened(services);
  await fillHeader(screen);
  await fillQuantityLine(screen);
  await userEvent.click(screen.getByRole("button", { name: "Agregar línea" }));

  await fillQuantityLine(screen, 2);
  await register(screen);

  expect(services.registerPurchase).toHaveBeenCalledWith(
    expect.objectContaining({ lines: [avenaLine, avenaLine] }),
  );
});

test("says what is missing, at its field, without asking the cloud", async () => {
  const services = createServices();
  const screen = await opened(services);

  await register(screen);

  await expect.element(screen.getByText("Elegí el proveedor.")).toBeVisible();
  await expect.element(screen.getByText("Elegí el tipo de comprobante.")).toBeVisible();
  await expect.element(screen.getByText("Línea 1: Elegí el producto.")).toBeVisible();
  expect(services.registerPurchase).not.toHaveBeenCalled();
});

test("asks for the receipt number of a receipt, and refuses one without a receipt", async () => {
  const screen = await opened();
  await chooseFromComboBox(screen, screen, /^Proveedor/, "Granos del Valle");
  await fillQuantityLine(screen);
  await chooseFromSelect(screen, screen, /Tipo de comprobante/, "Factura B");

  await register(screen);
  await expect.element(screen.getByText("Ingresá el número del comprobante.")).toBeVisible();

  await chooseFromSelect(screen, screen, /Tipo de comprobante/, "Sin comprobante");
  await userEvent.fill(screen.getByRole("textbox", { name: /^Número de comprobante/ }), "1");
  await expect
    .element(screen.getByText("Una compra sin comprobante no lleva número."))
    .toBeVisible();
});

test("shows the cloud's refusal of a purchase dated after today", async () => {
  const services = createServices();
  vi.mocked(services.registerPurchase).mockResolvedValue({
    kind: "validation_failed",
    field: "purchasedOn",
  });
  const screen = await opened(services);
  await fillHeader(screen);
  await fillQuantityLine(screen);

  await register(screen);

  await expect
    .element(screen.getByText("La fecha de compra no puede ser posterior a hoy."))
    .toBeVisible();
  expect(window.location.pathname).not.toBe("/purchases");
});

test.each([
  ["supplier_not_found", "Este proveedor ya no está disponible. Elegí otro."],
  ["supplier_inactive", "Este proveedor ya no está activo. Elegí otro."],
] as const)(
  "shows the cloud's %s refusal at the supplier and reads the suppliers again",
  async (kind, message) => {
    const services = createServices();
    vi.mocked(services.registerPurchase).mockResolvedValue({ kind });
    const screen = await opened(services);
    await fillHeader(screen);
    await fillQuantityLine(screen);

    await register(screen);

    await expect.element(screen.getByText(message)).toBeVisible();
    await expect.poll(() => vi.mocked(services.fetchPurchaseChoices).mock.calls.length).toBe(2);
  },
);

test.each([
  ["product_not_found", "Este producto ya no está disponible."],
  ["product_inactive", "Este producto ya no está activo."],
  ["packaging_not_found", "Esta presentación ya no está disponible."],
  ["packaging_inactive", "Esta presentación ya no está activa."],
  [
    "packaging_sale_unit_changed",
    "La presentación no coincide con la unidad de venta actual del producto.",
  ],
] as const)("shows the cloud's %s refusal at the line it names", async (reason, message) => {
  const services = createServices();
  vi.mocked(services.registerPurchase).mockResolvedValue({
    kind: "line_refused",
    reason,
    lineIndex: 1,
  });
  const screen = await opened(services);
  await fillHeader(screen);
  await fillQuantityLine(screen);
  await userEvent.click(screen.getByRole("button", { name: "Agregar línea" }));
  await fillQuantityLine(screen, 2);

  await register(screen);

  await expect.element(line(screen, 2).getByText(message).first()).toBeVisible();
  expect(line(screen, 1).getByText(message).query()).toBeNull();
});

test("shows how to type the quantity at the line the cloud refused it", async () => {
  const services = createServices();
  vi.mocked(services.registerPurchase).mockResolvedValue({
    kind: "validation_failed",
    field: "lines",
    lineIndex: 0,
  });
  const screen = await opened(services);
  await fillHeader(screen);
  await fillQuantityLine(screen);

  await register(screen);

  await expect
    .element(
      line(screen, 1)
        .getByText("Escribí los kilos con coma para los decimales, hasta 3, por ejemplo 12,150.")
        .first(),
    )
    .toBeVisible();
});

test("clears a line's refusal once the person changes that line", async () => {
  const services = createServices();
  vi.mocked(services.registerPurchase).mockResolvedValue({
    kind: "line_refused",
    reason: "product_inactive",
    lineIndex: 0,
  });
  const screen = await opened(services);
  await fillHeader(screen);
  await fillQuantityLine(screen);
  await register(screen);
  await expect.element(screen.getByText("Este producto ya no está activo.").first()).toBeVisible();

  await chooseFromComboBox(screen, line(screen, 1), /^Producto/, "Miel pura de abeja 1 kg");

  await expect.poll(() => screen.getByText("Este producto ya no está activo.").query()).toBeNull();
});

test("clears a line's refusal when the purchase is submitted again", async () => {
  const services = createServices();
  vi.mocked(services.registerPurchase)
    .mockResolvedValueOnce({ kind: "line_refused", reason: "product_inactive", lineIndex: 0 })
    .mockReturnValueOnce(new Promise(() => {}));
  const screen = await opened(services);
  await fillHeader(screen);
  await fillQuantityLine(screen);
  await register(screen);
  await expect.element(screen.getByText("Este producto ya no está activo.").first()).toBeVisible();

  await register(screen);

  await expect.poll(() => screen.getByText("Este producto ya no está activo.").query()).toBeNull();
});

test("shows a notice when the purchase could not be registered, and stays on the form", async () => {
  const services = createServices();
  vi.mocked(services.registerPurchase).mockResolvedValue({ kind: "failed" });
  const screen = await opened(services);
  await fillHeader(screen);
  await fillQuantityLine(screen);

  await register(screen);

  await expect.element(screen.getByText("No se registró la compra")).toBeVisible();
  await expect.element(screen.getByText("Volvé a intentarlo.")).toBeVisible();
});

test("shows the time to wait when the cloud rate-limits the registration", async () => {
  const services = createServices();
  vi.mocked(services.registerPurchase).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 120,
  });
  const screen = await opened(services);
  await fillHeader(screen);
  await fillQuantityLine(screen);

  await register(screen);

  await expect.element(screen.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(screen.getByText("Se puede volver a intentar en 2 minutos.")).toBeVisible();
});

test("sends the person to Mi cuenta when the registration is forbidden, and ends the session when it finds none", async () => {
  window.history.pushState(null, "", "/purchases/new");
  const services = createServices();
  vi.mocked(services.registerPurchase).mockResolvedValueOnce({ kind: "forbidden" });
  const onSessionEnded = vi.fn();
  const screen = await renderScreen(services, onSessionEnded);
  await expect.element(screen.getByRole("combobox", { name: /^Proveedor/ })).toBeVisible();
  await fillHeader(screen);
  await fillQuantityLine(screen);

  await register(screen);
  await expect.poll(() => window.location.pathname).toBe("/account");

  vi.mocked(services.registerPurchase).mockResolvedValueOnce({ kind: "unauthenticated" });
  await register(screen);
  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("cancel goes back to the list", async () => {
  window.history.pushState(null, "", "/purchases/new");
  const screen = await opened();

  await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));

  await expect.poll(() => window.location.pathname).toBe("/purchases");
});

test("keeps the register action disabled while the form data loads, and after it fails to load", async () => {
  const services = createServices();
  const firstLoad = deferred<Awaited<ReturnType<typeof services.fetchPurchaseChoices>>>();
  vi.mocked(services.fetchPurchaseChoices).mockReturnValueOnce(firstLoad.promise);
  const screen = await renderScreen(services);

  await expect.element(screen.getByRole("button", { name: "Registrar la compra" })).toBeDisabled();
  expect(screen.getByRole("combobox", { name: /^Proveedor/ }).query()).toBeNull();

  firstLoad.resolve({ kind: "failed" });
  await expect.element(screen.getByText("No pudimos abrir el formulario de compra")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Registrar la compra" })).toBeDisabled();
});

test("shows a load error with a retry action that loads the form again", async () => {
  const services = createServices();
  vi.mocked(services.fetchPurchaseChoices).mockResolvedValueOnce({ kind: "failed" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No pudimos abrir el formulario de compra")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByRole("combobox", { name: /^Proveedor/ })).toBeVisible();
});

test("shows the rate-limited notice when the form data is rate-limited", async () => {
  const services = createServices();
  vi.mocked(services.fetchPurchaseChoices).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 120,
  });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Demasiadas solicitudes")).toBeVisible();
});

test("navigates to Mi cuenta when the form data comes back forbidden, and ends the session when it finds none", async () => {
  window.history.pushState(null, "", "/purchases/new");
  const forbidden = createServices({
    fetchPurchaseChoices: vi.fn().mockResolvedValue({ kind: "forbidden" }),
  });
  await renderScreen(forbidden);
  await expect.poll(() => window.location.pathname).toBe("/account");

  const unauthenticated = createServices({
    fetchPurchaseChoices: vi.fn().mockResolvedValue({ kind: "unauthenticated" }),
  });
  const onSessionEnded = vi.fn();
  await renderScreen(unauthenticated, onSessionEnded);
  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("has no accessibility violations once loaded", async () => {
  const screen = await opened();

  await expectNoAccessibilityViolations(screen.container);
});
