import type { PackagingSummary, SupplierSummary } from "@purosur/contracts";
import { ANOTHER_FICTIONAL_CUIT, FICTIONAL_CUIT } from "@purosur/domain/fiscal/test-support";
import { FieldSizeProvider } from "@purosur/ui";
import { beforeEach, expect, test, vi } from "vitest";
import { type Locator, page, userEvent } from "vitest/browser";
import { StubProductCreationModal } from "../platform/test-support/creation-parts";
import type { BackofficeAccess } from "../shell/backoffice-access";
import { ADMINISTRATOR_ACCESS, accessWith } from "../shell/test-support/backoffice-access";
import { render } from "../shell/test-support/render-with-router";
import { NewPurchaseScreen } from "./new-purchase-screen";
import type { NewPurchaseScreenServices } from "./new-purchase-services";
import { cajaDeMiel } from "./test-support/packagings";
import { purchaseChoicesFrom } from "./test-support/purchases";
import { suppliersWithCuits } from "./test-support/suppliers";

const { andina, granos } = suppliersWithCuits(FICTIONAL_CUIT, ANOTHER_FICTIONAL_CUIT);

const distribuidoraSur: SupplierSummary = {
  ...granos,
  id: "5a900000-0000-4000-8000-000000000010",
  name: "Distribuidora Sur",
};

const cajaX6: PackagingSummary = {
  ...cajaDeMiel,
  id: "9ac00000-0000-4000-8000-000000000010",
  name: "Caja x 6",
  quantityPerPackage: 6000,
};

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

function createServices(
  choices: Partial<ReturnType<typeof purchaseChoicesFrom>> = {},
): NewPurchaseScreenServices {
  return {
    fetchPurchaseChoices: vi.fn().mockResolvedValue({
      kind: "ok",
      value: { ...purchaseChoicesFrom([andina, granos]), ...choices },
    }),
    registerPurchase: vi.fn(),
    createSupplier: vi.fn(),
    createPackaging: vi.fn(),
  };
}

async function opened(
  services: NewPurchaseScreenServices,
  access: BackofficeAccess,
  ready: (screen: ScreenOf) => Locator = (screen) =>
    screen.getByRole("combobox", { name: /^Proveedor/ }),
) {
  const screen = await render(
    <FieldSizeProvider size="backoffice">
      <main>
        <NewPurchaseScreen
          access={access}
          productCreationModal={StubProductCreationModal}
          services={services}
          onSessionEnded={() => {}}
        />
      </main>
    </FieldSizeProvider>,
  );
  await expect.element(ready(screen)).toBeVisible();
  return screen;
}

type Screen = Awaited<ReturnType<typeof opened>>;
type ScreenOf = Awaited<ReturnType<typeof render>>;

async function typeSupplier(screen: Screen, text: string) {
  await userEvent.fill(screen.getByRole("combobox", { name: /^Proveedor/ }), text);
}

async function openPackagingSelectorOfFirstLine(screen: Screen) {
  const group = screen.getByRole("group", { name: "Línea 1" });
  await userEvent.click(group.getByRole("combobox", { name: /^Producto/ }));
  (page.getByRole("option", { name: "Miel pura de abeja 1 kg" }).element() as HTMLElement).click();
  await userEvent.click(group.getByText("Presentación", { exact: true }).last());
  return group;
}

test("typing a supplier that does not exist offers to create it, opening the supplier modal with the typed name", async () => {
  const screen = await opened(createServices(), ADMINISTRATOR_ACCESS);

  await typeSupplier(screen, "Distribuidora Sur");
  await userEvent.click(
    screen.getByRole("option", { name: "Crear proveedor «Distribuidora Sur»" }),
  );

  const supplierDialog = screen.getByRole("dialog", { name: "Nuevo proveedor" });
  await expect
    .element(supplierDialog.getByRole("textbox", { name: /^Nombre/ }))
    .toHaveValue("Distribuidora Sur");
});

test("saving the stacked supplier selects it and keeps the rest of the purchase as typed", async () => {
  const services = createServices();
  vi.mocked(services.createSupplier).mockResolvedValue({ kind: "ok", supplier: distribuidoraSur });
  const screen = await opened(services, ADMINISTRATOR_ACCESS);
  await userEvent.fill(screen.getByRole("textbox", { name: /^Nota/ }), "Entrega de la tarde");
  await typeSupplier(screen, "Distribuidora Sur");
  await userEvent.click(
    screen.getByRole("option", { name: "Crear proveedor «Distribuidora Sur»" }),
  );
  const supplierDialog = screen.getByRole("dialog", { name: "Nuevo proveedor" });

  await userEvent.click(supplierDialog.getByRole("button", { name: "Crear el proveedor" }));

  await expect
    .poll(() => screen.getByRole("dialog", { name: "Nuevo proveedor" }).query())
    .toBeNull();
  await expect
    .element(screen.getByRole("combobox", { name: /^Proveedor/ }))
    .toHaveValue("Distribuidora Sur");
  await expect
    .element(screen.getByRole("textbox", { name: /^Nota/ }))
    .toHaveValue("Entrega de la tarde");
});

