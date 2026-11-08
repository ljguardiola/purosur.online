import type { PurchaseSummary } from "@purosur/contracts";
import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import {
  SplitPurchaseLineExpiryModal,
  type SplitPurchaseLineExpiryModalServices,
  type SplitPurchaseLineExpiryTarget,
} from "./split-purchase-line-expiry-modal";
import { compraDeAvena, compraDeMiel } from "./test-support/purchases";

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

const [lineDeMiel] = compraDeMiel.lines;
const [lineDeAvena] = compraDeAvena.lines;
if (!lineDeMiel || !lineDeAvena) {
  throw new Error("test setup: a purchase has no line");
}

const miel: SplitPurchaseLineExpiryTarget = { purchase: compraDeMiel, line: lineDeMiel };
const avena: SplitPurchaseLineExpiryTarget = { purchase: compraDeAvena, line: lineDeAvena };

const corrected: PurchaseSummary = {
  ...compraDeMiel,
  lines: [{ ...lineDeMiel, remainingInLot: 17_000 }],
};

type Split = SplitPurchaseLineExpiryModalServices["splitPurchaseLineExpiry"];

function createServices(
  overrides: Partial<SplitPurchaseLineExpiryModalServices> = {},
): SplitPurchaseLineExpiryModalServices {
  return { splitPurchaseLineExpiry: vi.fn<Split>(), ...overrides };
}

function servicesAnswering(outcome: Awaited<ReturnType<Split>>) {
  const splitPurchaseLineExpiry = vi.fn<Split>().mockResolvedValue(outcome);
  return { splitPurchaseLineExpiry, services: createServices({ splitPurchaseLineExpiry }) };
}

type ModalOptions = {
  target?: SplitPurchaseLineExpiryTarget | null;
  remainingInLot?: number;
  services?: SplitPurchaseLineExpiryModalServices;
  onSaved?: (purchase: PurchaseSummary) => void;
  onLotChanged?: () => void;
  onClose?: () => void;
  onSessionEnded?: () => void;
};

function renderModal({
  target = miel,
  remainingInLot = target?.line.remainingInLot ?? 0,
  services = createServices(),
  onSaved = () => {},
  onLotChanged = () => {},
  onClose = () => {},
  onSessionEnded = () => {},
}: ModalOptions = {}) {
  return render(
    <FieldSizeProvider size="backoffice">
      <main>
        <SplitPurchaseLineExpiryModal
          target={target}
          remainingInLot={remainingInLot}
          services={services}
          onSaved={onSaved}
          onLotChanged={onLotChanged}
          onClose={onClose}
          onSessionEnded={onSessionEnded}
        />
      </main>
    </FieldSizeProvider>,
  );
}

type ModalScreen = Awaited<ReturnType<typeof renderModal>>;

async function readyDialog(screen: ModalScreen) {
  const dialog = screen.getByRole("dialog");
  await expect.element(dialog.getByRole("group", { name: /^Vencimiento/ })).toBeVisible();
  return dialog;
}

function quantityInput(dialog: Awaited<ReturnType<typeof readyDialog>>) {
  return dialog.getByRole("textbox", { name: /^Cantidad/ });
}

function expiryDay(dialog: Awaited<ReturnType<typeof readyDialog>>) {
  return dialog.getByRole("group", { name: /^Vencimiento/ }).getByRole("spinbutton");
}

async function fill(screen: ModalScreen, quantity: string) {
  const dialog = await readyDialog(screen);
  if (quantity !== "") {
    await userEvent.type(quantityInput(dialog), quantity);
  }
  await userEvent.click(expiryDay(dialog).first());
  await userEvent.keyboard("10112027");
  return dialog;
}

async function save(screen: ModalScreen, quantity = "1") {
  const dialog = await fill(screen, quantity);
  await userEvent.click(dialog.getByRole("button", { name: "Guardar el vencimiento" }));
  return dialog;
}

test("shows the product as the title, what remains in its lot and the line's expiry date", async () => {
  const screen = await renderModal();
  const dialog = await readyDialog(screen);

  await expect.element(dialog.getByText("Compras · Compra")).toBeVisible();
  await expect
    .element(dialog.getByRole("heading", { name: "Miel pura de abeja 1 kg" }))
    .toBeVisible();
  await expect.element(dialog.getByText("Quedan 18 u en el lote")).toBeVisible();
  await expect
    .poll(() =>
      expiryDay(dialog)
        .all()
        .map((segment) => segment.element().textContent),
    )
    .toEqual(["31", "1", "2027"]);
});

test("shows what remains of a product sold by weight in kilos", async () => {
  const screen = await renderModal({ target: avena });
  const dialog = await readyDialog(screen);

  await expect.element(dialog.getByText("Quedan 12,500 kg en el lote")).toBeVisible();
});

test("saves the quantity of units with the date and hands the corrected purchase over", async () => {
  const { splitPurchaseLineExpiry, services } = servicesAnswering({
    kind: "ok",
    purchase: corrected,
  });
  const onSaved = vi.fn();
  const screen = await renderModal({ services, onSaved });

  await save(screen);

  await expect.poll(() => onSaved.mock.calls).toEqual([[corrected]]);
  expect(splitPurchaseLineExpiry).toHaveBeenCalledWith(compraDeMiel.id, lineDeMiel.id, {
    quantity: 1_000,
    expiresOn: "2027-11-10",
  });
});

