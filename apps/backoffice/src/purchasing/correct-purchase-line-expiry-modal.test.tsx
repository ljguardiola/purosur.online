import type { PurchaseSummary } from "@purosur/contracts";
import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import {
  CorrectPurchaseLineExpiryModal,
  type CorrectPurchaseLineExpiryModalServices,
  type PurchaseLineExpiryTarget,
} from "./correct-purchase-line-expiry-modal";
import { compraDeAvena, compraDeMiel } from "./test-support/purchases";

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

const [lineDeMiel] = compraDeMiel.lines;
const [lineDeAvena] = compraDeAvena.lines;
if (!lineDeMiel || !lineDeAvena) {
  throw new Error("test setup: a purchase has no line");
}

const miel: PurchaseLineExpiryTarget = { purchase: compraDeMiel, line: lineDeMiel };
const avena: PurchaseLineExpiryTarget = { purchase: compraDeAvena, line: lineDeAvena };

const corrected: PurchaseSummary = {
  ...compraDeMiel,
  lines: [{ ...lineDeMiel, expiresOn: "2027-11-10" }],
};

function createServices(
  overrides: Partial<CorrectPurchaseLineExpiryModalServices> = {},
): CorrectPurchaseLineExpiryModalServices {
  return {
    correctPurchaseLineExpiry:
      vi.fn<CorrectPurchaseLineExpiryModalServices["correctPurchaseLineExpiry"]>(),
    ...overrides,
  };
}

type ModalOptions = {
  target?: PurchaseLineExpiryTarget | null;
  services?: CorrectPurchaseLineExpiryModalServices;
  onSaved?: (purchase: PurchaseSummary) => void;
  onClose?: () => void;
  onSessionEnded?: () => void;
};

