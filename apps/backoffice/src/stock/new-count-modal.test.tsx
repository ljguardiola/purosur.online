import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { radioLabel } from "../platform/test-support/radio-label";
import { render } from "../shell/test-support/render-with-router";
import { countMomentNow } from "./count-moment";
import { NewCountModal } from "./new-count-modal";
import type { StockCountsScreenServices } from "./stock-counts-services";
import {
  almonds,
  almondsExpectedByLot,
  expectedBalance,
  honey,
  oats,
  tea,
  withoutBalance,
} from "./test-support/stock-fixtures";

beforeEach(async () => {
  await page.viewport(1280, 900);
});

function createServices(): StockCountsScreenServices {
  return {
    fetchStockCounts: vi.fn(),
    fetchStockProducts: vi.fn().mockResolvedValue({
      kind: "ok",
      value: { products: [almonds, honey, tea].map(withoutBalance) },
    }),
    fetchExpectedBalance: vi.fn().mockResolvedValue({
      kind: "ok",
      value: expectedBalance(tea, 17_000),
    }),
    registerCount: vi.fn(),
  };
}

type Handlers = {
  showsBalance?: boolean;
  onClose?: () => void;
  onSessionEnded?: () => void;
  onRegistered?: () => void;
};

async function renderModalWithoutWaiting(
  services: StockCountsScreenServices,
  {
    showsBalance = true,
    onClose = () => {},
    onSessionEnded = () => {},
    onRegistered = () => {},
  }: Handlers = {},
) {
  const screen = await render(
    <FieldSizeProvider size="backoffice">
      <NewCountModal
        startMoment={countMomentNow(new Date("2026-09-15T21:40:30.000Z"))}
        showsBalance={showsBalance}
        services={services}
        onClose={onClose}
        onSessionEnded={onSessionEnded}
        onRegistered={onRegistered}
      />
    </FieldSizeProvider>,
  );
  const dialog = screen.getByRole("dialog", { name: "Nuevo recuento" });
  return { screen, dialog };
}

async function renderModal(services: StockCountsScreenServices, handlers: Handlers = {}) {
  const rendered = await renderModalWithoutWaiting(services, handlers);
  await expect.element(rendered.dialog.getByRole("button", { name: /Producto/ })).toBeVisible();
  return rendered;
}

type Rendered = Awaited<ReturnType<typeof renderModal>>;

async function chooseProduct({ screen, dialog }: Rendered, name: string) {
  await userEvent.click(dialog.getByRole("button", { name: /Producto/ }));
  await userEvent.click(screen.getByRole("option", { name }));
}

async function count(rendered: Rendered, product: string, counted: string) {
  await chooseProduct(rendered, product);
  await userEvent.fill(
    rendered.dialog.getByRole("textbox", { name: /^Cantidad contada/ }),
    counted,
  );
}

const REGISTER = "Registrar el recuento";

test("offers a deactivated product in the selector marked as deactivated", async () => {
  const services = createServices();
  vi.mocked(services.fetchStockProducts).mockResolvedValue({
    kind: "ok",
    value: { products: [almonds, oats, honey].map(withoutBalance) },
  });
  const { screen, dialog } = await renderModal(services);

  await userEvent.click(dialog.getByRole("button", { name: /Producto/ }));

  await expect
    .element(screen.getByRole("option", { name: /Avena arrollada/ }).getByText("Desactivado"))
    .toBeVisible();
});

test("keeps the modal open and says the product no longer exists when the cloud cannot find it", async () => {
  const services = createServices();
  vi.mocked(services.fetchExpectedBalance).mockResolvedValue({
    kind: "ok",
    value: expectedBalance(almonds, 12_400),
  });
  vi.mocked(services.registerCount).mockResolvedValue({ kind: "not_found" });
  const { screen, dialog } = await renderModal(services);
  await userEvent.click(dialog.getByRole("button", { name: /Producto/ }));
  await userEvent.click(screen.getByRole("option", { name: "Almendras peladas" }));
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Cantidad contada/ }), "12,150");

  await userEvent.click(dialog.getByRole("button", { name: "Registrar el recuento" }));

  await expect.element(dialog.getByRole("alert")).toHaveTextContent("Este producto ya no existe");
  await expect.poll(() => vi.mocked(services.fetchStockProducts).mock.calls.length).toBe(2);
});