test("sends kilos of a product sold by weight as stock units", async () => {
  const { splitPurchaseLineExpiry, services } = servicesAnswering({
    kind: "ok",
    purchase: compraDeAvena,
  });
  const screen = await renderModal({ target: avena, services });

  await save(screen, "2,5");

  await expect.poll(() => splitPurchaseLineExpiry.mock.calls.length).toBe(1);
  expect(splitPurchaseLineExpiry).toHaveBeenCalledWith(compraDeAvena.id, lineDeAvena.id, {
    quantity: 2_500,
    expiresOn: "2027-11-10",
  });
});

test("asks for a quantity without calling the cloud when none is typed", async () => {
  const { splitPurchaseLineExpiry, services } = servicesAnswering({
    kind: "ok",
    purchase: corrected,
  });
  const screen = await renderModal({ services });

  const dialog = await save(screen, "");

  await expect
    .element(dialog.getByText("Escribí una cantidad entera de unidades, por ejemplo 16."))
    .toBeVisible();
  expect(splitPurchaseLineExpiry).not.toHaveBeenCalled();
});

test("starts from the line it opens for each time", async () => {
  const screen = await renderModal({ target: avena });
  const dialog = await readyDialog(screen);

  await expect.element(dialog.getByRole("heading", { name: "Avena arrollada" })).toBeVisible();
  await expect.element(quantityInput(dialog)).toHaveValue("");
  await expect
    .poll(() =>
      expiryDay(dialog)
        .all()
        .map((segment) => segment.element().textContent),
    )
    .toEqual(["dd", "mm", "aaaa"]);
});

test("shows what remains in the lot as the screen last read it", async () => {
  const screen = await renderModal({ remainingInLot: 3_000 });
  const dialog = await readyDialog(screen);

  await expect.element(dialog.getByText("Quedan 3 u en el lote")).toBeVisible();
});

test("says only some of the units in the lot can take another date and asks for the lot again", async () => {
  const { services } = servicesAnswering({ kind: "not_enough_in_lot" });
  const onLotChanged = vi.fn();
  const screen = await renderModal({ services, onLotChanged });

  const dialog = await save(screen);

  await expect.element(dialog.getByText("No se corrigió el vencimiento")).toBeVisible();
  await expect
    .element(
      dialog.getByText(
        "Solo se puede dar otra fecha a menos unidades de las que quedan en el lote.",
      ),
    )
    .toBeVisible();
  expect(onLotChanged).toHaveBeenCalledTimes(1);
});

test("says the purchase no longer exists", async () => {
  const { services } = servicesAnswering({ kind: "not_found" });
  const screen = await renderModal({ services });

  const dialog = await save(screen);

  await expect.element(dialog.getByRole("alert")).toHaveTextContent("Esta compra ya no existe");
});

test("shows a quantity the cloud refused on its field", async () => {
  const { services } = servicesAnswering({ kind: "validation_failed", field: "quantity" });
  const screen = await renderModal({ services });

  const dialog = await save(screen);

  await expect
    .element(dialog.getByText("Escribí una cantidad entera de unidades, por ejemplo 16."))
    .toBeVisible();
  expect(dialog.getByText("No se corrigió el vencimiento").query()).toBeNull();
});

test("says there is nothing to save when the units already have that date, handing nothing over", async () => {
  const { services } = servicesAnswering({ kind: "unchanged" });
  const onSaved = vi.fn();
  const screen = await renderModal({ services, onSaved });

  const dialog = await save(screen);

  await expect.element(dialog.getByText("No hay cambios para guardar").first()).toBeVisible();
  expect(onSaved).not.toHaveBeenCalled();
});

test("cannot be closed while the correction is being saved", async () => {
  const splitPurchaseLineExpiry = vi.fn<Split>().mockReturnValue(new Promise(() => {}));
  const screen = await renderModal({ services: createServices({ splitPurchaseLineExpiry }) });

  const dialog = await save(screen);

  await expect.element(dialog.getByRole("button", { name: "Cancelar" })).toBeDisabled();
  expect(dialog.getByRole("button", { name: "Cerrar" }).query()).toBeNull();
});

test("shows the failure notice", async () => {
  const { services } = servicesAnswering({ kind: "failed" });
  const screen = await renderModal({ services });

  const dialog = await save(screen);

  await expect.element(dialog.getByText("No se corrigió el vencimiento")).toBeVisible();
  await expect.element(dialog.getByText("Volvé a intentarlo.")).toBeVisible();
});

test("shows the rate-limited notice with the time to wait", async () => {
  const { services } = servicesAnswering({ kind: "rate_limited", retryAfterSeconds: 60 });
  const screen = await renderModal({ services });

  const dialog = await save(screen);

  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
});

test("ends the session when saving finds no open session", async () => {
  const { services } = servicesAnswering({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const screen = await renderModal({ services, onSessionEnded });

  await save(screen);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("navigates to Mi cuenta when saving comes back forbidden", async () => {
  window.history.pushState(null, "", "/purchases");
  const { services } = servicesAnswering({ kind: "forbidden" });
  const screen = await renderModal({ services });

  await save(screen);

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
  expect(services.splitPurchaseLineExpiry).not.toHaveBeenCalled();
});

test("has no accessibility violations", async () => {
  const screen = await renderModal();
  await readyDialog(screen);

  await expectNoAccessibilityViolations(screen.getByRole("dialog").element());
});
