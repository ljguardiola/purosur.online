import type { PurchaseSummary } from "@purosur/contracts";
import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { StubProductCreationModal } from "../platform/test-support/creation-parts";
import { ADMINISTRATOR_ACCESS } from "../shell/test-support/backoffice-access";
import { render } from "../shell/test-support/render-with-router";
import {
  AddPurchaseLinesModal,
  type AddPurchaseLinesModalServices,
} from "./add-purchase-lines-modal";
import { fillQuantityLine, purchaseLine } from "./test-support/purchase-lines-fill";
import { AVENA_PRODUCT_ID } from "./test-support/purchase-products";
import { compraDeAvena, compraDeMiel, purchaseChoicesFrom } from "./test-support/purchases";

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

const withNewLine: PurchaseSummary = {
  ...compraDeMiel,
  lines: [...compraDeMiel.lines, ...compraDeAvena.lines],
};

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function createServices(
  overrides: Partial<AddPurchaseLinesModalServices> = {},
): AddPurchaseLinesModalServices {
  return {
    addPurchaseLines: vi.fn<AddPurchaseLinesModalServices["addPurchaseLines"]>(),
    fetchPurchaseChoices: vi
      .fn<AddPurchaseLinesModalServices["fetchPurchaseChoices"]>()
      .mockResolvedValue({ kind: "ok", value: purchaseChoicesFrom([]) }),
    ...overrides,
  };
}

type ModalOptions = {
  target?: PurchaseSummary | null;
  services?: AddPurchaseLinesModalServices;
  onSaved?: (purchase: PurchaseSummary) => void;
  onClose?: () => void;
  onSessionEnded?: () => void;
};

function modalElement({
  target = compraDeMiel,
  services = createServices(),
  onSaved = () => {},
  onClose = () => {},
  onSessionEnded = () => {},
}: ModalOptions = {}) {
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <AddPurchaseLinesModal
          target={target}
          access={ADMINISTRATOR_ACCESS}
          productCreationModal={StubProductCreationModal}
          services={services}
          onSaved={onSaved}
          onClose={onClose}
          onSessionEnded={onSessionEnded}
        />
      </main>
    </FieldSizeProvider>
  );
}

function renderModal(options: ModalOptions = {}) {
  return render(modalElement(options));
}

type ModalScreen = Awaited<ReturnType<typeof renderModal>>;

async function readyDialog(screen: ModalScreen) {
  const dialog = screen.getByRole("dialog");
  await expect.element(purchaseLine(dialog, 1)).toBeVisible();
  return dialog;
}

async function addAvenaLine(screen: ModalScreen) {
  const dialog = await readyDialog(screen);
  await fillQuantityLine(screen, dialog, {
    product: "Avena arrollada",
    quantity: "10",
    cost: "1.800",
  });
  return dialog;
}

async function save(screen: ModalScreen) {
  const dialog = await addAvenaLine(screen);
  await userEvent.click(dialog.getByRole("button", { name: "Agregar los productos" }));
  return dialog;
}

test("names the purchase the products are added to, and offers one empty line", async () => {
  const screen = await renderModal();
  const dialog = await readyDialog(screen);

  await expect.element(dialog.getByText("Stock · Compra · Distribuidora Andina")).toBeVisible();
  await expect.element(dialog.getByRole("heading", { name: "Agregar productos" })).toBeVisible();
  await expect.element(dialog.getByRole("combobox", { name: /^Producto/ })).toHaveValue("");
});

test("reads the products that can be purchased when it opens, not before", async () => {
  const services = createServices();
  const screen = await renderModal({ target: null, services });

  expect(services.fetchPurchaseChoices).not.toHaveBeenCalled();

  await screen.rerender(modalElement({ target: compraDeMiel, services }));

  await expect.poll(() => vi.mocked(services.fetchPurchaseChoices).mock.calls.length).toBe(1);
});

test("shows the loading placeholder while the products load, and holds the action", async () => {
  const choices =
    deferred<Awaited<ReturnType<AddPurchaseLinesModalServices["fetchPurchaseChoices"]>>>();
  const services = createServices({
    fetchPurchaseChoices: vi
      .fn<AddPurchaseLinesModalServices["fetchPurchaseChoices"]>()
      .mockReturnValue(choices.promise),
  });
  const screen = await renderModal({ services });

  await expect
    .element(screen.getByRole("dialog").getByRole("button", { name: "Agregar los productos" }))
    .toBeDisabled();
  expect(screen.getByRole("dialog").getByRole("combobox").query()).toBeNull();

  choices.resolve({ kind: "ok", value: purchaseChoicesFrom([]) });
  await readyDialog(screen);
});

