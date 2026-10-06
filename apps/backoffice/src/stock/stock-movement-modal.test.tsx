import { FieldSizeProvider } from "@purosur/ui";
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
    onRegistered = () => {},
  }: {
    kinds?: readonly [MovementKind, ...MovementKind[]];
    onRegistered?: () => void;
  } = {},
) {
  const screen = await render(
    <FieldSizeProvider size="backoffice">
      <StockMovementModal
        title={TITLE}
        kinds={kinds}
        services={services}
        onClose={() => {}}
        onSessionEnded={() => {}}
        showsBalance
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
