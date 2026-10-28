import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { EditLotCostModal, type EditLotCostModalProps } from "./edit-lot-cost-modal";
import {
  initialLotAlmonds,
  initialLotHoney,
  initialLotWithdrawnStillHeld,
  supplierPriceAlfa,
  supplierPriceBeta,
} from "./test-support/stock-fixtures";

function createProps(overrides: Partial<EditLotCostModalProps> = {}): EditLotCostModalProps {
  return {
    lot: initialLotAlmonds,
    services: { setLotReferenceCost: vi.fn() },
    onClose: vi.fn(),
    onSessionEnded: vi.fn(),
    onSaved: vi.fn(),
    onOutdated: vi.fn(),
    ...overrides,
  };
}

async function renderModal(props: EditLotCostModalProps) {
  const screen = await render(
    <FieldSizeProvider size="backoffice">
      <main>
        <EditLotCostModal {...props} />
      </main>
    </FieldSizeProvider>,
  );
  await expect.element(screen.getByRole("dialog")).toBeVisible();
  return screen;
}

const SAVE = "Guardar el costo";

test("names the product and how much of the lot was counted", async () => {
  const screen = await renderModal(createProps());

  const dialog = screen.getByRole("dialog", { name: "Almendras peladas" });
  await expect.element(dialog.getByText("Stock · Inventario inicial")).toBeVisible();
  await expect
    .element(dialog.getByText("Lote contado en la puesta en marcha: 4,400 kg."))
    .toBeVisible();
  await expectNoAccessibilityViolations(screen.container);
});

test.each([
  [
    initialLotWithdrawnStillHeld,
    "Lote de una línea retirada de la puesta en marcha, con 1,500 kg en stock.",
  ],
  [
    { ...initialLotWithdrawnStillHeld, saleUnit: "UNIT" as const, remaining: 1_000 },
    "Lote de una línea retirada de la puesta en marcha, con 1 u en stock.",
  ],
])(
  "says a withdrawn line's lot comes from it and how much of the lot is left: %#",
  async (lot, text) => {
    const screen = await renderModal(createProps({ lot }));

    await expect.element(screen.getByText(text)).toBeVisible();
  },
);

test.each([
  [initialLotAlmonds, "Costo de referencia por kg"],
  [initialLotHoney, "Costo de referencia por unidad"],
])("asks for the cost per the unit the product is sold by: %#", async (lot, label) => {
  const screen = await renderModal(createProps({ lot }));

  await expect.element(screen.getByLabelText(label)).toBeVisible();
});

test("asks for a keyboard with the decimal comma for the cost", async () => {
  const screen = await renderModal(createProps());

  await expect
    .element(screen.getByLabelText("Costo de referencia por kg"))
    .toHaveAttribute("inputmode", "decimal");
});

test("shows the reason a typed cost can't be saved without calling the cloud", async () => {
  const props = createProps();
  const screen = await renderModal(props);

  await userEvent.click(screen.getByRole("button", { name: SAVE }));

  await expect.element(screen.getByText("Ingresá el costo de referencia.")).toBeVisible();
  expect(props.services.setLotReferenceCost).not.toHaveBeenCalled();
});

test("sends the typed pesos as cents for the lot and tells the screen it was saved", async () => {
  const props = createProps();
  vi.mocked(props.services.setLotReferenceCost).mockResolvedValue({ kind: "ok" });
  const screen = await renderModal(props);

  await userEvent.fill(screen.getByLabelText("Costo de referencia por kg"), "10.180,50");
  await userEvent.click(screen.getByRole("button", { name: SAVE }));

  await expect
    .poll(() => vi.mocked(props.services.setLotReferenceCost).mock.lastCall)
    .toEqual([initialLotAlmonds.lotId, { unitCostCents: 1_018_050 }]);
  await expect.poll(() => vi.mocked(props.onSaved).mock.lastCall).toEqual([initialLotAlmonds]);
});

test("closes without saving on Cancelar", async () => {
  const props = createProps();
  const screen = await renderModal(props);

  await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));

  expect(props.onClose).toHaveBeenCalled();
  expect(props.services.setLotReferenceCost).not.toHaveBeenCalled();
});

