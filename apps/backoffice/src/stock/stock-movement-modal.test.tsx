import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import type { MovementKind } from "./stock-movement-form";
import { StockMovementModal } from "./stock-movement-modal";
import type { StockMovementsScreenServices } from "./stock-movements-services";
import {
  almonds,
  honey,
  movementReasons,
  oats,
  withoutBalance,
} from "./test-support/stock-fixtures";

beforeEach(async () => {
  await page.viewport(1280, 900);
});

function createServices(): StockMovementsScreenServices {
  return {
    fetchStockMovements: vi.fn(),
    fetchStockMovementReasons: vi.fn().mockResolvedValue({ kind: "ok", value: movementReasons }),
    fetchStockProducts: vi.fn().mockResolvedValue({
      kind: "ok",
      value: { products: [almonds, honey].map(withoutBalance) },
    }),
    fetchStockBalances: vi.fn().mockResolvedValue({
      kind: "ok",
      value: { products: [almonds, honey] },
    }),
    recordLoss: vi.fn(),
    recordAdjustment: vi.fn(),
  };
}

const TITLE = "Cargar pérdida o ajuste";

async function renderModal(
  services: StockMovementsScreenServices,
  {
    kinds = ["loss", "adjustment"],
    showsBalance = true,
    onClose = () => {},
    onSessionEnded = () => {},
    onRegistered = () => {},
  }: {
    kinds?: readonly [MovementKind, ...MovementKind[]];
    showsBalance?: boolean;
    onClose?: () => void;
    onSessionEnded?: () => void;
    onRegistered?: () => void;
  } = {},
) {
  const screen = await render(
    <FieldSizeProvider size="backoffice">
      <StockMovementModal
        title={TITLE}
        kinds={kinds}
        services={services}
        onClose={onClose}
        onSessionEnded={onSessionEnded}
        showsBalance={showsBalance}
        onRegistered={onRegistered}
      />
    </FieldSizeProvider>,
  );
  const dialog = screen.getByRole("dialog", { name: TITLE });
  return { screen, dialog };
}

type Rendered = Awaited<ReturnType<typeof renderModal>>;

async function renderForm(...args: Parameters<typeof renderModal>): Promise<Rendered> {
  const rendered = await renderModal(...args);
  await expect.element(rendered.dialog.getByRole("button", { name: /Producto/ })).toBeVisible();
  return rendered;
}

function cardLabel({ dialog }: Rendered, name: string): HTMLElement {
  const label = dialog.getByRole("radio", { name }).element().closest("label");
  if (!label) {
    throw new Error(`no label for the card ${name}`);
  }
  return label;
}

async function chooseProduct({ screen, dialog }: Rendered, name: string) {
  await userEvent.click(dialog.getByRole("button", { name: /Producto/ }));
  await userEvent.click(screen.getByRole("option", { name }));
}

test("shows the balance an adjustment that adds leaves", async () => {
  const rendered = await renderForm(createServices());
  const { dialog } = rendered;

  await userEvent.click(cardLabel(rendered, "Ajuste"));
  await chooseProduct(rendered, "Miel pura de abeja 1 kg");
  await userEvent.click(cardLabel(rendered, "Error en una compra"));
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Cantidad/ }), "2");

  await expect.element(dialog.getByText("+ 2 u")).toBeVisible();
  await expect.element(dialog.getByText("26 u")).toBeVisible();
});

test("takes the only direction a reason allows from the reasons the cloud lists", async () => {
  const services = createServices();
  vi.mocked(services.fetchStockMovementReasons).mockResolvedValue({
    kind: "ok",
    value: {
      reasons: [
        { kind: "adjustment", reason: "purchase_correction", directions: ["subtract"] },
        { kind: "adjustment", reason: "batch_correction", directions: ["add", "subtract"] },
      ],
    },
  });
  const onRegistered = vi.fn();
  vi.mocked(services.recordAdjustment).mockResolvedValue({
    kind: "ok",
    value: { balance: 22_000, superseded: false },
  });
  const rendered = await renderForm(services, { kinds: ["adjustment"], onRegistered });
  const { dialog } = rendered;
  await chooseProduct(rendered, "Miel pura de abeja 1 kg");
  await expect.element(dialog.getByRole("radiogroup", { name: "Sentido" })).toBeVisible();

  await userEvent.click(cardLabel(rendered, "Error en una compra"));
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Cantidad/ }), "2");

  expect(dialog.getByRole("radiogroup", { name: "Sentido" }).query()).toBeNull();
  await expect.element(dialog.getByText("− 2 u")).toBeVisible();
  await expect.element(dialog.getByText("22 u")).toBeVisible();
  await userEvent.click(dialog.getByRole("button", { name: "Registrar el ajuste" }));
  await expect.poll(() => onRegistered.mock.calls.length).toBe(1);
  expect(services.recordAdjustment).toHaveBeenCalledWith({
    productId: honey.id,
    reason: "purchase_correction",
    direction: "subtract",
    quantity: 2000,
  });
  expect(onRegistered.mock.calls[0]?.[2]).toBe(-2000);
});