function renderModal({
  target = miel,
  services = createServices(),
  onSaved = () => {},
  onClose = () => {},
  onSessionEnded = () => {},
}: ModalOptions = {}) {
  return render(
    <FieldSizeProvider size="backoffice">
      <main>
        <CorrectPurchaseLineExpiryModal
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
  await expect.element(dialog.getByRole("group", { name: /^Vencimiento/ })).toBeVisible();
  return dialog;
}

function expiryDay(dialog: Awaited<ReturnType<typeof readyDialog>>) {
  return dialog.getByRole("group", { name: /^Vencimiento/ }).getByRole("spinbutton");
}

async function save(screen: ModalScreen) {
  const dialog = await readyDialog(screen);
  await userEvent.click(dialog.getByRole("button", { name: "Guardar el vencimiento" }));
  return dialog;
}

test("shows the line's product as the title with its current expiry date filled", async () => {
  const screen = await renderModal();
  const dialog = await readyDialog(screen);

  await expect.element(dialog.getByText("Stock · Compra")).toBeVisible();
  await expect
    .element(dialog.getByRole("heading", { name: "Miel pura de abeja 1 kg" }))
    .toBeVisible();
  await expect
    .poll(() =>
      expiryDay(dialog)
        .all()
        .map((segment) => segment.element().textContent),
    )
    .toEqual(["31", "1", "2027"]);
});

test("saves the corrected date and hands the corrected purchase over", async () => {
  const correctPurchaseLineExpiry = vi
    .fn<CorrectPurchaseLineExpiryModalServices["correctPurchaseLineExpiry"]>()
    .mockResolvedValue({ kind: "ok", purchase: corrected });
  const onSaved = vi.fn();
  const screen = await renderModal({
    services: createServices({ correctPurchaseLineExpiry }),
    onSaved,
  });

  const dialog = await readyDialog(screen);
  await userEvent.click(expiryDay(dialog).first());
  await userEvent.keyboard("10112027");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar el vencimiento" }));

  await expect.poll(() => onSaved.mock.calls).toEqual([[corrected]]);
  expect(correctPurchaseLineExpiry).toHaveBeenCalledWith(compraDeMiel.id, lineDeMiel.id, {
    expiresOn: "2027-11-10",
  });
});

test("clears the expiry date of the line when the date is emptied", async () => {
  const correctPurchaseLineExpiry = vi
    .fn<CorrectPurchaseLineExpiryModalServices["correctPurchaseLineExpiry"]>()
    .mockResolvedValue({ kind: "ok", purchase: corrected });
  const screen = await renderModal({ services: createServices({ correctPurchaseLineExpiry }) });

  const dialog = await readyDialog(screen);
  for (const segment of expiryDay(dialog).all()) {
    await userEvent.click(segment);
    await userEvent.keyboard("{Backspace}{Backspace}{Backspace}{Backspace}");
  }
  await userEvent.click(dialog.getByRole("button", { name: "Guardar el vencimiento" }));

  await expect.poll(() => correctPurchaseLineExpiry.mock.calls.length).toBe(1);
  expect(correctPurchaseLineExpiry).toHaveBeenCalledWith(compraDeMiel.id, lineDeMiel.id, {
    expiresOn: null,
  });
});

test("starts from the line it opens for each time", async () => {
  const screen = await renderModal({ target: avena });
  const dialog = await readyDialog(screen);

  await expect.element(dialog.getByRole("heading", { name: "Avena arrollada" })).toBeVisible();
  await expect
    .poll(() =>
      expiryDay(dialog)
        .all()
        .map((segment) => segment.element().textContent),
    )
    .toEqual(["dd", "mm", "aaaa"]);
});

test("says the purchase no longer exists", async () => {
  const correctPurchaseLineExpiry = vi
    .fn<CorrectPurchaseLineExpiryModalServices["correctPurchaseLineExpiry"]>()
    .mockResolvedValue({ kind: "not_found" });
  const screen = await renderModal({ services: createServices({ correctPurchaseLineExpiry }) });

  const dialog = await save(screen);

  await expect.element(dialog.getByRole("alert")).toHaveTextContent("Esta compra ya no existe");
});

test("shows an expiry date the cloud refused on its field", async () => {
  const correctPurchaseLineExpiry = vi
    .fn<CorrectPurchaseLineExpiryModalServices["correctPurchaseLineExpiry"]>()
    .mockResolvedValue({ kind: "validation_failed", field: "expiresOn" });
  const screen = await renderModal({ services: createServices({ correctPurchaseLineExpiry }) });

  const dialog = await save(screen);

  await expect.element(dialog.getByText("Ingresá una fecha de vencimiento válida.")).toBeVisible();
  expect(dialog.getByText("No se corrigió el vencimiento").query()).toBeNull();
});

test("says there is nothing to save when the line already has that date, handing nothing over", async () => {
  const correctPurchaseLineExpiry = vi
    .fn<CorrectPurchaseLineExpiryModalServices["correctPurchaseLineExpiry"]>()
    .mockResolvedValue({ kind: "unchanged" });
  const onSaved = vi.fn();
  const screen = await renderModal({
    services: createServices({ correctPurchaseLineExpiry }),
    onSaved,
  });

  const dialog = await save(screen);

  await expect.element(dialog.getByText("No hay cambios para guardar").first()).toBeVisible();
  expect(onSaved).not.toHaveBeenCalled();
});

test("cannot be closed while the correction is being saved", async () => {
  const correctPurchaseLineExpiry = vi
    .fn<CorrectPurchaseLineExpiryModalServices["correctPurchaseLineExpiry"]>()
    .mockReturnValue(new Promise(() => {}));
  const screen = await renderModal({ services: createServices({ correctPurchaseLineExpiry }) });

  const dialog = await save(screen);

  await expect.element(dialog.getByRole("button", { name: "Cancelar" })).toBeDisabled();
  expect(dialog.getByRole("button", { name: "Cerrar" }).query()).toBeNull();
});

test("shows the failure notice", async () => {
  const correctPurchaseLineExpiry = vi
    .fn<CorrectPurchaseLineExpiryModalServices["correctPurchaseLineExpiry"]>()
    .mockResolvedValue({ kind: "failed" });
  const screen = await renderModal({ services: createServices({ correctPurchaseLineExpiry }) });

  const dialog = await save(screen);

  await expect.element(dialog.getByText("No se corrigió el vencimiento")).toBeVisible();
});

test("shows the rate-limited notice with the time to wait", async () => {
  const correctPurchaseLineExpiry = vi
    .fn<CorrectPurchaseLineExpiryModalServices["correctPurchaseLineExpiry"]>()
    .mockResolvedValue({ kind: "rate_limited", retryAfterSeconds: 60 });
  const screen = await renderModal({ services: createServices({ correctPurchaseLineExpiry }) });

  const dialog = await save(screen);

  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
});

test("ends the session when saving finds no open session", async () => {
  const correctPurchaseLineExpiry = vi
    .fn<CorrectPurchaseLineExpiryModalServices["correctPurchaseLineExpiry"]>()
    .mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const screen = await renderModal({
    services: createServices({ correctPurchaseLineExpiry }),
    onSessionEnded,
  });

  await save(screen);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("navigates to Mi cuenta when saving comes back forbidden", async () => {
  window.history.pushState(null, "", "/purchases");
  const correctPurchaseLineExpiry = vi
    .fn<CorrectPurchaseLineExpiryModalServices["correctPurchaseLineExpiry"]>()
    .mockResolvedValue({ kind: "forbidden" });
  const screen = await renderModal({ services: createServices({ correctPurchaseLineExpiry }) });

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
  expect(services.correctPurchaseLineExpiry).not.toHaveBeenCalled();
});

test("has no accessibility violations", async () => {
  const screen = await renderModal();
  await readyDialog(screen);

  await expectNoAccessibilityViolations(screen.getByRole("dialog").element());
});
