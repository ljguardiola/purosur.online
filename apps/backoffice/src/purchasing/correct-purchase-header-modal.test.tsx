import type { PurchaseSummary } from "@purosur/contracts";
import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import {
  CorrectPurchaseHeaderModal,
  type CorrectPurchaseHeaderModalServices,
} from "./correct-purchase-header-modal";
import { compraDeAvena, compraDeMiel } from "./test-support/purchases";

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

const corrected: PurchaseSummary = { ...compraDeMiel, purchasedOn: "2026-09-13" };

function createServices(
  overrides: Partial<CorrectPurchaseHeaderModalServices> = {},
): CorrectPurchaseHeaderModalServices {
  return {
    correctPurchaseHeader: vi.fn<CorrectPurchaseHeaderModalServices["correctPurchaseHeader"]>(),
    ...overrides,
  };
}

type ModalOptions = {
  target?: PurchaseSummary | null;
  services?: CorrectPurchaseHeaderModalServices;
  onSaved?: (purchase: PurchaseSummary) => void;
  onClose?: () => void;
  onSessionEnded?: () => void;
};

function renderModal({
  target = compraDeMiel,
  services = createServices(),
  onSaved = () => {},
  onClose = () => {},
  onSessionEnded = () => {},
}: ModalOptions = {}) {
  return render(
    <FieldSizeProvider size="backoffice">
      <main>
        <CorrectPurchaseHeaderModal
          target={target}
          services={services}
          onSaved={onSaved}
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
  await expect.element(dialog.getByRole("group", { name: /^Fecha de compra/ })).toBeVisible();
  return dialog;
}

type Dialog = Awaited<ReturnType<typeof readyDialog>>;

async function chooseReceiptType(screen: ModalScreen, dialog: Dialog, name: string) {
  await userEvent.click(dialog.getByRole("button", { name: /Tipo de comprobante/ }));
  await userEvent.click(screen.getByRole("option", { name }));
}

async function save(screen: ModalScreen) {
  const dialog = await readyDialog(screen);
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));
  return dialog;
}

test("shows the supplier as the title, with the purchase's date, receipt and note filled", async () => {
  const screen = await renderModal({ target: { ...compraDeMiel, note: "Llegó tarde" } });
  const dialog = await readyDialog(screen);

  await expect.element(dialog.getByText("Stock · Compra")).toBeVisible();
  await expect.element(dialog.getByRole("heading", { name: "Distribuidora Andina" })).toBeVisible();
  await expect
    .poll(() =>
      dialog
        .getByRole("group", { name: /^Fecha de compra/ })
        .getByRole("spinbutton")
        .all()
        .map((segment) => segment.element().textContent),
    )
    .toEqual(["14", "9", "2026"]);
  await expect
    .element(dialog.getByRole("button", { name: /Tipo de comprobante/ }))
    .toHaveTextContent("Factura B");
  await expect
    .element(dialog.getByRole("textbox", { name: /^Número de comprobante/ }))
    .toHaveValue("0001-00001234");
  await expect.element(dialog.getByRole("textbox", { name: /^Nota/ })).toHaveValue("Llegó tarde");
});

test("starts a purchase without receipt or note with empty texts", async () => {
  const screen = await renderModal({ target: compraDeAvena });
  const dialog = await readyDialog(screen);

  await expect
    .element(dialog.getByRole("textbox", { name: /^Número de comprobante/ }))
    .toHaveValue("");
  await expect
    .element(dialog.getByRole("button", { name: /Tipo de comprobante/ }))
    .toHaveTextContent("Sin comprobante");
});

test("saves the corrected header and hands the corrected purchase over", async () => {
  const correctPurchaseHeader = vi
    .fn<CorrectPurchaseHeaderModalServices["correctPurchaseHeader"]>()
    .mockResolvedValue({ kind: "ok", purchase: corrected });
  const onSaved = vi.fn();
  const screen = await renderModal({
    services: createServices({ correctPurchaseHeader }),
    onSaved,
  });

  const dialog = await readyDialog(screen);
  await userEvent.click(
    dialog
      .getByRole("group", { name: /^Fecha de compra/ })
      .getByRole("spinbutton")
      .first(),
  );
  await userEvent.keyboard("13092026");
  await userEvent.fill(
    dialog.getByRole("textbox", { name: /^Número de comprobante/ }),
    "0001-00001243",
  );
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nota/ }), " Llegó a la mañana ");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.poll(() => onSaved.mock.calls).toEqual([[corrected]]);
  expect(correctPurchaseHeader).toHaveBeenCalledWith(compraDeMiel.id, {
    purchasedOn: "2026-09-13",
    receiptType: "factura_b",
    receiptNumber: "0001-00001243",
    note: "Llegó a la mañana",
  });
});

test("sends a receipt type and number together, and no number for a purchase without receipt", async () => {
  const correctPurchaseHeader = vi
    .fn<CorrectPurchaseHeaderModalServices["correctPurchaseHeader"]>()
    .mockResolvedValue({ kind: "ok", purchase: corrected });
  const screen = await renderModal({ services: createServices({ correctPurchaseHeader }) });

  const dialog = await readyDialog(screen);
  await chooseReceiptType(screen, dialog, "Sin comprobante");
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Número de comprobante/ }), "");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.poll(() => correctPurchaseHeader.mock.calls.length).toBe(1);
  expect(correctPurchaseHeader).toHaveBeenCalledWith(compraDeMiel.id, {
    purchasedOn: "2026-09-14",
    receiptType: "sin_comprobante",
    receiptNumber: null,
    note: null,
  });
});

