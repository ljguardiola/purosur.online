import type { PurchaseSummary } from "@purosur/contracts";
import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import {
  CorrectPurchaseLineQuantityModal,
  type CorrectPurchaseLineQuantityModalServices,
  type PurchaseLineQuantityTarget,
} from "./correct-purchase-line-quantity-modal";
import { compraDeAvena, compraDeMiel } from "./test-support/purchases";

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

const [lineDeMiel] = compraDeMiel.lines;
const [lineDeAvena] = compraDeAvena.lines;
if (!lineDeMiel || !lineDeAvena) {
  throw new Error("test setup: a purchase has no line");
}

const miel: PurchaseLineQuantityTarget = { purchase: compraDeMiel, line: lineDeMiel };
const avena: PurchaseLineQuantityTarget = { purchase: compraDeAvena, line: lineDeAvena };

const corrected: PurchaseSummary = { ...compraDeMiel, purchasedOn: "2026-09-13" };

type Correct = CorrectPurchaseLineQuantityModalServices["correctPurchaseLineQuantity"];

function createServices(
  overrides: Partial<CorrectPurchaseLineQuantityModalServices> = {},
): CorrectPurchaseLineQuantityModalServices {
  return { correctPurchaseLineQuantity: vi.fn<Correct>(), ...overrides };
}

function servicesAnswering(outcome: Awaited<ReturnType<Correct>>) {
  const correctPurchaseLineQuantity = vi.fn<Correct>().mockResolvedValue(outcome);
  return { correctPurchaseLineQuantity, services: createServices({ correctPurchaseLineQuantity }) };
}

type ModalOptions = {
  target?: PurchaseLineQuantityTarget | null;
  remainingInLot?: number;
  services?: CorrectPurchaseLineQuantityModalServices;
  onSaved?: (purchase: PurchaseSummary) => void;
  onLotChanged?: () => void;
  onClose?: () => void;
  onSessionEnded?: () => void;
};

function modal({
  target = miel,
  remainingInLot = target?.line.remainingInLot ?? 0,
  services = createServices(),
  onSaved = () => {},
  onLotChanged = () => {},
  onClose = () => {},
  onSessionEnded = () => {},
}: ModalOptions = {}) {
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <CorrectPurchaseLineQuantityModal
          target={target}
          remainingInLot={remainingInLot}
          services={services}
          onSaved={onSaved}
          onLotChanged={onLotChanged}
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
  await expect.element(dialog.getByRole("textbox", { name: /^Cantidad/ })).toBeVisible();
  return dialog;
}

function amountInput(dialog: Awaited<ReturnType<typeof readyDialog>>) {
  return dialog.getByRole("textbox", { name: /^Cantidad/ });
}

async function save(screen: ModalScreen, amount?: string) {
  const dialog = await readyDialog(screen);
  if (amount !== undefined) {
    await userEvent.clear(amountInput(dialog));
    if (amount !== "") {
      await userEvent.type(amountInput(dialog), amount);
    }
  }
  await userEvent.click(dialog.getByRole("button", { name: "Guardar la cantidad" }));
  return dialog;
}

test("shows the product as the title, the packages of the line and what it holds", async () => {
  const screen = await renderModal();
  const dialog = await readyDialog(screen);

  await expect.element(dialog.getByText("Stock · Compra")).toBeVisible();
  await expect
    .element(dialog.getByRole("heading", { name: "Miel pura de abeja 1 kg" }))
    .toBeVisible();
  await expect
    .element(dialog.getByRole("textbox", { name: /^Cantidad de paquetes/ }))
    .toHaveValue("2");
  await expect
    .element(dialog.getByText("Cada paquete trae 12 u · Quedan 18 u en el lote"))
    .toBeVisible();
});

test("shows the quantity of a line loaded by quantity in kilos, with what remains in its lot", async () => {
  const screen = await renderModal({ target: avena });
  const dialog = await readyDialog(screen);

  await expect.element(amountInput(dialog)).toHaveValue("12,500");
  await expect.element(dialog.getByText("Quedan 12,500 kg en el lote")).toBeVisible();
});

test("shows what remains in the lot as the screen last read it", async () => {
  const screen = await renderModal({ remainingInLot: 3_000 });
  const dialog = await readyDialog(screen);

  await expect
    .element(dialog.getByText("Cada paquete trae 12 u · Quedan 3 u en el lote"))
    .toBeVisible();
});

test("saves the packages typed and hands the corrected purchase over", async () => {
  const { correctPurchaseLineQuantity, services } = servicesAnswering({
    kind: "ok",
    purchase: corrected,
  });
  const onSaved = vi.fn();
  const screen = await renderModal({ services, onSaved });

  await save(screen, "3");

  await expect.poll(() => onSaved.mock.calls).toEqual([[corrected]]);
  expect(correctPurchaseLineQuantity).toHaveBeenCalledWith(compraDeMiel.id, lineDeMiel.id, {
    loadedBy: "packages",
    packages: 3,
  });
});

