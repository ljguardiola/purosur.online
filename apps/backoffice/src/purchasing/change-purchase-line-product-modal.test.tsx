import type { PurchaseSummary } from "@purosur/contracts";
import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import {
  ChangePurchaseLineProductModal,
  type ChangePurchaseLineProductModalServices,
  type PurchaseLineProductTarget,
} from "./change-purchase-line-product-modal";
import { chooseProduct } from "./test-support/purchase-lines-fill";
import { AVENA_PRODUCT_ID } from "./test-support/purchase-products";
import { compraDeMiel, purchaseChoicesFrom } from "./test-support/purchases";

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

const [lineDeMiel] = compraDeMiel.lines;
if (!lineDeMiel) {
  throw new Error("test setup: a purchase has no line");
}

const miel: PurchaseLineProductTarget = { purchase: compraDeMiel, line: lineDeMiel };

const changed: PurchaseSummary = { ...compraDeMiel, purchasedOn: "2026-09-13" };

type Change = ChangePurchaseLineProductModalServices["changePurchaseLineProduct"];
type FetchChoices = ChangePurchaseLineProductModalServices["fetchPurchaseChoices"];

function createServices(
  overrides: Partial<ChangePurchaseLineProductModalServices> = {},
): ChangePurchaseLineProductModalServices {
  return {
    changePurchaseLineProduct: vi.fn<Change>(),
    fetchPurchaseChoices: vi
      .fn<FetchChoices>()
      .mockResolvedValue({ kind: "ok", value: purchaseChoicesFrom([]) }),
    ...overrides,
  };
}

function servicesAnswering(outcome: Awaited<ReturnType<Change>>) {
  const changePurchaseLineProduct = vi.fn<Change>().mockResolvedValue(outcome);
  return { changePurchaseLineProduct, services: createServices({ changePurchaseLineProduct }) };
}

type ModalOptions = {
  target?: PurchaseLineProductTarget | null;
  services?: ChangePurchaseLineProductModalServices;
  onSaved?: (purchase: PurchaseSummary) => void;
  onStale?: () => void;
  onClose?: () => void;
  onSessionEnded?: () => void;
};

function modal({
  target = miel,
  services = createServices(),
  onSaved = () => {},
  onStale = () => {},
  onClose = () => {},
  onSessionEnded = () => {},
}: ModalOptions = {}) {
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <ChangePurchaseLineProductModal
          target={target}
          services={services}
          onSaved={onSaved}
          onStale={onStale}
          onClose={onClose}
          onSessionEnded={onSessionEnded}
        />
      </main>
    </FieldSizeProvider>
  );
}

function renderModal(options: ModalOptions = {}) {
  return render(modal(options));
}

type ModalScreen = Awaited<ReturnType<typeof renderModal>>;

async function readyDialog(screen: ModalScreen) {
  const dialog = screen.getByRole("dialog");
  await expect.element(dialog.getByRole("combobox", { name: /^Producto/ })).toBeVisible();
  return dialog;
}

async function save(screen: ModalScreen, product?: string) {
  const dialog = await readyDialog(screen);
  if (product !== undefined) {
    await chooseProduct(screen, dialog, product);
  }
  await userEvent.click(dialog.getByRole("button", { name: "Cambiar el producto" }));
  return dialog;
}

test("shows the line's product as the title and offers the products to move it to", async () => {
  const screen = await renderModal();
  const dialog = await readyDialog(screen);

  await expect.element(dialog.getByText("Stock · Compra")).toBeVisible();
  await expect
    .element(dialog.getByRole("heading", { name: "Miel pura de abeja 1 kg" }))
    .toBeVisible();
  await expect.element(dialog.getByRole("combobox", { name: /^Producto/ })).toHaveValue("");
});

test("reads the products that can be purchased when it opens, not before", async () => {
  const services = createServices();
  const screen = await renderModal({ target: null, services });

  expect(services.fetchPurchaseChoices).not.toHaveBeenCalled();

  await screen.rerender(modal({ target: miel, services }));

  await expect.poll(() => vi.mocked(services.fetchPurchaseChoices).mock.calls.length).toBe(1);
});