test("asks for no lot on a line", async () => {
  const screen = await renderModal();
  const dialog = await readyDialog(screen);

  expect(purchaseLine(dialog, 1).getByRole("textbox", { name: /^Lote/ }).query()).toBeNull();
});

test("shows a load error with a retry action", async () => {
  const fetchPurchaseChoices = vi
    .fn<AddPurchaseLinesModalServices["fetchPurchaseChoices"]>()
    .mockResolvedValueOnce({ kind: "failed" })
    .mockResolvedValue({ kind: "ok", value: purchaseChoicesFrom([]) });
  const screen = await renderModal({ services: createServices({ fetchPurchaseChoices }) });
  const dialog = screen.getByRole("dialog");
  await expect.element(dialog.getByText("No pudimos abrir los productos")).toBeVisible();
  await expect
    .element(dialog.getByRole("button", { name: "Agregar los productos" }))
    .toBeDisabled();

  await userEvent.click(dialog.getByRole("button", { name: "Reintentar" }));

  await readyDialog(screen);
});

test("adds the lines to the purchase and hands the purchase over", async () => {
  const addPurchaseLines = vi
    .fn<AddPurchaseLinesModalServices["addPurchaseLines"]>()
    .mockResolvedValue({ kind: "ok", purchase: withNewLine });
  const onSaved = vi.fn();
  const screen = await renderModal({ services: createServices({ addPurchaseLines }), onSaved });

  await save(screen);

  await expect.poll(() => onSaved.mock.calls).toEqual([[withNewLine]]);
  expect(addPurchaseLines).toHaveBeenCalledWith(compraDeMiel.id, {
    lines: [
      {
        loadedBy: "quantity",
        productId: AVENA_PRODUCT_ID,
        quantity: 10_000,
        costPaidCents: 180_000,
        expiresOn: null,
      },
    ],
  });
});

test("goes to the prices to review the products of the lines chosen for it, as when registering", async () => {
  window.history.pushState(null, "", "/purchases");
  const addPurchaseLines = vi
    .fn<AddPurchaseLinesModalServices["addPurchaseLines"]>()
    .mockResolvedValue({ kind: "ok", purchase: withNewLine });
  const onSaved = vi.fn();
  const screen = await renderModal({ services: createServices({ addPurchaseLines }), onSaved });

  const dialog = await addAvenaLine(screen);
  await userEvent.click(purchaseLine(dialog, 1).getByText("Revisar el precio ahora"));
  await userEvent.click(dialog.getByRole("button", { name: "Agregar los productos" }));

  await expect.poll(() => window.location.pathname).toBe("/prices");
  expect(window.history.state).toMatchObject({ purchasedProductsToReview: [AVENA_PRODUCT_ID] });
  expect(onSaved).toHaveBeenCalledWith(withNewLine);
});

test("stays on the list when no line was chosen for review", async () => {
  window.history.pushState(null, "", "/purchases");
  const addPurchaseLines = vi
    .fn<AddPurchaseLinesModalServices["addPurchaseLines"]>()
    .mockResolvedValue({ kind: "ok", purchase: withNewLine });
  const onSaved = vi.fn();
  const screen = await renderModal({ services: createServices({ addPurchaseLines }), onSaved });

  await save(screen);

  await expect.poll(() => onSaved.mock.calls.length).toBe(1);
  expect(window.location.pathname).toBe("/purchases");
});

test("cannot be closed while the products are being added", async () => {
  const addPurchaseLines = vi
    .fn<AddPurchaseLinesModalServices["addPurchaseLines"]>()
    .mockReturnValue(new Promise(() => {}));
  const screen = await renderModal({ services: createServices({ addPurchaseLines }) });

  const dialog = await save(screen);

  await expect.element(dialog.getByRole("button", { name: "Cancelar" })).toBeDisabled();
  expect(dialog.getByRole("button", { name: "Cerrar" }).query()).toBeNull();
});