test("sends kilos of a line loaded by quantity as stock units", async () => {
  const { correctPurchaseLineQuantity, services } = servicesAnswering({
    kind: "ok",
    purchase: compraDeAvena,
  });
  const screen = await renderModal({ target: avena, services });

  await save(screen, "10,5");

  await expect.poll(() => correctPurchaseLineQuantity.mock.calls.length).toBe(1);
  expect(correctPurchaseLineQuantity).toHaveBeenCalledWith(compraDeAvena.id, lineDeAvena.id, {
    loadedBy: "quantity",
    quantity: 10_500,
  });
});

test("asks for the packages without calling the cloud when none is typed", async () => {
  const { correctPurchaseLineQuantity, services } = servicesAnswering({
    kind: "ok",
    purchase: corrected,
  });
  const screen = await renderModal({ services });

  const dialog = await save(screen, "");

  await expect
    .element(dialog.getByText("Ingresá cuántos paquetes recibiste, en un número entero."))
    .toBeVisible();
  expect(correctPurchaseLineQuantity).not.toHaveBeenCalled();
});

test("starts from the line it opens for each time", async () => {
  const services = createServices();
  const screen = await renderModal({ target: miel, services });
  await readyDialog(screen);

  await screen.rerender(modal({ target: null, services }));
  await screen.rerender(modal({ target: avena, services }));

  const dialog = await readyDialog(screen);

  await expect.element(dialog.getByRole("heading", { name: "Avena arrollada" })).toBeVisible();
  await expect.element(amountInput(dialog)).toHaveValue("12,500");
});

test("says units already out of the lot cannot be taken back and asks for the lot again", async () => {
  const { services } = servicesAnswering({ kind: "not_enough_in_lot" });
  const onLotChanged = vi.fn();
  const onSaved = vi.fn();
  const screen = await renderModal({ services, onLotChanged, onSaved });

  const dialog = await save(screen, "1");

  await expect.element(dialog.getByText("No se corrigió la cantidad")).toBeVisible();
  await expect
    .element(
      dialog.getByText("Las unidades que ya salieron del lote no se pueden quitar de la compra."),
    )
    .toBeVisible();
  expect(onLotChanged).toHaveBeenCalledTimes(1);
  expect(onSaved).not.toHaveBeenCalled();
});

test("says the purchase no longer exists", async () => {
  const { services } = servicesAnswering({ kind: "not_found" });
  const screen = await renderModal({ services });

  const dialog = await save(screen, "3");

  await expect.element(dialog.getByRole("alert")).toHaveTextContent("Esta compra ya no existe");
});

test("shows a quantity the cloud refused on its field", async () => {
  const { services } = servicesAnswering({ kind: "validation_failed", field: "packages" });
  const screen = await renderModal({ services });

  const dialog = await save(screen, "3");

  await expect
    .element(dialog.getByText("Ingresá menos paquetes; son más de los que se pueden registrar."))
    .toBeVisible();
  expect(dialog.getByText("No se corrigió la cantidad").query()).toBeNull();
});

test("says there is nothing to save when the quantity is the one the line has, handing nothing over", async () => {
  const { services } = servicesAnswering({ kind: "unchanged" });
  const onSaved = vi.fn();
  const screen = await renderModal({ services, onSaved });

  const dialog = await save(screen);

  await expect.element(dialog.getByText("No hay cambios para guardar").first()).toBeVisible();
  expect(onSaved).not.toHaveBeenCalled();
});

test("cannot be closed while the correction is being saved", async () => {
  const correctPurchaseLineQuantity = vi.fn<Correct>().mockReturnValue(new Promise(() => {}));
  const screen = await renderModal({
    services: createServices({ correctPurchaseLineQuantity }),
  });

  const dialog = await save(screen, "3");

  await expect.element(dialog.getByRole("button", { name: "Cancelar" })).toBeDisabled();
  expect(dialog.getByRole("button", { name: "Cerrar" }).query()).toBeNull();
});

test("shows the failure notice", async () => {
  const { services } = servicesAnswering({ kind: "failed" });
  const screen = await renderModal({ services });

  const dialog = await save(screen, "3");

  await expect.element(dialog.getByText("No se corrigió la cantidad")).toBeVisible();
  await expect.element(dialog.getByText("Volvé a intentarlo.")).toBeVisible();
});

test("shows the rate-limited notice with the time to wait", async () => {
  const { services } = servicesAnswering({ kind: "rate_limited", retryAfterSeconds: 60 });
  const screen = await renderModal({ services });

  const dialog = await save(screen, "3");

  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
});

test("ends the session when saving finds no open session", async () => {
  const { services } = servicesAnswering({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const screen = await renderModal({ services, onSessionEnded });

  await save(screen, "3");

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("navigates to Mi cuenta when saving comes back forbidden", async () => {
  window.history.pushState(null, "", "/purchases");
  const { services } = servicesAnswering({ kind: "forbidden" });
  const screen = await renderModal({ services });

  await save(screen, "3");

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
  expect(services.correctPurchaseLineQuantity).not.toHaveBeenCalled();
});

test("has no accessibility violations", async () => {
  const screen = await renderModal();
  await readyDialog(screen);

  await expectNoAccessibilityViolations(screen.getByRole("dialog").element());
});