test("offers no supplier creation to a person who cannot manage suppliers", async () => {
  const screen = await opened(createServices(), accessWith("purchases", "stock_area"));

  await typeSupplier(screen, "Distribuidora Sur");

  await expect.element(screen.getByText("Sin resultados")).toBeVisible();
  expect(screen.getByRole("option", { name: /^Crear proveedor/ }).query()).toBeNull();
});

test("typing a packaging that does not exist offers to create it for the line's product with the typed name", async () => {
  const screen = await opened(createServices(), ADMINISTRATOR_ACCESS);
  const group = await openPackagingSelectorOfFirstLine(screen);

  await userEvent.fill(group.getByRole("combobox", { name: /^Presentación/ }), "Caja x 6");
  await userEvent.click(screen.getByRole("option", { name: "Crear presentación «Caja x 6»" }));

  const packagingDialog = screen.getByRole("dialog", { name: "Nueva presentación" });
  await expect
    .element(packagingDialog.getByRole("textbox", { name: /^Nombre/ }))
    .toHaveValue("Caja x 6");
  await expect
    .element(packagingDialog.getByText("Producto: Miel pura de abeja 1 kg"))
    .toBeVisible();
});

test("saving the stacked packaging selects it in that line", async () => {
  const services = createServices();
  vi.mocked(services.createPackaging).mockResolvedValue({ kind: "ok", packaging: cajaX6 });
  const screen = await opened(services, ADMINISTRATOR_ACCESS);
  const group = await openPackagingSelectorOfFirstLine(screen);
  await userEvent.fill(group.getByRole("combobox", { name: /^Presentación/ }), "Caja x 6");
  await userEvent.click(screen.getByRole("option", { name: "Crear presentación «Caja x 6»" }));
  const packagingDialog = screen.getByRole("dialog", { name: "Nueva presentación" });
  await userEvent.fill(
    packagingDialog.getByRole("textbox", { name: /^Cantidad por presentación/ }),
    "6",
  );

  await userEvent.click(packagingDialog.getByRole("button", { name: "Crear la presentación" }));

  await expect
    .poll(() => screen.getByRole("dialog", { name: "Nueva presentación" }).query())
    .toBeNull();
  await expect
    .element(group.getByRole("combobox", { name: /^Presentación/ }))
    .toHaveValue("Caja x 6 (6 u)");
});

test("offers no packaging creation to a person who cannot manage purchase packagings", async () => {
  const screen = await opened(createServices(), accessWith("purchases", "suppliers"));
  const group = await openPackagingSelectorOfFirstLine(screen);

  await userEvent.fill(group.getByRole("combobox", { name: /^Presentación/ }), "Caja x 6");

  await expect.element(screen.getByText("Sin resultados")).toBeVisible();
  expect(screen.getByRole("option", { name: /^Crear presentación/ }).query()).toBeNull();
});

async function typeProductOfFirstLine(screen: Screen, text: string) {
  const group = screen.getByRole("group", { name: "Línea 1" });
  await userEvent.fill(group.getByRole("combobox", { name: /^Producto/ }), text);
  return group;
}

test("typing a product that does not exist offers to create it, opening the product form with the typed text", async () => {
  const screen = await opened(createServices(), ADMINISTRATOR_ACCESS);

  await typeProductOfFirstLine(screen, "Yerba mate");
  await userEvent.click(screen.getByRole("option", { name: "Crear producto «Yerba mate»" }));

  const productDialog = screen.getByRole("dialog", { name: "Nuevo producto" });
  await expect.element(productDialog.getByText("Nombre tipeado: Yerba mate")).toBeVisible();
});

test("saving the stacked product selects it in that line and keeps the rest of the purchase as typed", async () => {
  const screen = await opened(createServices(), ADMINISTRATOR_ACCESS);
  await userEvent.fill(screen.getByRole("textbox", { name: /^Nota/ }), "Entrega de la tarde");
  const group = await typeProductOfFirstLine(screen, "Yerba mate");
  await userEvent.click(screen.getByRole("option", { name: "Crear producto «Yerba mate»" }));

  await userEvent.click(
    screen
      .getByRole("dialog", { name: "Nuevo producto" })
      .getByRole("button", { name: "Guardar lo creado" }),
  );

  await expect
    .poll(() => screen.getByRole("dialog", { name: "Nuevo producto" }).query())
    .toBeNull();
  await expect
    .element(group.getByRole("combobox", { name: /^Producto/ }))
    .toHaveValue("Yerba mate");
  await expect
    .element(screen.getByRole("textbox", { name: /^Nota/ }))
    .toHaveValue("Entrega de la tarde");
});