test("shows the balance the chosen product expects and the difference", async () => {
  const services = createServices();
  const rendered = await renderModal(services);
  const { screen, dialog } = rendered;

  await count(rendered, "Té verde en hebras 100 g", "16");

  await expect.element(dialog.getByText("Saldo esperado")).toBeVisible();
  await expect.element(dialog.getByText("17 u")).toBeVisible();
  await expect.element(dialog.getByText("− 1 u")).toBeVisible();
  expect(services.fetchExpectedBalance).toHaveBeenCalledWith(tea.id, "2026-09-15T21:40:30.000Z");
  await expectNoAccessibilityViolations(screen.container);
});

test("says there is no difference when the count equals the expected balance", async () => {
  const rendered = await renderModal(createServices());

  await count(rendered, "Té verde en hebras 100 g", "17");

  await expect.element(rendered.dialog.getByText("Sin diferencia")).toBeVisible();
});

test("says the expected balance could not be opened when the cloud fails to give it", async () => {
  const services = createServices();
  vi.mocked(services.fetchExpectedBalance).mockResolvedValue({ kind: "failed" });
  const rendered = await renderModal(services);

  await count(rendered, "Té verde en hebras 100 g", "16");

  await expect
    .element(rendered.dialog.getByText("No pudimos abrir el saldo esperado"))
    .toBeVisible();
});

test("registers the count at the moment chosen", async () => {
  const services = createServices();
  const result = { expected: 17_000, delta: -1000, balance: 16_000, superseded: false };
  vi.mocked(services.registerCount).mockResolvedValue({ kind: "ok", value: result });
  const onRegistered = vi.fn();
  const rendered = await renderModal(services, { onRegistered });
  const { dialog } = rendered;
  await chooseProduct(rendered, "Té verde en hebras 100 g");
  await userEvent.fill(dialog.getByRole("textbox", { name: "Hora" }), "18:32");
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Cantidad contada/ }), "16");

  await userEvent.click(dialog.getByRole("button", { name: REGISTER }));

  await expect.poll(() => onRegistered.mock.calls.length).toBe(1);
  expect(services.registerCount).toHaveBeenCalledWith({
    productId: tea.id,
    counted: 16_000,
    occurredAt: "2026-09-15T18:32:00-03:00",
  });
  expect(onRegistered).toHaveBeenCalledWith(withoutBalance(tea), result);
});

test("registers a count left at its default moment at the exact instant the modal opened", async () => {
  const services = createServices();
  vi.mocked(services.registerCount).mockResolvedValue({
    kind: "ok",
    value: { expected: 17_000, delta: -1000, balance: 16_000, superseded: false },
  });
  const rendered = await renderModal(services);
  await count(rendered, "Té verde en hebras 100 g", "16");

  await userEvent.click(rendered.dialog.getByRole("button", { name: REGISTER }));

  await expect
    .poll(() => vi.mocked(services.registerCount).mock.calls[0]?.[0])
    .toEqual({
      productId: tea.id,
      counted: 16_000,
      occurredAt: "2026-09-15T21:40:30.000Z",
    });
});

test("asks for the product and the quantity before registering anything", async () => {
  const services = createServices();
  const { dialog } = await renderModal(services);

  await userEvent.click(dialog.getByRole("button", { name: REGISTER }));

  await expect.element(dialog.getByText("Elegí el producto.")).toBeVisible();
  await expect.element(dialog.getByText("Ingresá la cantidad contada.")).toBeVisible();
  expect(services.registerCount).not.toHaveBeenCalled();
});

test("asks for the day of the count when it is cleared, registering nothing", async () => {
  const services = createServices();
  const rendered = await renderModal(services);
  await count(rendered, "Almendras peladas", "12,150");
  const day = rendered.dialog.getByRole("group", { name: /^Día del recuento/ });
  for (const segment of day.getByRole("spinbutton").all()) {
    await userEvent.click(segment);
    await userEvent.keyboard("{Backspace}{Backspace}{Backspace}{Backspace}");
  }

  await userEvent.click(rendered.dialog.getByRole("button", { name: REGISTER }));

  await expect.element(rendered.dialog.getByText("Elegí el día del recuento.")).toBeVisible();
  expect(services.registerCount).not.toHaveBeenCalled();
});

test("asks for whole units of a product sold by the unit", async () => {
  const services = createServices();
  const rendered = await renderModal(services);
  await count(rendered, "Miel pura de abeja 1 kg", "1,5");

  await userEvent.click(rendered.dialog.getByRole("button", { name: REGISTER }));

  await expect
    .element(rendered.dialog.getByText("Escribí una cantidad entera de unidades, por ejemplo 16."))
    .toBeVisible();
  expect(services.registerCount).not.toHaveBeenCalled();
});