test.each([[{ kind: "not_found" }], [{ kind: "lot_withdrawn" }]] as const)(
  "a lot that no longer exists (%j) disables saving and tells the screen it is gone",
  async (outcome) => {
    const props = createProps();
    vi.mocked(props.services.setLotReferenceCost).mockResolvedValue(outcome);
    const screen = await renderModal(props);

    await userEvent.fill(screen.getByLabelText("Costo de referencia por kg"), "100");
    await userEvent.click(screen.getByRole("button", { name: SAVE }));

    const dialog = screen.getByRole("dialog");
    await expect.element(dialog.getByRole("alert")).toHaveTextContent("Este lote ya no existe");
    await expect.element(dialog.getByRole("button", { name: SAVE })).toBeDisabled();
    expect(props.onOutdated).toHaveBeenCalledWith(initialLotAlmonds);
    expect(props.onClose).not.toHaveBeenCalled();
  },
);

test("says a lot that is not of the initial count takes no reference cost", async () => {
  const props = createProps();
  vi.mocked(props.services.setLotReferenceCost).mockResolvedValue({
    kind: "not_an_initial_count_lot",
  });
  const screen = await renderModal(props);

  await userEvent.fill(screen.getByLabelText("Costo de referencia por kg"), "100");
  await userEvent.click(screen.getByRole("button", { name: SAVE }));

  const dialog = screen.getByRole("dialog");
  await expect.element(dialog.getByText("Este lote no es de la puesta en marcha")).toBeVisible();
  await expect.element(dialog.getByRole("button", { name: SAVE })).toBeDisabled();
});

test("puts a cost the cloud refuses on the cost field", async () => {
  const props = createProps();
  vi.mocked(props.services.setLotReferenceCost).mockResolvedValue({
    kind: "validation_failed",
    field: "unitCostCents",
  });
  const screen = await renderModal(props);

  await userEvent.fill(screen.getByLabelText("Costo de referencia por kg"), "100");
  await userEvent.click(screen.getByRole("button", { name: SAVE }));

  await expect.element(screen.getByText("Revisá el costo.")).toBeVisible();
});

test.each([
  [{ kind: "failed" }, "No se pudo guardar el costo", "Probá de nuevo."],
  [
    { kind: "rate_limited", retryAfterSeconds: 120 },
    "Demasiadas solicitudes",
    "Se puede volver a intentar en 2 minutos.",
  ],
] as const)("a save that ends %j shows %s", async (outcome, title, description) => {
  const props = createProps();
  vi.mocked(props.services.setLotReferenceCost).mockResolvedValue(outcome);
  const screen = await renderModal(props);

  await userEvent.fill(screen.getByLabelText("Costo de referencia por kg"), "100");
  await userEvent.click(screen.getByRole("button", { name: SAVE }));

  const dialog = screen.getByRole("dialog");
  await expect.element(dialog.getByText(title)).toBeVisible();
  await expect.element(dialog.getByText(description)).toBeVisible();
  await expect.element(dialog.getByRole("button", { name: SAVE })).toBeEnabled();
});

test("a save that throws ends in the save-failed notice", async () => {
  const props = createProps();
  vi.mocked(props.services.setLotReferenceCost).mockRejectedValue(new Error("network down"));
  const screen = await renderModal(props);

  await userEvent.fill(screen.getByLabelText("Costo de referencia por kg"), "100");
  await userEvent.click(screen.getByRole("button", { name: SAVE }));

  await expect.element(screen.getByText("No se pudo guardar el costo")).toBeVisible();
});

test("ends the session when saving finds it over", async () => {
  const props = createProps();
  vi.mocked(props.services.setLotReferenceCost).mockResolvedValue({ kind: "unauthenticated" });
  const screen = await renderModal(props);

  await userEvent.fill(screen.getByLabelText("Costo de referencia por kg"), "100");
  await userEvent.click(screen.getByRole("button", { name: SAVE }));

  await expect.poll(() => vi.mocked(props.onSessionEnded).mock.calls.length).toBe(1);
});

const PRICE_LIST = /Lista de proveedor/;

async function choosePrice(screen: Awaited<ReturnType<typeof renderModal>>, name: RegExp) {
  await userEvent.click(screen.getByRole("dialog").getByRole("button", { name: PRICE_LIST }));
  await userEvent.click(screen.getByRole("option", { name }));
}

const lotWithPrices = {
  ...initialLotAlmonds,
  costIncomplete: false,
  supplierPrices: [
    { ...supplierPriceAlfa, cheapest: true, current: false },
    { ...supplierPriceBeta, cheapest: false, current: true },
  ],
};