test("offers no product creation to a person who cannot manage products and categories", async () => {
  const screen = await opened(createServices(), accessWith("purchases", "suppliers"));

  await typeProductOfFirstLine(screen, "Yerba mate");

  await expect.element(screen.getByText("Sin resultados")).toBeVisible();
  expect(screen.getByRole("option", { name: /^Crear producto/ }).query()).toBeNull();
});

test("with no suppliers at all, still offers creating the first one and selects it once saved", async () => {
  const services = createServices({ suppliers: [] });
  vi.mocked(services.createSupplier).mockResolvedValue({ kind: "ok", supplier: distribuidoraSur });
  const screen = await opened(services, ADMINISTRATOR_ACCESS);
  await typeSupplier(screen, "Distribuidora Sur");
  await userEvent.click(
    screen.getByRole("option", { name: "Crear proveedor «Distribuidora Sur»" }),
  );

  await userEvent.click(
    screen
      .getByRole("dialog", { name: "Nuevo proveedor" })
      .getByRole("button", { name: "Crear el proveedor" }),
  );

  await expect
    .element(screen.getByRole("combobox", { name: /^Proveedor/ }))
    .toHaveValue("Distribuidora Sur");
});

test("with no suppliers at all and no way to create one, shows the empty state", async () => {
  const screen = await opened(
    createServices({ suppliers: [] }),
    accessWith("purchases", "stock_area"),
    (rendered) => rendered.getByText("No hay proveedores activos"),
  );

  await expect.element(screen.getByText("No hay proveedores activos")).toBeVisible();
});

test("with no products at all, still offers creating the first one in the line and selects it once saved", async () => {
  const screen = await opened(createServices({ products: [] }), ADMINISTRATOR_ACCESS);
  const group = await typeProductOfFirstLine(screen, "Yerba mate");
  await userEvent.click(screen.getByRole("option", { name: "Crear producto «Yerba mate»" }));

  await userEvent.click(
    screen
      .getByRole("dialog", { name: "Nuevo producto" })
      .getByRole("button", { name: "Guardar lo creado" }),
  );

  await expect
    .element(group.getByRole("combobox", { name: /^Producto/ }))
    .toHaveValue("Yerba mate");
  await expect.element(screen.getByRole("button", { name: "Registrar la compra" })).toBeEnabled();
});

test("with no products at all and no way to create one, shows the empty state", async () => {
  const screen = await opened(
    createServices({ products: [] }),
    accessWith("purchases", "suppliers"),
  );

  await expect.element(screen.getByText("No hay productos activos")).toBeVisible();
});

test("a product with no active packagings still offers creating one in the line, selected once saved", async () => {
  const services = createServices({ packagings: [] });
  vi.mocked(services.createPackaging).mockResolvedValue({ kind: "ok", packaging: cajaX6 });
  const screen = await opened(services, ADMINISTRATOR_ACCESS);
  const group = await openPackagingSelectorOfFirstLine(screen);

  await userEvent.fill(group.getByRole("combobox", { name: /^Presentación/ }), "Caja x 6");
  await userEvent.click(screen.getByRole("option", { name: "Crear presentación «Caja x 6»" }));
  const packagingDialog = screen.getByRole("dialog", { name: "Nueva presentación" });
  await userEvent.fill(
    packagingDialog.getByRole("textbox", { name: /^Cantidad por presentación/ }),
    "6",
  );
  await userEvent.click(packagingDialog.getByRole("button", { name: "Crear la presentación" }));

  await expect
    .element(group.getByRole("combobox", { name: /^Presentación/ }))
    .toHaveValue("Caja x 6 (6 u)");
});

test("a product with no active packagings shows the notice to a person who cannot manage purchase packagings", async () => {
  const screen = await opened(
    createServices({ packagings: [] }),
    accessWith("purchases", "suppliers"),
  );
  const group = screen.getByRole("group", { name: "Línea 1" });
  await userEvent.click(group.getByRole("combobox", { name: /^Producto/ }));
  (page.getByRole("option", { name: "Miel pura de abeja 1 kg" }).element() as HTMLElement).click();
  await userEvent.click(group.getByText("Presentación", { exact: true }).last());

  await expect
    .element(group.getByText("Este producto no tiene presentaciones activas"))
    .toBeVisible();
});