test("asks for a time written the way it expects", async () => {
  const services = createServices();
  const rendered = await renderModal(services);
  await count(rendered, "Almendras peladas", "12,150");
  await userEvent.fill(rendered.dialog.getByRole("textbox", { name: "Hora" }), "6 y media");

  await userEvent.click(rendered.dialog.getByRole("button", { name: REGISTER }));

  await expect.element(rendered.dialog.getByText("Escribí la hora como 18:32.")).toBeVisible();
  expect(services.registerCount).not.toHaveBeenCalled();
});

test.each([
  [{ kind: "occurred_in_the_future" }, "El recuento no puede ser posterior a ahora."],
  [
    { kind: "count_at_same_moment" },
    "Ya hay un recuento de este producto a esa hora. Elegí otra hora.",
  ],
  [
    { kind: "validation_failed", field: "counted" },
    "Escribí los kilos con coma para los decimales, hasta 3, por ejemplo 12,150.",
  ],
  [{ kind: "validation_failed", field: "notes" }, "No se pudo guardar el recuento"],
  [{ kind: "failed" }, "No se pudo guardar el recuento"],
  [{ kind: "rate_limited", retryAfterSeconds: 30 }, "Demasiadas solicitudes"],
  [{ kind: "rate_limited", retryAfterSeconds: 30 }, "Se puede volver a intentar en 1 minuto."],
] as const)("keeps the modal open and explains the refusal %j", async (outcome, message) => {
  const services = createServices();
  vi.mocked(services.registerCount).mockResolvedValue(outcome);
  const onRegistered = vi.fn();
  const rendered = await renderModal(services, { onRegistered });
  await count(rendered, "Almendras peladas", "12,150");

  await userEvent.click(rendered.dialog.getByRole("button", { name: REGISTER }));

  await expect.element(rendered.dialog.getByText(message)).toBeVisible();
  expect(onRegistered).not.toHaveBeenCalled();
});

test("keeps the modal open and says the count could not be saved when the request fails", async () => {
  const services = createServices();
  vi.mocked(services.registerCount).mockRejectedValue(new Error("network down"));
  const onRegistered = vi.fn();
  const rendered = await renderModal(services, { onRegistered });
  await count(rendered, "Almendras peladas", "12,150");

  await userEvent.click(rendered.dialog.getByRole("button", { name: REGISTER }));

  await expect.element(rendered.dialog.getByText("No se pudo guardar el recuento")).toBeVisible();
  expect(onRegistered).not.toHaveBeenCalled();
});