test("refuses a line without product with the message of the registration, without calling the cloud", async () => {
  const services = createServices();
  const screen = await renderModal({ services });

  const dialog = await readyDialog(screen);
  await userEvent.click(dialog.getByRole("button", { name: "Agregar los productos" }));

  await expect.element(dialog.getByText("Línea 1: Elegí el producto.")).toBeVisible();
  expect(services.addPurchaseLines).not.toHaveBeenCalled();
});

test.each([
  ["product_not_found", "Este producto ya no está disponible."],
  ["product_inactive", "Este producto ya no está activo."],
] as const)("shows a %s refusal on the line the cloud named", async (reason, message) => {
  const addPurchaseLines = vi
    .fn<AddPurchaseLinesModalServices["addPurchaseLines"]>()
    .mockResolvedValue({ kind: "line_refused", reason, lineIndex: 0 });
  const screen = await renderModal({ services: createServices({ addPurchaseLines }) });

  const dialog = await save(screen);

  await expect.element(purchaseLine(dialog, 1).getByText(message).first()).toBeVisible();
});

test("shows a quantity the cloud refused on the line it named, as when registering", async () => {
  const addPurchaseLines = vi
    .fn<AddPurchaseLinesModalServices["addPurchaseLines"]>()
    .mockResolvedValue({ kind: "validation_failed", field: "lines", lineIndex: 0 });
  const screen = await renderModal({ services: createServices({ addPurchaseLines }) });

  const dialog = await save(screen);

  await expect
    .element(
      purchaseLine(dialog, 1)
        .getByText(/Escribí los kilos con hasta 3 decimales/)
        .first(),
    )
    .toBeVisible();
});

test("says the purchase no longer exists", async () => {
  const addPurchaseLines = vi
    .fn<AddPurchaseLinesModalServices["addPurchaseLines"]>()
    .mockResolvedValue({ kind: "not_found" });
  const screen = await renderModal({ services: createServices({ addPurchaseLines }) });

  const dialog = await save(screen);

  await expect.element(dialog.getByRole("alert")).toHaveTextContent("Esta compra ya no existe");
});

test("shows the failure notice", async () => {
  const addPurchaseLines = vi
    .fn<AddPurchaseLinesModalServices["addPurchaseLines"]>()
    .mockResolvedValue({ kind: "failed" });
  const screen = await renderModal({ services: createServices({ addPurchaseLines }) });

  const dialog = await save(screen);

  await expect.element(dialog.getByText("No se agregaron los productos")).toBeVisible();
});

test("shows the rate-limited notice with the time to wait", async () => {
  const addPurchaseLines = vi
    .fn<AddPurchaseLinesModalServices["addPurchaseLines"]>()
    .mockResolvedValue({ kind: "rate_limited", retryAfterSeconds: 60 });
  const screen = await renderModal({ services: createServices({ addPurchaseLines }) });

  const dialog = await save(screen);

  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
});

test("ends the session when saving finds no open session", async () => {
  const addPurchaseLines = vi
    .fn<AddPurchaseLinesModalServices["addPurchaseLines"]>()
    .mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const screen = await renderModal({
    services: createServices({ addPurchaseLines }),
    onSessionEnded,
  });

  await save(screen);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("navigates to Mi cuenta when saving comes back forbidden", async () => {
  window.history.pushState(null, "", "/purchases");
  const addPurchaseLines = vi
    .fn<AddPurchaseLinesModalServices["addPurchaseLines"]>()
    .mockResolvedValue({ kind: "forbidden" });
  const screen = await renderModal({ services: createServices({ addPurchaseLines }) });

  await save(screen);

  await expect
    .poll(() => window.location.pathname + window.location.search)
    .toBe("/?account=credentials");
});

test("opens nothing without a purchase", async () => {
  const screen = await renderModal({ target: null });

  expect(screen.getByRole("dialog").query()).toBeNull();
});

test("cancel closes the modal without calling the cloud", async () => {
  const services = createServices();
  const onClose = vi.fn();
  const screen = await renderModal({ services, onClose });
  await readyDialog(screen);

  await userEvent.click(screen.getByRole("dialog").getByRole("button", { name: "Cancelar" }));

  expect(onClose).toHaveBeenCalledTimes(1);
  expect(services.addPurchaseLines).not.toHaveBeenCalled();
});

test("has no accessibility violations", async () => {
  const screen = await renderModal();
  await readyDialog(screen);

  await expectNoAccessibilityViolations(screen.getByRole("dialog").element());
});
