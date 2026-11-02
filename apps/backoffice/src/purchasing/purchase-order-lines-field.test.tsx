import { purchaseOrderEditBodySchema } from "@purosur/contracts";
import { FieldSizeProvider, type LoadStatus, useRequestForm } from "@purosur/ui";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import type { PurchaseProducts } from "./purchase-form";
import {
  PURCHASE_ORDER_FIELDS,
  purchaseOrderEditRequestFrom,
  purchaseOrderFormValuesOf,
  purchaseOrderLinesMessage,
} from "./purchase-order-form";
import { PurchaseOrderLinesField } from "./purchase-order-lines-field";
import { DRAFT_ORDER } from "./test-support/purchase-orders";
import { purchasableProducts } from "./test-support/purchase-products";

function Harness({
  products = purchasableProducts,
  productsStatus = "loaded",
  onLinesChange = () => {},
}: {
  products?: PurchaseProducts;
  productsStatus?: LoadStatus;
  onLinesChange?: () => void;
}) {
  const { form } = useRequestForm({
    defaultValues: purchaseOrderFormValuesOf(DRAFT_ORDER),
    request: { schema: purchaseOrderEditBodySchema, from: purchaseOrderEditRequestFrom },
    fields: PURCHASE_ORDER_FIELDS,
    messages: { lines: purchaseOrderLinesMessage },
    onSubmit: async () => {},
  });
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <form.AppField name="lines">
          {() => (
            <PurchaseOrderLinesField
              savedLines={DRAFT_ORDER.lines}
              products={products}
              productsStatus={productsStatus}
              onLinesChange={onLinesChange}
            />
          )}
        </form.AppField>
      </main>
    </FieldSizeProvider>
  );
}

type Screen = Awaited<ReturnType<typeof render>>;

function line(screen: Screen, number: number) {
  return screen.getByRole("group", { name: `Línea ${number}` });
}

test("shows a line the order came with by its product, with its expected package price and total", async () => {
  const screen = await render(<Harness />);

  const miel = line(screen, 1);
  await expect.element(miel.getByText("Miel pura de abeja 1 kg")).toBeVisible();
  expect(miel.getByRole("combobox").query()).toBeNull();
  await expect.element(miel.getByText("$ 1.850,00")).toBeVisible();
  await expect.element(miel.getByText("$ 5.550,00")).toBeVisible();
  await expect.element(line(screen, 2).getByText("Sin precio de lista").first()).toBeVisible();
});

test("stops showing a saved line's total once its packages change, until it is saved", async () => {
  const screen = await render(<Harness />);
  const miel = line(screen, 1);

  await userEvent.fill(miel.getByRole("textbox", { name: /^Cantidad de paquetes/ }), "4");

  await expect.element(miel.getByText("Se calcula al guardar")).toBeVisible();
  expect(miel.getByText("$ 5.550,00").query()).toBeNull();
  await expect.element(miel.getByText("$ 1.850,00")).toBeVisible();
});

test("stops showing a saved line's total once the quantity each package holds changes", async () => {
  const screen = await render(<Harness />);
  const miel = line(screen, 1);

  await userEvent.fill(miel.getByRole("textbox", { name: /^Cantidad por paquete/ }), "6");

  await expect.element(miel.getByText("Se calcula al guardar")).toBeVisible();
  expect(miel.getByText("$ 5.550,00").query()).toBeNull();
});

test("shows the saved total again when the packages are typed back as saved", async () => {
  const screen = await render(<Harness />);
  const packages = line(screen, 1).getByRole("textbox", { name: /^Cantidad de paquetes/ });

  await userEvent.fill(packages, "4");
  await userEvent.fill(packages, "3");

  await expect.element(line(screen, 1).getByText("$ 5.550,00")).toBeVisible();
});

test("an added line offers only the products not in the order yet, and its price is calculated on saving", async () => {
  const screen = await render(<Harness />);

  await userEvent.click(screen.getByRole("button", { name: "Agregar línea" }));
  const added = line(screen, 3);
  await userEvent.click(added.getByRole("combobox", { name: /^Producto/ }));

  await expect.element(screen.getByRole("option", { name: "Almendras peladas" })).toBeVisible();
  expect(screen.getByRole("option", { name: "Miel pura de abeja 1 kg" }).query()).toBeNull();
  expect(screen.getByRole("option", { name: "Avena arrollada" }).query()).toBeNull();
  await expect.element(added.getByText("Se calcula al guardar")).toBeVisible();
});

test("says no products are left when the order already has every one", async () => {
  const screen = await render(<Harness products={purchasableProducts.slice(0, 2)} />);

  await userEvent.click(screen.getByRole("button", { name: "Agregar línea" }));

  await expect
    .element(line(screen, 3).getByText("No quedan productos para agregar."))
    .toBeVisible();
});

test("removes a line and reports every change of the lines", async () => {
  const onLinesChange = vi.fn();
  const screen = await render(<Harness onLinesChange={onLinesChange} />);

  await userEvent.click(line(screen, 2).getByRole("button", { name: "Quitar línea" }));

  expect(line(screen, 2).query()).toBeNull();
  await expect.element(line(screen, 1).getByText("Miel pura de abeja 1 kg")).toBeVisible();
  expect(onLinesChange).toHaveBeenCalledTimes(1);
  await userEvent.fill(
    line(screen, 1).getByRole("textbox", { name: /^Cantidad de paquetes/ }),
    "5",
  );
  expect(onLinesChange.mock.calls.length).toBeGreaterThan(1);
});

test.each(["loading", "failed"] as const)(
  "offers no way to add a line while the products are %s",
  async (productsStatus) => {
    const screen = await render(<Harness productsStatus={productsStatus} />);

    await expect.element(screen.getByRole("button", { name: "Agregar línea" })).toBeDisabled();
  },
);