test("ends the session when registering finds it over", async () => {
  const services = createServices();
  vi.mocked(services.registerCount).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const rendered = await renderModal(services, { onSessionEnded });
  await count(rendered, "Almendras peladas", "1");

  await userEvent.click(rendered.dialog.getByRole("button", { name: REGISTER }));

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("navigates to Mi cuenta when registering comes back forbidden", async () => {
  window.history.pushState(null, "", "/stock/counts");
  try {
    const services = createServices();
    vi.mocked(services.registerCount).mockResolvedValue({ kind: "forbidden" });
    const rendered = await renderModal(services);
    await count(rendered, "Almendras peladas", "1");

    await userEvent.click(rendered.dialog.getByRole("button", { name: REGISTER }));

    await expect.poll(() => window.location.pathname).toBe("/account");
  } finally {
    window.history.pushState(null, "", "/");
  }
});

test("shows no expected balance and asks for none when the user may not view balances", async () => {
  const services = createServices();
  const rendered = await renderModal(services, { showsBalance: false });

  await count(rendered, "Té verde en hebras 100 g", "16");

  expect(rendered.dialog.getByText("Saldo esperado").query()).toBeNull();
  expect(services.fetchExpectedBalance).not.toHaveBeenCalled();
});

test("shows a failed load of the products with a retry that loads the form again", async () => {
  const services = createServices();
  vi.mocked(services.fetchStockProducts)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockResolvedValueOnce({ kind: "ok", value: { products: [withoutBalance(almonds)] } });
  const { dialog } = await renderModalWithoutWaiting(services);

  await expect.element(dialog.getByText("No pudimos abrir los productos")).toBeVisible();
  await userEvent.click(dialog.getByRole("button", { name: "Reintentar" }));

  await expect.element(dialog.getByRole("button", { name: /Producto/ })).toBeVisible();
});

test("says there are no active products when the cloud lists none", async () => {
  const services = createServices();
  vi.mocked(services.fetchStockProducts).mockResolvedValue({
    kind: "ok",
    value: { products: [] },
  });
  const { dialog } = await renderModalWithoutWaiting(services);

  await expect.element(dialog.getByText("No hay productos activos")).toBeVisible();
});

test("disables registering and shows no selector while the products load", async () => {
  const services = createServices();
  vi.mocked(services.fetchStockProducts).mockReturnValue(new Promise(() => {}));
  const { dialog } = await renderModalWithoutWaiting(services);

  await expect.element(dialog.getByRole("button", { name: REGISTER })).toBeDisabled();
  expect(dialog.getByRole("button", { name: /Producto/ }).query()).toBeNull();
});

test("closes on Cancelar without registering anything", async () => {
  const services = createServices();
  const onClose = vi.fn();
  const { dialog } = await renderModal(services, { onClose });

  await userEvent.click(dialog.getByRole("button", { name: "Cancelar" }));

  expect(onClose).toHaveBeenCalledTimes(1);
  expect(services.registerCount).not.toHaveBeenCalled();
});

test("disables registering and cancelling while the request is in flight", async () => {
  const services = createServices();
  let finish: (outcome: Awaited<ReturnType<typeof services.registerCount>>) => void = () => {};
  vi.mocked(services.registerCount).mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const rendered = await renderModal(services);
  await count(rendered, "Almendras peladas", "12,150");

  await userEvent.click(rendered.dialog.getByRole("button", { name: REGISTER }));

  await expect.element(rendered.dialog.getByRole("button", { name: REGISTER })).toBeDisabled();
  await expect.element(rendered.dialog.getByRole("button", { name: "Cancelar" })).toBeDisabled();
  finish({ kind: "failed" });
  await expect.element(rendered.dialog.getByRole("button", { name: "Cancelar" })).toBeEnabled();
});

async function countByLot(rendered: Rendered, services: StockCountsScreenServices) {
  vi.mocked(services.fetchExpectedBalance).mockResolvedValue({
    kind: "ok",
    value: almondsExpectedByLot,
  });
  await chooseProduct(rendered, "Almendras peladas");
  await expect.element(rendered.dialog.getByText("Saldo esperado")).toBeVisible();
  await userEvent.click(radioLabel(rendered.dialog, "Por lote"));
}

const FIRST_LOT = /^Cantidad contada del lote L-2312/;
const SECOND_LOT = /^Cantidad contada del lote sin número/;

test("offers counting by product and by lot, by product chosen at first", async () => {
  const { dialog } = await renderModal(createServices());

  await expect.element(dialog.getByRole("radio", { name: "Por producto" })).toBeChecked();
  await expect.element(dialog.getByText("La cantidad total del producto")).toBeVisible();
  await expect.element(dialog.getByText("La cantidad de cada lote")).toBeVisible();
});

test("offers counting by lot only for a product whose expected balance has lots", async () => {
  const services = createServices();
  const rendered = await renderModal(services);
  await chooseProduct(rendered, "Té verde en hebras 100 g");
  await expect.element(rendered.dialog.getByText("Saldo esperado")).toBeVisible();

  await expect.element(rendered.dialog.getByRole("radio", { name: "Por lote" })).toBeDisabled();

  vi.mocked(services.fetchExpectedBalance).mockResolvedValue({
    kind: "ok",
    value: almondsExpectedByLot,
  });
  await chooseProduct(rendered, "Almendras peladas");
  await expect.element(rendered.dialog.getByRole("radio", { name: "Por lote" })).toBeEnabled();
});

test("does not offer counting by lot to a user who may not view balances", async () => {
  const services = createServices();
  const rendered = await renderModal(services, { showsBalance: false });

  await chooseProduct(rendered, "Almendras peladas");

  await expect.element(rendered.dialog.getByRole("radio", { name: "Por lote" })).toBeDisabled();
});

test("lists each lot in the order the cloud answers with its expiry and expected balance", async () => {
  const services = createServices();
  const rendered = await renderModal(services);
  await countByLot(rendered, services);
  const { dialog, screen } = rendered;

  await expect.element(dialog.getByText("Cantidad contada de cada lote")).toBeVisible();
  await expect.element(dialog.getByText("L-2312")).toBeVisible();
  await expect.element(dialog.getByText("Vence el 14/10/2026 · saldo 4,400 kg")).toBeVisible();
  await expect.element(dialog.getByText("—", { exact: true })).toBeVisible();
  await expect.element(dialog.getByText("Sin vencimiento · saldo 8,000 kg")).toBeVisible();
  await expect.element(dialog.getByText("Un lote sin cantidad queda en cero.")).toBeVisible();
  expect(dialog.getByRole("textbox", { name: /^Cantidad contada/ }).all()).toHaveLength(2);
  await expect.element(dialog.getByRole("textbox", { name: FIRST_LOT })).toBeVisible();
  await expect.element(dialog.getByRole("textbox", { name: SECOND_LOT })).toBeVisible();
  await expectNoAccessibilityViolations(screen.container);
});

test("shows the total counted, the expected balance and the difference as quantities are typed", async () => {
  const services = createServices();
  const rendered = await renderModal(services);
  await countByLot(rendered, services);
  const { dialog } = rendered;

  await userEvent.fill(dialog.getByRole("textbox", { name: FIRST_LOT }), "4,300");
  await userEvent.fill(dialog.getByRole("textbox", { name: SECOND_LOT }), "7,850");

  await expect.element(dialog.getByText("Total contado")).toBeVisible();
  await expect.element(dialog.getByText("12,150 kg")).toBeVisible();
  await expect.element(dialog.getByText("12,400 kg")).toBeVisible();
  await expect.element(dialog.getByText("− 0,250 kg")).toBeVisible();
});

test("registers the quantity of every lot, a lot left empty as zero", async () => {
  const services = createServices();
  const result = { expected: 12_400, delta: -8_100, balance: 4_300, superseded: false };
  vi.mocked(services.registerCount).mockResolvedValue({ kind: "ok", value: result });
  const onRegistered = vi.fn();
  const rendered = await renderModal(services, { onRegistered });
  await countByLot(rendered, services);
  await userEvent.fill(rendered.dialog.getByRole("textbox", { name: FIRST_LOT }), "4,300");

  await userEvent.click(rendered.dialog.getByRole("button", { name: REGISTER }));

  await expect.poll(() => onRegistered.mock.calls.length).toBe(1);
  expect(services.registerCount).toHaveBeenCalledWith({
    productId: almonds.id,
    lots: [
      { lotId: "lot-1", counted: 4_300 },
      { lotId: "lot-2", counted: 0 },
    ],
    occurredAt: "2026-09-15T21:40:30.000Z",
  });
  expect(onRegistered).toHaveBeenCalledWith(withoutBalance(almonds), result);
});

test("goes back to counting by product when the product chosen has no lots", async () => {
  const services = createServices();
  const rendered = await renderModal(services);
  await countByLot(rendered, services);
  vi.mocked(services.fetchExpectedBalance).mockResolvedValue({
    kind: "ok",
    value: expectedBalance(tea, 17_000),
  });

  await chooseProduct(rendered, "Té verde en hebras 100 g");

  await expect
    .element(rendered.dialog.getByRole("textbox", { name: /^Cantidad contada/ }))
    .toBeVisible();
  await expect.element(rendered.dialog.getByRole("radio", { name: "Por producto" })).toBeChecked();
});

test("asks for a quantity of a lot written the way it expects, registering nothing", async () => {
  const services = createServices();
  const rendered = await renderModal(services);
  await countByLot(rendered, services);
  await userEvent.fill(rendered.dialog.getByRole("textbox", { name: FIRST_LOT }), "mucho");

  await userEvent.click(rendered.dialog.getByRole("button", { name: REGISTER }));

  await expect
    .element(
      rendered.dialog.getByText(
        "Escribí los kilos con coma para los decimales, hasta 3, por ejemplo 12,150.",
      ),
    )
    .toBeVisible();
  expect(services.registerCount).not.toHaveBeenCalled();
});

test("shows the refusal of the lots the cloud reports, keeping the modal open", async () => {
  const services = createServices();
  vi.mocked(services.registerCount).mockResolvedValue({ kind: "validation_failed", field: "lots" });
  const onRegistered = vi.fn();
  const rendered = await renderModal(services, { onRegistered });
  await countByLot(rendered, services);

  await userEvent.click(rendered.dialog.getByRole("button", { name: REGISTER }));

  await expect
    .element(
      rendered.dialog.getByText("Los lotes del producto cambiaron. Elegí el producto de nuevo."),
    )
    .toBeVisible();
  expect(onRegistered).not.toHaveBeenCalled();
});