test("offers the loaded prices instead of a typed cost, each with its supplier, list date, packaging and cost, marking the cheapest", async () => {
  const screen = await renderModal(createProps({ lot: lotWithPrices }));

  const dialog = screen.getByRole("dialog", { name: "Almendras peladas" });
  await userEvent.click(dialog.getByRole("button", { name: PRICE_LIST }));
  await expect
    .element(screen.getByRole("option", { name: /^Alfa/ }))
    .toHaveTextContent("Alfa del 01/03/2026 · Caja x 10 · $ 9.500,00 / kgLa más barata");
  await expect
    .element(screen.getByRole("option", { name: /^Beta/ }))
    .toHaveTextContent("Beta del 15/02/2026 · Bolsa · $ 10.180,00 / kg");
  expect(dialog.getByRole("textbox").query()).toBeNull();
  await expectNoAccessibilityViolations(screen.container);
});

test("starts on the price the lot's cost already equals and saves it as the supplier item", async () => {
  const props = createProps({ lot: lotWithPrices });
  vi.mocked(props.services.setLotReferenceCost).mockResolvedValue({ kind: "ok" });
  const screen = await renderModal(props);

  await expect
    .element(screen.getByRole("button", { name: PRICE_LIST }))
    .toHaveTextContent("Beta del 15/02/2026 · Bolsa · $ 10.180,00 / kg");
  await userEvent.click(screen.getByRole("button", { name: SAVE }));

  await expect
    .poll(() => vi.mocked(props.services.setLotReferenceCost).mock.lastCall)
    .toEqual([initialLotAlmonds.lotId, { supplierItemId: supplierPriceBeta.supplierItemId }]);
  await expect.poll(() => vi.mocked(props.onSaved).mock.lastCall).toEqual([lotWithPrices]);
});

test("starts on the cheapest price when the lot's cost equals none, and saves another chosen", async () => {
  const lot = {
    ...lotWithPrices,
    supplierPrices: lotWithPrices.supplierPrices.map((price) => ({ ...price, current: false })),
  };
  const props = createProps({ lot });
  vi.mocked(props.services.setLotReferenceCost).mockResolvedValue({ kind: "ok" });
  const screen = await renderModal(props);

  await expect
    .element(screen.getByRole("button", { name: PRICE_LIST }))
    .toHaveTextContent("Alfa del 01/03/2026 · Caja x 10 · $ 9.500,00 / kgLa más barata");
  await choosePrice(screen, /^Beta/);
  await userEvent.click(screen.getByRole("button", { name: SAVE }));

  await expect
    .poll(() => vi.mocked(props.services.setLotReferenceCost).mock.lastCall)
    .toEqual([initialLotAlmonds.lotId, { supplierItemId: supplierPriceBeta.supplierItemId }]);
});

test("fits six loaded prices in the modal and offers every one", async () => {
  const supplierPrices = ["Alfa", "Beta", "Gamma", "Delta", "Épsilon", "Zeta"].map(
    (supplierName, index) => ({
      ...supplierPriceAlfa,
      supplierItemId: `00000000-0000-4000-8000-0000000000d${index}`,
      supplierName,
      cheapest: index === 0,
      current: false,
    }),
  );
  const screen = await renderModal(createProps({ lot: { ...lotWithPrices, supplierPrices } }));

  const dialog = screen.getByRole("dialog").element();
  const overflowing = [dialog, ...dialog.querySelectorAll("*")].filter(
    (element) =>
      !["hidden", "clip"].includes(getComputedStyle(element).overflowX) &&
      element.scrollWidth > element.clientWidth,
  );
  expect(overflowing).toEqual([]);
  await userEvent.click(screen.getByRole("button", { name: PRICE_LIST }));
  expect(screen.getByRole("option").elements()).toHaveLength(6);
});

test.each([
  [
    { kind: "cost_chosen_from_supplier_prices" },
    "Este producto ya tiene precios de proveedores",
    "Cerrá y volvé a abrir el lote para elegir uno.",
  ],
  [
    { kind: "supplier_price_not_found" },
    "Ese precio ya no está disponible",
    "Cerrá y volvé a abrir el lote para ver los precios cargados.",
  ],
] as const)(
  "a save that ends %j shows %s and disables saving",
  async (outcome, title, description) => {
    const props = createProps();
    vi.mocked(props.services.setLotReferenceCost).mockResolvedValue(outcome);
    const screen = await renderModal(props);

    await userEvent.fill(screen.getByLabelText("Costo de referencia por kg"), "100");
    await userEvent.click(screen.getByRole("button", { name: SAVE }));

    const dialog = screen.getByRole("dialog");
    await expect.element(dialog.getByText(title)).toBeVisible();
    await expect.element(dialog.getByText(description)).toBeVisible();
    await expect.element(dialog.getByRole("button", { name: SAVE })).toBeDisabled();
    expect(props.onOutdated).toHaveBeenCalledWith(initialLotAlmonds);
  },
);