test("previews a loss in the direction its reasons share before one is chosen", async () => {
  const onRegistered = vi.fn();
  const services = createServices();
  vi.mocked(services.recordLoss).mockResolvedValue({
    kind: "ok",
    value: { balance: 23_000, superseded: false },
  });
  const rendered = await renderForm(services, { kinds: ["loss"], onRegistered });
  const { dialog } = rendered;
  await chooseProduct(rendered, "Miel pura de abeja 1 kg");

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Cantidad perdida/ }), "1");

  await expect.element(dialog.getByText("− 1 u")).toBeVisible();
  await expect.element(dialog.getByText("23 u")).toBeVisible();
  await userEvent.click(cardLabel(rendered, "Robo"));
  await userEvent.click(dialog.getByRole("button", { name: "Registrar la pérdida" }));
  await expect.poll(() => onRegistered.mock.calls[0]?.[2]).toBe(-1000);
});

test("keeps showing the form for a quantity too large to read", async () => {
  const rendered = await renderForm(createServices(), { kinds: ["loss"] });
  const { dialog } = rendered;
  await chooseProduct(rendered, "Miel pura de abeja 1 kg");

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Cantidad perdida/ }), "9".repeat(310));

  await expect.element(dialog.getByRole("button", { name: "Registrar la pérdida" })).toBeVisible();
});

test("shows a failed load of the balance with a retry that loads the balance again", async () => {
  const services = createServices();
  vi.mocked(services.fetchStockBalances)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockResolvedValueOnce({ kind: "ok", value: { products: [almonds, honey] } });
  const rendered = await renderForm(services, { kinds: ["loss"] });
  const { dialog } = rendered;
  await chooseProduct(rendered, "Miel pura de abeja 1 kg");

  await expect.element(dialog.getByText("No pudimos abrir el saldo")).toBeVisible();
  await userEvent.click(dialog.getByRole("button", { name: "Reintentar" }));

  await expect.element(dialog.getByText("Saldo actual")).toBeVisible();
  await expect.element(dialog.getByText("24 u")).toBeVisible();
});

test("shows a failed load of the reasons with a retry that loads the form again", async () => {
  const services = createServices();
  vi.mocked(services.fetchStockMovementReasons)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockResolvedValueOnce({ kind: "ok", value: movementReasons });
  const { dialog } = await renderModal(services);

  await expect.element(dialog.getByText("No pudimos abrir los productos")).toBeVisible();
  await expect.element(dialog.getByRole("button", { name: "Registrar la pérdida" })).toBeDisabled();
  await userEvent.click(dialog.getByRole("button", { name: "Reintentar" }));

  await expect.element(dialog.getByRole("button", { name: /Producto/ })).toBeVisible();
});

test("offers a deactivated product in the selector marked as deactivated", async () => {
  const services = createServices();
  vi.mocked(services.fetchStockProducts).mockResolvedValue({
    kind: "ok",
    value: { products: [almonds, oats, honey].map(withoutBalance) },
  });
  const { screen, dialog } = await renderForm(services);

  await userEvent.click(dialog.getByRole("button", { name: /Producto/ }));

  await expect
    .element(screen.getByRole("option", { name: /Avena arrollada/ }).getByText("Desactivado"))
    .toBeVisible();
  expect(
    screen
      .getByRole("option", { name: /Almendras peladas/ })
      .getByText("Desactivado")
      .query(),
  ).toBeNull();
});

test("keeps the modal open and says the product no longer exists when the cloud cannot find it", async () => {
  const services = createServices();
  vi.mocked(services.recordLoss).mockResolvedValue({ kind: "not_found" });
  const rendered = await renderForm(services, { kinds: ["loss"] });
  const { dialog } = rendered;
  await chooseProduct(rendered, "Miel pura de abeja 1 kg");
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Cantidad perdida/ }), "1");
  await userEvent.click(cardLabel(rendered, "Robo"));

  await userEvent.click(dialog.getByRole("button", { name: "Registrar la pérdida" }));

  await expect.element(dialog.getByRole("alert")).toHaveTextContent("Este producto ya no existe");
  await expect.poll(() => vi.mocked(services.fetchStockProducts).mock.calls.length).toBe(2);
});

async function fillLoss(rendered: Rendered, reason = "Robo") {
  await chooseProduct(rendered, "Miel pura de abeja 1 kg");
  await userEvent.fill(rendered.dialog.getByRole("textbox", { name: /^Cantidad perdida/ }), "1");
  await userEvent.click(cardLabel(rendered, reason));
}