test("shows the loading placeholder while the products load, and holds the action", async () => {
  const fetchPurchaseChoices = vi.fn<FetchChoices>().mockReturnValue(new Promise(() => {}));
  const screen = await renderModal({ services: createServices({ fetchPurchaseChoices }) });

  await expect
    .element(screen.getByRole("dialog").getByRole("button", { name: "Cambiar el producto" }))
    .toBeDisabled();
  expect(screen.getByRole("dialog").getByRole("combobox").query()).toBeNull();
});

test("shows a load error with a retry action", async () => {
  const fetchPurchaseChoices = vi
    .fn<FetchChoices>()
    .mockResolvedValueOnce({ kind: "failed" })
    .mockResolvedValue({ kind: "ok", value: purchaseChoicesFrom([]) });
  const screen = await renderModal({ services: createServices({ fetchPurchaseChoices }) });
  const dialog = screen.getByRole("dialog");
  await expect.element(dialog.getByText("No pudimos abrir los productos")).toBeVisible();
  await expect.element(dialog.getByRole("button", { name: "Cambiar el producto" })).toBeDisabled();

  await userEvent.click(dialog.getByRole("button", { name: "Reintentar" }));

  await readyDialog(screen);
});

test("moves the line to the product chosen and hands the purchase over", async () => {
  const { changePurchaseLineProduct, services } = servicesAnswering({
    kind: "ok",
    purchase: changed,
  });
  const onSaved = vi.fn();
  const screen = await renderModal({ services, onSaved });

  await save(screen, "Avena arrollada");

  await expect.poll(() => onSaved.mock.calls).toEqual([[changed]]);
  expect(changePurchaseLineProduct).toHaveBeenCalledWith(compraDeMiel.id, lineDeMiel.id, {
    productId: AVENA_PRODUCT_ID,
  });
});

test("saves with Ctrl+Enter", async () => {
  const { changePurchaseLineProduct, services } = servicesAnswering({
    kind: "ok",
    purchase: changed,
  });
  const screen = await renderModal({ services });
  const dialog = await readyDialog(screen);
  await chooseProduct(screen, dialog, "Avena arrollada");

  await userEvent.keyboard("{Control>}{Enter}{/Control}");

  await expect.poll(() => changePurchaseLineProduct.mock.calls.length).toBe(1);
});

test("asks to choose the product without calling the cloud when none is chosen", async () => {
  const { changePurchaseLineProduct, services } = servicesAnswering({
    kind: "ok",
    purchase: changed,
  });
  const screen = await renderModal({ services });

  const dialog = await save(screen);

  await expect.element(dialog.getByText("Elegí el producto.")).toBeVisible();
  expect(changePurchaseLineProduct).not.toHaveBeenCalled();
});

test("starts from the line it opens for each time", async () => {
  const services = createServices();
  const screen = await renderModal({ services });
  const dialog = await readyDialog(screen);
  await chooseProduct(screen, dialog, "Avena arrollada");

  await screen.rerender(modal({ target: null, services }));
  await screen.rerender(modal({ target: miel, services }));

  await expect
    .element((await readyDialog(screen)).getByRole("combobox", { name: /^Producto/ }))
    .toHaveValue("");
});

test.each([
  [
    "units_left_lot",
    "Ya salieron unidades del lote de esta línea; corregí el stock con un ajuste.",
  ],
  [
    "counted_since_receipt",
    "Se contó el stock después de recibir la compra; corregí el stock con un ajuste.",
  ],
  ["product_inactive", "Este producto ya no está activo. Elegí otro."],
  ["product_not_found", "Este producto ya no está disponible. Elegí otro."],
] as const)(
  "says why a %s refusal changed nothing and asks for the purchases again",
  async (kind, description) => {
    const { services } = servicesAnswering({ kind });
    const onStale = vi.fn();
    const onSaved = vi.fn();
    const screen = await renderModal({ services, onStale, onSaved });

    const dialog = await save(screen, "Avena arrollada");

    await expect.element(dialog.getByText("No se cambió el producto")).toBeVisible();
    await expect.element(dialog.getByText(description)).toBeVisible();
    expect(onStale).toHaveBeenCalledTimes(1);
    expect(onSaved).not.toHaveBeenCalled();
  },
);