test("refuses a number on a purchase without receipt, as when registering, without calling the cloud", async () => {
  const services = createServices();
  const screen = await renderModal({ services });

  const dialog = await readyDialog(screen);
  await chooseReceiptType(screen, dialog, "Sin comprobante");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect
    .element(dialog.getByText("Una compra sin comprobante no lleva número."))
    .toBeVisible();
  expect(services.correctPurchaseHeader).not.toHaveBeenCalled();
});

test("refuses a receipt without number, as when registering", async () => {
  const services = createServices();
  const screen = await renderModal({ services });

  const dialog = await readyDialog(screen);
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Número de comprobante/ }), "");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.element(dialog.getByText("Ingresá el número del comprobante.")).toBeVisible();
  expect(services.correctPurchaseHeader).not.toHaveBeenCalled();
});

test("shows a date in the future the cloud refused with the message of the registration", async () => {
  const correctPurchaseHeader = vi
    .fn<CorrectPurchaseHeaderModalServices["correctPurchaseHeader"]>()
    .mockResolvedValue({ kind: "validation_failed", field: "purchasedOn" });
  const screen = await renderModal({ services: createServices({ correctPurchaseHeader }) });

  const dialog = await save(screen);

  await expect
    .element(dialog.getByText("La fecha de compra no puede ser posterior a hoy."))
    .toBeVisible();
});

test("says there is nothing to save when the purchase already has those data, handing nothing over", async () => {
  const correctPurchaseHeader = vi
    .fn<CorrectPurchaseHeaderModalServices["correctPurchaseHeader"]>()
    .mockResolvedValue({ kind: "unchanged" });
  const onSaved = vi.fn();
  const screen = await renderModal({
    services: createServices({ correctPurchaseHeader }),
    onSaved,
  });

  const dialog = await save(screen);

  await expect.element(dialog.getByText("No hay cambios para guardar").first()).toBeVisible();
  expect(onSaved).not.toHaveBeenCalled();
});

test("cannot be closed while the correction is being saved", async () => {
  const correctPurchaseHeader = vi
    .fn<CorrectPurchaseHeaderModalServices["correctPurchaseHeader"]>()
    .mockReturnValue(new Promise(() => {}));
  const screen = await renderModal({ services: createServices({ correctPurchaseHeader }) });

  const dialog = await save(screen);

  await expect.element(dialog.getByRole("button", { name: "Cancelar" })).toBeDisabled();
  expect(dialog.getByRole("button", { name: "Cerrar" }).query()).toBeNull();
});

test("says the purchase no longer exists", async () => {
  const correctPurchaseHeader = vi
    .fn<CorrectPurchaseHeaderModalServices["correctPurchaseHeader"]>()
    .mockResolvedValue({ kind: "not_found" });
  const screen = await renderModal({ services: createServices({ correctPurchaseHeader }) });

  const dialog = await save(screen);

  await expect.element(dialog.getByRole("alert")).toHaveTextContent("Esta compra ya no existe");
});

test("shows the failure notice", async () => {
  const correctPurchaseHeader = vi
    .fn<CorrectPurchaseHeaderModalServices["correctPurchaseHeader"]>()
    .mockResolvedValue({ kind: "failed" });
  const screen = await renderModal({ services: createServices({ correctPurchaseHeader }) });

  const dialog = await save(screen);

  await expect.element(dialog.getByText("No se corrigieron los datos")).toBeVisible();
});

test("shows the rate-limited notice with the time to wait", async () => {
  const correctPurchaseHeader = vi
    .fn<CorrectPurchaseHeaderModalServices["correctPurchaseHeader"]>()
    .mockResolvedValue({ kind: "rate_limited", retryAfterSeconds: 60 });
  const screen = await renderModal({ services: createServices({ correctPurchaseHeader }) });

  const dialog = await save(screen);

  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
});

test("ends the session when saving finds no open session", async () => {
  const correctPurchaseHeader = vi
    .fn<CorrectPurchaseHeaderModalServices["correctPurchaseHeader"]>()
    .mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const screen = await renderModal({
    services: createServices({ correctPurchaseHeader }),
    onSessionEnded,
  });

  await save(screen);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("navigates to Mi cuenta when saving comes back forbidden", async () => {
  window.history.pushState(null, "", "/purchases");
  const correctPurchaseHeader = vi
    .fn<CorrectPurchaseHeaderModalServices["correctPurchaseHeader"]>()
    .mockResolvedValue({ kind: "forbidden" });
  const screen = await renderModal({ services: createServices({ correctPurchaseHeader }) });

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

  await userEvent.click(screen.getByRole("dialog").getByRole("button", { name: "Cancelar" }));

  expect(onClose).toHaveBeenCalledTimes(1);
  expect(services.correctPurchaseHeader).not.toHaveBeenCalled();
});

test("has no accessibility violations", async () => {
  const screen = await renderModal();
  await readyDialog(screen);

  await expectNoAccessibilityViolations(screen.getByRole("dialog").element());
});