test("registers a loss with its reason and shows the balance it leaves", async () => {
  const services = createServices();
  const result = { balance: 23_000, superseded: false };
  vi.mocked(services.recordLoss).mockResolvedValue({ kind: "ok", value: result });
  const onRegistered = vi.fn();
  const rendered = await renderForm(services, { onRegistered });
  const { screen, dialog } = rendered;

  await userEvent.click(cardLabel(rendered, "Pérdida"));
  await fillLoss(rendered, "Rotura o derrame");

  await expect.element(dialog.getByText("Saldo actual")).toBeVisible();
  await expect.element(dialog.getByText("24 u")).toBeVisible();
  await expect.element(dialog.getByText("− 1 u")).toBeVisible();
  await expect.element(dialog.getByText("23 u")).toBeVisible();
  await expectNoAccessibilityViolations(screen.container);
  await userEvent.click(dialog.getByRole("button", { name: "Registrar la pérdida" }));

  await expect.poll(() => onRegistered.mock.calls.length).toBe(1);
  expect(services.recordLoss).toHaveBeenCalledWith({
    productId: honey.id,
    reason: "broken_or_spilled",
    quantity: 1000,
  });
  expect(onRegistered).toHaveBeenCalledWith(withoutBalance(honey), result, -1000);
});

test("registers an adjustment in the direction chosen", async () => {
  const services = createServices();
  vi.mocked(services.recordAdjustment).mockResolvedValue({
    kind: "ok",
    value: { balance: 12_150, superseded: false },
  });
  const rendered = await renderForm(services);
  const { dialog } = rendered;

  await userEvent.click(cardLabel(rendered, "Ajuste"));
  await chooseProduct(rendered, "Almendras peladas");
  await userEvent.click(cardLabel(rendered, "Error en una compra"));
  await userEvent.click(cardLabel(rendered, "Resta"));
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Cantidad/ }), "0,250");

  await expect.element(dialog.getByText("− 0,250 kg")).toBeVisible();
  await expect
    .element(
      dialog
        .getByText(
          "Si lo que hay en el local no coincide con el sistema, se corrige con un recuento.",
        )
        .first(),
    )
    .toBeVisible();
  await userEvent.click(dialog.getByRole("button", { name: "Registrar el ajuste" }));

  await expect.poll(() => vi.mocked(services.recordAdjustment).mock.calls.length).toBe(1);
  expect(services.recordAdjustment).toHaveBeenCalledWith({
    productId: almonds.id,
    reason: "purchase_correction",
    direction: "subtract",
    quantity: 250,
  });
});

test("asks for the product, the quantity and the reason before registering anything", async () => {
  const services = createServices();
  const rendered = await renderForm(services);
  const { dialog } = rendered;
  await userEvent.click(cardLabel(rendered, "Pérdida"));

  await userEvent.click(dialog.getByRole("button", { name: "Registrar la pérdida" }));

  await expect.element(dialog.getByText("Elegí el producto.")).toBeVisible();
  await expect.element(dialog.getByText("Ingresá la cantidad.")).toBeVisible();
  await expect.element(dialog.getByText("Elegí el motivo.")).toBeVisible();
  expect(services.recordLoss).not.toHaveBeenCalled();
});

test.each([
  [
    { kind: "validation_failed", field: "quantity" },
    "Escribí una cantidad entera de unidades, por ejemplo 16.",
  ],
  [{ kind: "validation_failed", field: "occurredAt" }, "No se pudo guardar el movimiento"],
  [{ kind: "failed" }, "No se pudo guardar el movimiento"],
  [{ kind: "rate_limited", retryAfterSeconds: 30 }, "Demasiadas solicitudes"],
  [{ kind: "rate_limited", retryAfterSeconds: 30 }, "Se puede volver a intentar en 1 minuto."],
] as const)("keeps the modal open and explains the refusal %j", async (outcome, message) => {
  const services = createServices();
  vi.mocked(services.recordLoss).mockResolvedValue(outcome);
  const onRegistered = vi.fn();
  const rendered = await renderForm(services, { onRegistered });
  await userEvent.click(cardLabel(rendered, "Pérdida"));
  await fillLoss(rendered);

  await userEvent.click(rendered.dialog.getByRole("button", { name: "Registrar la pérdida" }));

  await expect.element(rendered.dialog.getByText(message)).toBeVisible();
  expect(onRegistered).not.toHaveBeenCalled();
});

test("keeps the modal open and says the movement could not be saved when the request fails", async () => {
  const services = createServices();
  vi.mocked(services.recordLoss).mockRejectedValue(new Error("network down"));
  const onRegistered = vi.fn();
  const rendered = await renderForm(services, { onRegistered });
  await userEvent.click(cardLabel(rendered, "Pérdida"));
  await fillLoss(rendered);

  await userEvent.click(rendered.dialog.getByRole("button", { name: "Registrar la pérdida" }));

  await expect.element(rendered.dialog.getByText("No se pudo guardar el movimiento")).toBeVisible();
  expect(onRegistered).not.toHaveBeenCalled();
});