test("says the purchase no longer exists", async () => {
  const { services } = servicesAnswering({ kind: "not_found" });
  const screen = await renderModal({ services });

  const dialog = await save(screen, "Avena arrollada");

  await expect.element(dialog.getByRole("alert")).toHaveTextContent("Esta compra ya no existe");
});

test("shows a quantity the product cannot take on its field", async () => {
  const { services } = servicesAnswering({ kind: "validation_failed", field: "productId" });
  const screen = await renderModal({ services });

  const dialog = await save(screen, "Avena arrollada");

  await expect
    .element(
      dialog.getByText("Este producto no se puede recibir en la cantidad de la línea. Elegí otro."),
    )
    .toBeVisible();
  expect(dialog.getByText("No se cambió el producto").query()).toBeNull();
});

test("says there is nothing to change when the product is the one the line has", async () => {
  const { services } = servicesAnswering({ kind: "unchanged" });
  const onSaved = vi.fn();
  const screen = await renderModal({ services, onSaved });

  const dialog = await save(screen, "Miel pura de abeja 1 kg");

  await expect.element(dialog.getByText("No hay cambios para guardar").first()).toBeVisible();
  expect(onSaved).not.toHaveBeenCalled();
});

test("cannot be closed while the change is being saved", async () => {
  const changePurchaseLineProduct = vi.fn<Change>().mockReturnValue(new Promise(() => {}));
  const screen = await renderModal({ services: createServices({ changePurchaseLineProduct }) });

  const dialog = await save(screen, "Avena arrollada");

  await expect.element(dialog.getByRole("button", { name: "Cancelar" })).toBeDisabled();
  expect(dialog.getByRole("button", { name: "Cerrar" }).query()).toBeNull();
});

test("shows the failure notice", async () => {
  const { services } = servicesAnswering({ kind: "failed" });
  const screen = await renderModal({ services });

  const dialog = await save(screen, "Avena arrollada");

  await expect.element(dialog.getByText("No se cambió el producto")).toBeVisible();
  await expect.element(dialog.getByText("Volvé a intentarlo.")).toBeVisible();
});

test("shows the rate-limited notice with the time to wait", async () => {
  const { services } = servicesAnswering({ kind: "rate_limited", retryAfterSeconds: 60 });
  const screen = await renderModal({ services });

  const dialog = await save(screen, "Avena arrollada");

  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
});

test("ends the session when saving finds no open session", async () => {
  const { services } = servicesAnswering({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const screen = await renderModal({ services, onSessionEnded });

  await save(screen, "Avena arrollada");

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("navigates to Mi cuenta when saving comes back forbidden", async () => {
  window.history.pushState(null, "", "/purchases");
  const { services } = servicesAnswering({ kind: "forbidden" });
  const screen = await renderModal({ services });

  await save(screen, "Avena arrollada");

  await expect
    .poll(() => window.location.pathname + window.location.search)
    .toBe("/?account=credentials");
});

test("opens nothing without a line", async () => {
  const screen = await renderModal({ target: null });

  expect(screen.getByRole("dialog").query()).toBeNull();
});

test("cancel closes the modal without calling the cloud", async () => {
  const services = createServices();
  const onClose = vi.fn();
  const screen = await renderModal({ services, onClose });

  await userEvent.click(screen.getByRole("dialog").getByRole("button", { name: "Cancelar" }));

  expect(onClose).toHaveBeenCalledTimes(1);
  expect(services.changePurchaseLineProduct).not.toHaveBeenCalled();
});

test("has no accessibility violations", async () => {
  const screen = await renderModal();
  await readyDialog(screen);

  await expectNoAccessibilityViolations(screen.getByRole("dialog").element());
});