test("ends the session when registering finds it over", async () => {
  const services = createServices();
  vi.mocked(services.recordLoss).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const rendered = await renderForm(services, { onSessionEnded });
  await userEvent.click(cardLabel(rendered, "Pérdida"));
  await fillLoss(rendered);

  await userEvent.click(rendered.dialog.getByRole("button", { name: "Registrar la pérdida" }));

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("navigates to Mi cuenta when registering comes back forbidden", async () => {
  window.history.pushState(null, "", "/stock/movements");
  try {
    const services = createServices();
    vi.mocked(services.recordLoss).mockResolvedValue({ kind: "forbidden" });
    const rendered = await renderForm(services);
    await userEvent.click(cardLabel(rendered, "Pérdida"));
    await fillLoss(rendered);

    await userEvent.click(rendered.dialog.getByRole("button", { name: "Registrar la pérdida" }));

    await expect.poll(() => window.location.pathname).toBe("/account");
  } finally {
    window.history.pushState(null, "", "/");
  }
});

test.each([
  ["loss", "Registrar la pérdida"],
  ["adjustment", "Registrar el ajuste"],
] as const)("offers no choice of what to load when only %s is allowed", async (kind, submit) => {
  const { dialog } = await renderForm(createServices(), { kinds: [kind] });

  expect(dialog.getByRole("radiogroup", { name: "Qué se carga" }).query()).toBeNull();
  await expect.element(dialog.getByRole("button", { name: submit })).toBeVisible();
});

test("shows no balance and asks for none when the user may not view balances", async () => {
  const services = createServices();
  const rendered = await renderForm(services, { kinds: ["loss"], showsBalance: false });
  await fillLoss(rendered);

  expect(rendered.dialog.getByText("Saldo actual").query()).toBeNull();
  expect(services.fetchStockBalances).not.toHaveBeenCalled();
});

test("says there are no active products when the cloud lists none", async () => {
  const services = createServices();
  vi.mocked(services.fetchStockProducts).mockResolvedValue({
    kind: "ok",
    value: { products: [] },
  });
  const { dialog } = await renderModal(services);

  await expect.element(dialog.getByText("No hay productos activos")).toBeVisible();
});

test("disables registering and shows no selector while the products load", async () => {
  const services = createServices();
  vi.mocked(services.fetchStockProducts).mockReturnValue(new Promise(() => {}));
  const { dialog } = await renderModal(services);

  await expect.element(dialog.getByRole("button", { name: "Registrar la pérdida" })).toBeDisabled();
  expect(dialog.getByRole("button", { name: /Producto/ }).query()).toBeNull();
});

test("drops a refusal notice when the kind being loaded changes", async () => {
  const services = createServices();
  vi.mocked(services.recordLoss).mockResolvedValue({ kind: "failed" });
  const rendered = await renderForm(services);
  const { dialog } = rendered;
  await userEvent.click(cardLabel(rendered, "Pérdida"));
  await fillLoss(rendered);
  await userEvent.click(dialog.getByRole("button", { name: "Registrar la pérdida" }));
  await expect.element(dialog.getByText("No se pudo guardar el movimiento")).toBeVisible();

  await userEvent.click(cardLabel(rendered, "Ajuste"));

  await expect.element(dialog.getByRole("button", { name: "Registrar el ajuste" })).toBeVisible();
  expect(dialog.getByText("No se pudo guardar el movimiento").query()).toBeNull();
});

test("closes on Cancelar without registering anything", async () => {
  const services = createServices();
  const onClose = vi.fn();
  const { dialog } = await renderForm(services, { onClose });

  await userEvent.click(dialog.getByRole("button", { name: "Cancelar" }));

  expect(onClose).toHaveBeenCalledTimes(1);
  expect(services.recordLoss).not.toHaveBeenCalled();
});

test("disables registering and cancelling while the request is in flight", async () => {
  const services = createServices();
  let finish: (outcome: Awaited<ReturnType<typeof services.recordLoss>>) => void = () => {};
  vi.mocked(services.recordLoss).mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const rendered = await renderForm(services);
  const { dialog } = rendered;
  await userEvent.click(cardLabel(rendered, "Pérdida"));
  await fillLoss(rendered);

  await userEvent.click(dialog.getByRole("button", { name: "Registrar la pérdida" }));

  await expect.element(dialog.getByRole("button", { name: "Registrar la pérdida" })).toBeDisabled();
  await expect.element(dialog.getByRole("button", { name: "Cancelar" })).toBeDisabled();
  finish({ kind: "failed" });
  await expect.element(dialog.getByRole("button", { name: "Cancelar" })).toBeEnabled();
});
